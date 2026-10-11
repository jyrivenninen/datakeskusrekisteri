-- Hanke–organisaatio-rooli ehdotusjonoon; organisaatioille URL-slug konsulttisivuille.

-- ---------------------------------------------------------------------------
-- organisaatiot.slug
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION johda_organisaatio_slug(p_nimi text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both '-' FROM regexp_replace(
      regexp_replace(
        lower(translate(trim(p_nimi), 'ÄÖÅÜÉäöåüé', 'aoaueaoaue')),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '-{2,}',
      '-',
      'g'
    )),
    ''
  );
$$;

ALTER TABLE organisaatiot
  ADD COLUMN IF NOT EXISTS slug text;

-- Lähdetriggeri estää ALTER/UPDATE-yhdistelmän samassa transaktiossa.
ALTER TABLE organisaatiot DISABLE TRIGGER USER;

UPDATE organisaatiot
SET slug = johda_organisaatio_slug(nimi)
WHERE slug IS NULL;

-- Törmäykset: lisää lyhyt id-pätkä.
UPDATE organisaatiot o
SET slug = johda_organisaatio_slug(o.nimi) || '-' || substr(replace(o.id::text, '-', ''), 1, 8)
WHERE o.slug IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM organisaatiot o2
    WHERE o2.slug = o.slug AND o2.id <> o.id
  );

ALTER TABLE organisaatiot
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE organisaatiot ENABLE TRIGGER USER;

ALTER TABLE organisaatiot
  DROP CONSTRAINT IF EXISTS organisaatiot_slug_muoto,
  DROP CONSTRAINT IF EXISTS organisaatiot_slug_yksilollinen;

ALTER TABLE organisaatiot
  ADD CONSTRAINT organisaatiot_slug_muoto CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  ADD CONSTRAINT organisaatiot_slug_yksilollinen UNIQUE (slug);

CREATE INDEX IF NOT EXISTS organisaatiot_slug_idx ON organisaatiot (slug);

COMMENT ON COLUMN organisaatiot.slug IS
  'URL-tunniste (/konsultit/[slug] tms.). Johdettu nimestä.';

