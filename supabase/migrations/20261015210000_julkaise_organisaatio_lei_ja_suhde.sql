-- GLEIF: julkaise LEI yhdelle organisaatiolle; emo-suhteet ehdotusjonon kautta.

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT IF EXISTS muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi = ANY (
      ARRAY[
        'uusi_hanke',
        'taydennys',
        'korjaus',
        'kuva',
        'kentta_tarkistus',
        'kentta_tyhjennys',
        'paatos',
        'maaraaja',
        'hanke_organisaatio',
        'organisaatio_suhde',
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
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- LEI-kentät organisaatiolle (ihmisen vahvistama GLEIF-haku)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION julkaise_organisaatio_lei(
  p_organisaatio_id uuid,
  p_lei text,
  p_lei_tila text,
  p_lei_paivitetty_pvm timestamptz,
  p_lahde_url text,
  p_kasittelija text,
  p_gleif_suora_emo_poikkeus text DEFAULT NULL,
  p_gleif_ylin_emo_poikkeus text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lei text;
  v_lahde text;
  v_pvm date := CURRENT_DATE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  v_lei := upper(btrim(COALESCE(p_lei, '')));
  v_lahde := btrim(COALESCE(p_lahde_url, ''));

  IF NOT lei_on_kelvollinen(v_lei) THEN
    RAISE EXCEPTION 'LEI ei ole kelvollinen';
  END IF;
  IF v_lahde = '' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organisaatiot WHERE id = p_organisaatio_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Organisaatiota ei ole tai se ei ole julkaistu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM organisaatiot
    WHERE lei = v_lei AND id IS DISTINCT FROM p_organisaatio_id
  ) THEN
    RAISE EXCEPTION 'LEI on jo toisella organisaatiolla';
  END IF;

  UPDATE organisaatiot
  SET
    lei = v_lei,
    lei_tila = NULLIF(btrim(COALESCE(p_lei_tila, '')), ''),
    lei_paivitetty_pvm = p_lei_paivitetty_pvm,
    lei_haettu_pvm = v_pvm,
    gleif_suora_emo_poikkeus = NULLIF(btrim(COALESCE(p_gleif_suora_emo_poikkeus, '')), ''),
    gleif_ylin_emo_poikkeus = NULLIF(btrim(COALESCE(p_gleif_ylin_emo_poikkeus, '')), '')
  WHERE id = p_organisaatio_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot',
    p_organisaatio_id,
    'lei',
    v_lahde,
    NULL,
    v_pvm,
    'vahvistettu',
    'GLEIF LEI-tietue ' || v_lei,
    'ihmisen_vahvistama',
    'rajapinta'
  );
END;
$$;

COMMENT ON FUNCTION julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text
) IS
  'Tallentaa GLEIF:stä vahvistetun LEI:n organisaatiolle. Emo-suhteet erikseen jonoon.';