-- ---------------------------------------------------------------------------
-- Organisaatio ilman Y-tunnusta (ulkomainen tai asiakirjan lyhyt nimi)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION julkaise_organisaatio_ilman_ytunnusta(
  p_nimi text,
  p_lahde_url text,
  p_vahvistettu_pvm date,
  p_lainaus text DEFAULT NULL,
  p_merkitty text DEFAULT 'ihmisen_vahvistama'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_nimi text;
  v_lahde text;
  v_slug text;
BEGIN
  v_nimi := btrim(COALESCE(p_nimi, ''));
  v_lahde := btrim(COALESCE(p_lahde_url, ''));
  IF v_nimi = '' THEN
    RAISE EXCEPTION 'Organisaation nimi puuttuu';
  END IF;
  IF v_lahde = '' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF p_vahvistettu_pvm IS NULL THEN
    RAISE EXCEPTION 'vahvistettu_pvm puuttuu';
  END IF;

  SELECT id INTO v_id
  FROM organisaatiot
  WHERE julkaistu AND lower(btrim(nimi)) = lower(v_nimi)
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_slug := johda_organisaatio_slug(v_nimi);
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Slugia ei voitu johtaa nimestä';
  END IF;
  IF EXISTS (SELECT 1 FROM organisaatiot WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(md5(v_nimi || v_lahde), 1, 8);
  END IF;

  INSERT INTO organisaatiot (nimi, tyyppi, y_tunnus, julkaistu, slug)
  VALUES (v_nimi, 'yritys', NULL, true, v_slug)
  RETURNING id INTO v_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot', v_id, 'nimi', v_lahde, NULL, p_vahvistettu_pvm,
    'vahvistettu', NULLIF(btrim(COALESCE(p_lainaus, '')), ''), p_merkitty, 'dokumentti'
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION julkaise_organisaatio_ilman_ytunnusta IS
  'Luo julkaistun yritysorganisaation ilman Y-tunnusta (ulkomainen / asiakirjan lyhyt nimi).';

REVOKE ALL ON FUNCTION julkaise_organisaatio_ilman_ytunnusta(text, text, date, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_organisaatio_ilman_ytunnusta(text, text, date, text, text)
  TO service_role;

-- Päivitä julkaise_organisaatio_yritys asettamaan slug uudelle riville.
CREATE OR REPLACE FUNCTION julkaise_organisaatio_yritys(
  p_nimi text,
  p_y_tunnus text,
  p_lahde_url text,
  p_vahvistettu_pvm date,
  p_lainaus text DEFAULT NULL,
  p_merkitty text DEFAULT 'ihmisen_vahvistama',
  p_ytj_lahde_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_nimi text;
  v_yt text;
  v_lahde text;
  v_ytj_lahde text;
  v_slug text;
BEGIN
  v_nimi := btrim(COALESCE(p_nimi, ''));
  v_yt := btrim(COALESCE(p_y_tunnus, ''));
  v_lahde := btrim(COALESCE(p_lahde_url, ''));
  v_ytj_lahde := btrim(COALESCE(p_ytj_lahde_url, ''));

  IF v_nimi = '' THEN
    RAISE EXCEPTION 'Organisaation nimi puuttuu';
  END IF;
  IF v_yt !~ '^[0-9]{7}-[0-9]$' THEN
    RAISE EXCEPTION 'Y-tunnuksen muoto ei kelpaa';
  END IF;
  IF v_lahde = '' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF p_vahvistettu_pvm IS NULL THEN
    RAISE EXCEPTION 'vahvistettu_pvm puuttuu';
  END IF;
  IF v_ytj_lahde = '' THEN
    v_ytj_lahde := 'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=' || v_yt;
  END IF;

  SELECT id INTO v_id FROM organisaatiot WHERE y_tunnus = v_yt LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    UPDATE organisaatiot SET julkaistu = true WHERE id = v_id AND NOT julkaistu;
    UPDATE organisaatiot
    SET slug = COALESCE(NULLIF(btrim(slug), ''), johda_organisaatio_slug(nimi))
    WHERE id = v_id AND (slug IS NULL OR btrim(slug) = '');
    RETURN v_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM organisaatiot
    WHERE julkaistu AND lower(btrim(nimi)) = lower(v_nimi) AND y_tunnus IS DISTINCT FROM v_yt
  ) THEN
    RAISE EXCEPTION 'Julkaistu toiminimi on jo toisella Y-tunnuksella';
  END IF;

  v_slug := johda_organisaatio_slug(v_nimi);
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Slugia ei voitu johtaa nimestä';
  END IF;
  IF EXISTS (SELECT 1 FROM organisaatiot WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(v_yt, '-', ''), 1, 8);
  END IF;

  INSERT INTO organisaatiot (nimi, tyyppi, y_tunnus, julkaistu, slug)
  VALUES (v_nimi, 'yritys', v_yt, true, v_slug)
  RETURNING id INTO v_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot', v_id, 'nimi', v_lahde, NULL, p_vahvistettu_pvm,
    'vahvistettu', NULLIF(btrim(COALESCE(p_lainaus, '')), ''), p_merkitty, 'dokumentti'
  );
  PERFORM tallenna_kentta_lahde(
    'organisaatiot', v_id, 'y_tunnus', v_ytj_lahde, NULL, p_vahvistettu_pvm,
    'vahvistettu', NULL, p_merkitty, 'rajapinta'
  );

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- muutosehdotukset: tyyppi hanke_organisaatio
-- ---------------------------------------------------------------------------

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'uusi_hanke',
      'taydennys',
      'korjaus',
      'kuva',
      'kentta_tarkistus',
      'kentta_tyhjennys',
      'paatos',
      'maaraaja',
      'hanke_organisaatio',
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto',
      'lahteenvahvistus',
      'lahteenvahvistus_pyynto',
      'lahde_tyyppi_havainto'
    )
  );

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_uusi_ilman_hanketta;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_uusi_ilman_hanketta CHECK (
    (
      tyyppi = 'uusi_hanke'
      AND (
        (tila = 'odottaa' AND hanke_id IS NULL)
        OR (tila = 'hyvaksytty' AND hanke_id IS NOT NULL)
        OR (tila = 'hylatty' AND hanke_id IS NULL)
      )
    )
    OR (
      tyyppi IN (
        'taydennys',
        'korjaus',
        'kuva',
        'kentta_tarkistus',
        'kentta_tyhjennys',
        'paatos',
        'maaraaja',
        'hanke_organisaatio',
        'lahteenvahvistus',
        'lahteenvahvistus_pyynto'
      )
      AND hanke_id IS NOT NULL
    )
    OR tyyppi IN (
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto',
      'lahde_tyyppi_havainto'
    )
  );

CREATE OR REPLACE FUNCTION julkaise_hanke_organisaatio(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_rooli jsonb;
  v_lahteet jsonb;
  v_lahde jsonb;
  v_hanke_id uuid;
  v_org_id uuid;
  v_rooli_tunnus text;
  v_rivi_id uuid;
  v_dok_id uuid;
  v_lahde_url text;
  v_lahde_kohta text;
  v_kentta text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'hanke_organisaatio'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'hanke_id puuttuu';
  END IF;
  v_hanke_id := v_ehdotus.hanke_id;

  v_rooli := v_ehdotus.sisalto -> 'hanke_organisaatio';
  IF v_rooli IS NULL OR jsonb_typeof(v_rooli) <> 'object' THEN
    RAISE EXCEPTION 'sisalto.hanke_organisaatio puuttuu';
  END IF;

  v_org_id := NULLIF(btrim(COALESCE(v_rooli ->> 'organisaatio_id', '')), '')::uuid;
  v_rooli_tunnus := NULLIF(btrim(COALESCE(v_rooli ->> 'rooli', '')), '');
  v_dok_id := NULLIF(btrim(COALESCE(v_rooli ->> 'lahde_dokumentti_id', '')), '')::uuid;
  v_lahde_url := NULLIF(btrim(COALESCE(v_rooli ->> 'lahde_url', '')), '');
  v_lahde_kohta := NULLIF(btrim(COALESCE(v_rooli ->> 'lahde_kohta', '')), '');
  v_lahteet := COALESCE(v_rooli -> 'lahteet', '[]'::jsonb);

  IF v_org_id IS NULL OR v_rooli_tunnus IS NULL THEN
    RAISE EXCEPTION 'organisaatio_id tai rooli puuttuu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organisaatiot WHERE id = v_org_id AND julkaistu) THEN
    RAISE EXCEPTION 'Organisaatiota ei ole julkaistu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hanke_organisaatio_roolit WHERE tunnus = v_rooli_tunnus AND kaytossa) THEN
    RAISE EXCEPTION 'Rooli ei ole käytössä: %', v_rooli_tunnus;
  END IF;
  IF v_dok_id IS NULL AND v_lahde_url IS NULL THEN
    RAISE EXCEPTION 'lahde_dokumentti_id tai lahde_url vaaditaan';
  END IF;
  IF jsonb_typeof(v_lahteet) <> 'array' OR jsonb_array_length(v_lahteet) < 1 THEN
    RAISE EXCEPTION 'lahteet puuttuvat';
  END IF;

  SELECT id INTO v_rivi_id
  FROM hanke_organisaatiot
  WHERE hanke_id = v_hanke_id
    AND organisaatio_id = v_org_id
    AND rooli = v_rooli_tunnus
  LIMIT 1;

  IF v_rivi_id IS NULL THEN
    INSERT INTO hanke_organisaatiot (
      hanke_id, organisaatio_id, rooli, julkaistu,
      lahde_dokumentti_id, lahde_url, lahde_kohta
    ) VALUES (
      v_hanke_id, v_org_id, v_rooli_tunnus, true,
      v_dok_id, v_lahde_url, v_lahde_kohta
    )
    RETURNING id INTO v_rivi_id;
  ELSE
    UPDATE hanke_organisaatiot
    SET julkaistu = true,
        lahde_dokumentti_id = COALESCE(v_dok_id, lahde_dokumentti_id),
        lahde_url = COALESCE(v_lahde_url, lahde_url),
        lahde_kohta = COALESCE(v_lahde_kohta, lahde_kohta)
    WHERE id = v_rivi_id;
  END IF;

  FOR v_lahde IN SELECT * FROM jsonb_array_elements(v_lahteet)
  LOOP
    v_kentta := NULLIF(btrim(COALESCE(v_lahde ->> 'kentta', '')), '');
    IF v_kentta IS NULL THEN
      RAISE EXCEPTION 'lahde.kentta puuttuu';
    END IF;
    PERFORM tallenna_kentta_lahde(
      'hanke_organisaatiot',
      v_rivi_id,
      v_kentta,
      NULLIF(btrim(COALESCE(v_lahde ->> 'lahde_url', '')), ''),
      NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
      (v_lahde ->> 'vahvistettu_pvm')::date,
      COALESCE(NULLIF(btrim(COALESCE(v_lahde ->> 'luottamus', '')), ''), 'epavarma'),
      NULLIF(btrim(COALESCE(v_lahde ->> 'lainaus', '')), ''),
      COALESCE(NULLIF(btrim(COALESCE(v_lahde ->> 'merkitty', '')), ''), 'ihmisen_vahvistama'),
      COALESCE(NULLIF(btrim(COALESCE(v_lahde ->> 'lahde_laji', '')), ''), 'dokumentti')
    );
  END LOOP;

  UPDATE muutosehdotukset
  SET tila = 'hyvaksytty',
      kasitelty_pvm = now(),
      kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id;

  RETURN v_rivi_id;
END;
$$;

COMMENT ON FUNCTION julkaise_hanke_organisaatio IS
  'Hyväksyy hanke_organisaatio-ehdotuksen: luo/päivittää roolirivin ja lähteet.';

REVOKE ALL ON FUNCTION julkaise_hanke_organisaatio(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_hanke_organisaatio(uuid, text)
  TO service_role;