REVOKE ALL ON FUNCTION julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Hyväksy GLEIF-/asiakirjasuhdeehdotus
-- sisalto.organisaatio_suhde: suhde_tunnus, lahde_organisaatio_id,
--   emo_lei, emo_nimi, emo_rekisterinumero?, emo_rekisteriviranomainen?,
--   emo_maa?, lahde_url, lainaus
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION julkaise_organisaatio_suhde(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_suhde jsonb;
  v_tunnus text;
  v_lahde_id uuid;
  v_emo_id uuid;
  v_emo_lei text;
  v_emo_nimi text;
  v_emo_nro text;
  v_emo_ra text;
  v_emo_maa text;
  v_lahde_url text;
  v_lainaus text;
  v_slug text;
  v_pvm date := CURRENT_DATE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'organisaatio_suhde'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  v_suhde := COALESCE(v_ehdotus.sisalto -> 'organisaatio_suhde', '{}'::jsonb);
  v_tunnus := NULLIF(btrim(COALESCE(v_suhde ->> 'suhde_tunnus', '')), '');
  v_lahde_id := NULLIF(btrim(COALESCE(v_suhde ->> 'lahde_organisaatio_id', '')), '')::uuid;
  v_emo_lei := upper(btrim(COALESCE(v_suhde ->> 'emo_lei', '')));
  v_emo_nimi := btrim(COALESCE(v_suhde ->> 'emo_nimi', ''));
  v_emo_nro := NULLIF(btrim(COALESCE(v_suhde ->> 'emo_rekisterinumero', '')), '');
  v_emo_ra := NULLIF(btrim(COALESCE(v_suhde ->> 'emo_rekisteriviranomainen', '')), '');
  v_emo_maa := NULLIF(upper(btrim(COALESCE(v_suhde ->> 'emo_maa', ''))), '');
  v_lahde_url := btrim(COALESCE(v_suhde ->> 'lahde_url', v_ehdotus.lahde_url, ''));
  v_lainaus := btrim(COALESCE(v_suhde ->> 'lainaus', ''));

  IF v_tunnus IS NULL OR v_tunnus NOT IN ('gleif_suora_emo', 'gleif_ylin_emo') THEN
    RAISE EXCEPTION 'suhde_tunnus ei ole sallittu GLEIF-suhteeksi';
  END IF;
  IF v_lahde_id IS NULL THEN
    RAISE EXCEPTION 'lahde_organisaatio_id puuttuu';
  END IF;
  IF NOT lei_on_kelvollinen(v_emo_lei) THEN
    RAISE EXCEPTION 'emo_lei ei ole kelvollinen';
  END IF;
  IF v_emo_nimi = '' THEN
    RAISE EXCEPTION 'emo_nimi puuttuu';
  END IF;
  IF v_lahde_url = '' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF v_lainaus = '' THEN
    RAISE EXCEPTION 'lainaus puuttuu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organisaatiot WHERE id = v_lahde_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Lähdeorganisaatiota ei ole tai se ei ole julkaistu';
  END IF;

  SELECT id INTO v_emo_id
  FROM organisaatiot
  WHERE lei = v_emo_lei
  LIMIT 1
  FOR UPDATE;

  IF v_emo_id IS NULL THEN
    v_slug := johda_organisaatio_slug(v_emo_nimi);
    IF v_slug IS NULL THEN
      RAISE EXCEPTION 'Emolle ei voitu muodostaa slugia';
    END IF;
    IF EXISTS (SELECT 1 FROM organisaatiot WHERE slug = v_slug) THEN
      v_slug := v_slug || '-' || lower(substr(v_emo_lei, 1, 8));
    END IF;

    INSERT INTO organisaatiot (
      nimi,
      tyyppi,
      julkaistu,
      slug,
      lei,
      maa,
      rekisterinumero,
      rekisteriviranomainen
    )
    VALUES (
      v_emo_nimi,
      'yritys',
      true,
      v_slug,
      v_emo_lei,
      v_emo_maa,
      v_emo_nro,
      v_emo_ra
    )
    RETURNING id INTO v_emo_id;

    PERFORM tallenna_kentta_lahde(
      'organisaatiot', v_emo_id, 'nimi', v_lahde_url, NULL, v_pvm,
      'vahvistettu', v_lainaus, 'ihmisen_vahvistama', 'rajapinta'
    );
    PERFORM tallenna_kentta_lahde(
      'organisaatiot', v_emo_id, 'lei', v_lahde_url, NULL, v_pvm,
      'vahvistettu', 'GLEIF LEI-tietue ' || v_emo_lei, 'ihmisen_vahvistama', 'rajapinta'
    );
    IF v_emo_maa IS NOT NULL THEN
      PERFORM tallenna_kentta_lahde(
        'organisaatiot', v_emo_id, 'maa', v_lahde_url, NULL, v_pvm,
        'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
      );
    END IF;
    IF v_emo_nro IS NOT NULL THEN
      PERFORM tallenna_kentta_lahde(
        'organisaatiot', v_emo_id, 'rekisterinumero', v_lahde_url, NULL, v_pvm,
        'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
      );
    END IF;
    IF v_emo_ra IS NOT NULL THEN
      PERFORM tallenna_kentta_lahde(
        'organisaatiot', v_emo_id, 'rekisteriviranomainen', v_lahde_url, NULL, v_pvm,
        'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
      );
    END IF;
  END IF;

  IF v_emo_id = v_lahde_id THEN
    RAISE EXCEPTION 'Organisaatio ei voi olla oma emotaan';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organisaatio_suhteet
    WHERE lahde_organisaatio_id = v_lahde_id
      AND kohde_organisaatio_id = v_emo_id
      AND suhde_tunnus = v_tunnus
      AND julkaistu
  ) THEN
    INSERT INTO organisaatio_suhteet (
      lahde_organisaatio_id,
      kohde_organisaatio_id,
      suhde_tunnus,
      lahde_url,
      lainaus,
      julkaistu
    )
    VALUES (
      v_lahde_id,
      v_emo_id,
      v_tunnus,
      v_lahde_url,
      v_lainaus,
      true
    );
  END IF;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$$;

COMMENT ON FUNCTION julkaise_organisaatio_suhde(uuid, text) IS
  'Hyväksyy organisaatio_suhde-ehdotuksen (GLEIF emo). Luo emo-organisaation LEI:llä tarvittaessa.';

REVOKE ALL ON FUNCTION julkaise_organisaatio_suhde(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_organisaatio_suhde(uuid, text)
  TO service_role;
