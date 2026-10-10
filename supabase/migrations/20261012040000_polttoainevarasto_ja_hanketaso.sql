-- Polttoainevarasto vaihtoehdolle, Forssan polttoainetehon korjaus
-- ja hanketason päällekkäisyyksien jono.

ALTER TABLE hanke_vaihtoehdot
  ADD COLUMN polttoainevarasto_maara numeric(14, 3),
  ADD COLUMN polttoainevarasto_yksikko text;

ALTER TABLE hanke_vaihtoehdot
  ADD CONSTRAINT hanke_vaihtoehdot_polttoainevarasto_tarkistus CHECK (
    (
      polttoainevarasto_maara IS NULL
      AND polttoainevarasto_yksikko IS NULL
    )
    OR (
      polttoainevarasto_maara > 0
      AND polttoainevarasto_yksikko IN ('m3', 'litra', 'mw')
    )
  );

COMMENT ON COLUMN hanke_vaihtoehdot.polttoainevarasto_maara IS
  'Varastoitavan polttoaineen määrä. Yksikkö on polttoainevarasto_yksikko.';
COMMENT ON COLUMN hanke_vaihtoehdot.polttoainevarasto_yksikko IS
  'm3, litra tai mw. Pakollinen, kun määrä on merkitty.';

CREATE OR REPLACE FUNCTION hanke_vaihtoehto_puuttuvat_lahteet(r hanke_vaihtoehdot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'tunnus') THEN
    puuttuvat := puuttuvat || 'tunnus';
  END IF;
  IF r.teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'teho_mw') THEN
    puuttuvat := puuttuvat || 'teho_mw';
  END IF;
  IF r.it_teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'it_teho_mw') THEN
    puuttuvat := puuttuvat || 'it_teho_mw';
  END IF;
  IF r.pinta_ala_ha IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'pinta_ala_ha') THEN
    puuttuvat := puuttuvat || 'pinta_ala_ha';
  END IF;
  IF r.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := puuttuvat || 'sahkonkaytto_twh_a';
  END IF;
  IF r.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattorit_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_lkm';
  END IF;
  IF r.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_kaytossa_max_lkm';
  END IF;
  IF r.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := puuttuvat || 'generaattori_polttoaineteho_mw';
  END IF;
  IF r.polttoainevarasto_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'polttoainevarasto_maara') THEN
    puuttuvat := puuttuvat || 'polttoainevarasto_maara';
  END IF;
  IF r.polttoainevarasto_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'polttoainevarasto_yksikko') THEN
    puuttuvat := puuttuvat || 'polttoainevarasto_yksikko';
  END IF;
  IF r.sijainti_alue IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'sijainti') THEN
    puuttuvat := puuttuvat || 'sijainti';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION julkaise_ehdotetut_tiedot(
  p_tyyppi text,
  p_hanke_id uuid,
  p_hanke jsonb,
  p_lahteet jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text,
  p_vaihtoehdot jsonb DEFAULT '[]'::jsonb,
  p_paivita_ehdotus boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hanke_id uuid;
  v_lahde jsonb;
  v_toimija_id uuid;
  v_org_lahde jsonb;
  v_hanke jsonb;
  v_lahteet jsonb;
  v_vaihtoehdot jsonb;
  v_ve jsonb;
  v_kentat jsonb;
  v_tunnus text;
  v_ve_id uuid;
  v_uusi boolean;
  v_on_tunnus_lahde boolean;
  v_hanke_kenttia boolean;
BEGIN
  v_hanke := COALESCE(p_hanke, '{}'::jsonb);
  v_lahteet := COALESCE(p_lahteet, '[]'::jsonb);
  v_vaihtoehdot := COALESCE(p_vaihtoehdot, '[]'::jsonb);

  IF jsonb_typeof(v_vaihtoehdot) <> 'array' THEN
    RAISE EXCEPTION 'p_vaihtoehdot on oltava taulukko';
  END IF;

  v_toimija_id := NULLIF(v_hanke ->> 'toimija_organisaatio_id', '')::uuid;

  IF v_toimija_id IS NULL AND NULLIF(v_hanke ->> 'toimija_nimi', '') IS NOT NULL THEN
    SELECT value INTO v_org_lahde
    FROM jsonb_array_elements(v_lahteet) AS t(value)
    WHERE t.value ->> 'kentta' IN ('toimija_organisaatio_id', 'toimija_nimi')
    LIMIT 1;

    IF v_org_lahde IS NULL THEN
      RAISE EXCEPTION 'Toimijan nimelta puuttuu lahde';
    END IF;

    v_toimija_id := kayta_tai_luo_toimija_organisaatio(
      v_hanke ->> 'toimija_nimi',
      'yritys',
      v_org_lahde
    );
  END IF;

  v_hanke_kenttia :=
    NULLIF(v_hanke ->> 'nimi', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'kunta', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'maakunta', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'vaihe', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'yva_diaarinumero', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'it_teho_mw', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'teho_mw', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'pinta_ala_ha', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'sahkonkaytto_twh_a', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattorit_lkm', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattorit_kaytossa_max_lkm', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattori_polttoaineteho_mw', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'kaavatunnus', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'kortteli', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'sijainti_lat', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'sijainti_lon', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'sijainti_alue_tyyppi', '') IS NOT NULL
    OR (
      v_hanke ? 'sijainti_alue'
      AND jsonb_typeof(v_hanke -> 'sijainti_alue') = 'object'
      AND v_hanke -> 'sijainti_alue' ->> 'type' = 'Polygon'
    )
    OR v_toimija_id IS NOT NULL;

  IF p_tyyppi = 'uusi_hanke' THEN
    INSERT INTO hankkeet (
      nimi, kunta, maakunta, vaihe, yva_diaarinumero,
      teho_mw, it_teho_mw, pinta_ala_ha, sahkonkaytto_twh_a,
      generaattorit_lkm, generaattorit_kaytossa_max_lkm,
      generaattori_polttoaineteho_mw, toimija_organisaatio_id,
      kaavatunnus, kortteli,
      sijainti_lat, sijainti_lon, sijainti_alue_tyyppi, sijainti_alue,
      julkaistu
    )
    VALUES (
      v_hanke ->> 'nimi',
      v_hanke ->> 'kunta',
      NULLIF(v_hanke ->> 'maakunta', ''),
      v_hanke ->> 'vaihe',
      NULLIF(v_hanke ->> 'yva_diaarinumero', ''),
      NULLIF(v_hanke ->> 'teho_mw', '')::numeric,
      NULLIF(v_hanke ->> 'it_teho_mw', '')::numeric,
      NULLIF(v_hanke ->> 'pinta_ala_ha', '')::numeric,
      NULLIF(v_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
      NULLIF(v_hanke ->> 'generaattorit_lkm', '')::integer,
      NULLIF(v_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
      NULLIF(v_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
      v_toimija_id,
      NULLIF(v_hanke ->> 'kaavatunnus', ''),
      NULLIF(v_hanke ->> 'kortteli', ''),
      NULLIF(v_hanke ->> 'sijainti_lat', '')::numeric,
      NULLIF(v_hanke ->> 'sijainti_lon', '')::numeric,
      NULLIF(v_hanke ->> 'sijainti_alue_tyyppi', ''),
      CASE
        WHEN v_hanke ? 'sijainti_alue'
          AND jsonb_typeof(v_hanke -> 'sijainti_alue') = 'object'
          AND v_hanke -> 'sijainti_alue' ->> 'type' = 'Polygon'
        THEN v_hanke -> 'sijainti_alue'
        ELSE NULL
      END,
      true
    )
    RETURNING id INTO v_hanke_id;
  ELSE
    IF p_hanke_id IS NULL THEN
      RAISE EXCEPTION 'Taydennykselta puuttuu hanke';
    END IF;
    v_hanke_id := p_hanke_id;
    IF v_hanke_kenttia THEN
      UPDATE hankkeet
      SET
        nimi = COALESCE(NULLIF(v_hanke ->> 'nimi', ''), nimi),
        kunta = COALESCE(NULLIF(v_hanke ->> 'kunta', ''), kunta),
        maakunta = COALESCE(NULLIF(v_hanke ->> 'maakunta', ''), maakunta),
        vaihe = COALESCE(NULLIF(v_hanke ->> 'vaihe', ''), vaihe),
        yva_diaarinumero = COALESCE(NULLIF(v_hanke ->> 'yva_diaarinumero', ''), yva_diaarinumero),
        it_teho_mw = COALESCE(NULLIF(v_hanke ->> 'it_teho_mw', '')::numeric, it_teho_mw),
        teho_mw = COALESCE(NULLIF(v_hanke ->> 'teho_mw', '')::numeric, teho_mw),
        pinta_ala_ha = COALESCE(NULLIF(v_hanke ->> 'pinta_ala_ha', '')::numeric, pinta_ala_ha),
        sahkonkaytto_twh_a = COALESCE(
          NULLIF(v_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
          sahkonkaytto_twh_a
        ),
        generaattorit_lkm = COALESCE(
          NULLIF(v_hanke ->> 'generaattorit_lkm', '')::integer,
          generaattorit_lkm
        ),
        generaattorit_kaytossa_max_lkm = COALESCE(
          NULLIF(v_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
          generaattorit_kaytossa_max_lkm
        ),
        generaattori_polttoaineteho_mw = COALESCE(
          NULLIF(v_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
          generaattori_polttoaineteho_mw
        ),
        toimija_organisaatio_id = COALESCE(v_toimija_id, toimija_organisaatio_id),
        kaavatunnus = COALESCE(NULLIF(v_hanke ->> 'kaavatunnus', ''), kaavatunnus),
        kortteli = COALESCE(NULLIF(v_hanke ->> 'kortteli', ''), kortteli),
        sijainti_lat = COALESCE(NULLIF(v_hanke ->> 'sijainti_lat', '')::numeric, sijainti_lat),
        sijainti_lon = COALESCE(NULLIF(v_hanke ->> 'sijainti_lon', '')::numeric, sijainti_lon),
        sijainti_alue_tyyppi = COALESCE(
          NULLIF(v_hanke ->> 'sijainti_alue_tyyppi', ''),
          sijainti_alue_tyyppi
        ),
        sijainti_alue = COALESCE(
          CASE
            WHEN v_hanke ? 'sijainti_alue'
              AND jsonb_typeof(v_hanke -> 'sijainti_alue') = 'object'
              AND v_hanke -> 'sijainti_alue' ->> 'type' = 'Polygon'
            THEN v_hanke -> 'sijainti_alue'
            ELSE NULL
          END,
          sijainti_alue
        )
      WHERE id = v_hanke_id;
    END IF;
  END IF;

  IF jsonb_array_length(v_lahteet) > 0 AND NOT v_hanke_kenttia AND p_tyyppi <> 'uusi_hanke' THEN
    RAISE EXCEPTION 'Hankekentan lahde ilman hankekenttaa';
  END IF;

  FOR v_lahde IN SELECT value FROM jsonb_array_elements(v_lahteet)
  LOOP
    IF v_lahde ->> 'kentta' = 'toimija_nimi' THEN
      PERFORM tallenna_kentta_lahde(
        'hankkeet',
        v_hanke_id,
        'toimija_organisaatio_id',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty',
        vaadi_lahde_laji(v_lahde)
      );
    ELSIF v_lahde ->> 'kentta' = 'sijainti_alue' THEN
      PERFORM tallenna_kentta_lahde(
        'hankkeet',
        v_hanke_id,
        'sijainti',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty',
        vaadi_lahde_laji(v_lahde)
      );
    ELSE
      PERFORM tallenna_kentta_lahde(
        'hankkeet',
        v_hanke_id,
        v_lahde ->> 'kentta',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty',
        vaadi_lahde_laji(v_lahde)
      );
    END IF;
  END LOOP;

  FOR v_ve IN SELECT value FROM jsonb_array_elements(v_vaihtoehdot)
  LOOP
    v_tunnus := btrim(COALESCE(v_ve ->> 'tunnus', ''));
    IF v_tunnus = '' THEN
      RAISE EXCEPTION 'Vaihtoehdolta puuttuu tunnus';
    END IF;
    v_kentat := COALESCE(v_ve -> 'kentat', '{}'::jsonb);

    SELECT id INTO v_ve_id
    FROM hanke_vaihtoehdot
    WHERE hanke_id = v_hanke_id AND tunnus = v_tunnus;

    v_uusi := v_ve_id IS NULL;

    IF v_uusi THEN
      INSERT INTO hanke_vaihtoehdot (
        hanke_id,
        tunnus,
        teho_mw,
        it_teho_mw,
        pinta_ala_ha,
        sahkonkaytto_twh_a,
        generaattorit_lkm,
        generaattorit_kaytossa_max_lkm,
        generaattori_polttoaineteho_mw,
        polttoainevarasto_maara,
        polttoainevarasto_yksikko,
        julkaistu
      )
      VALUES (
        v_hanke_id,
        v_tunnus,
        NULLIF(v_kentat ->> 'teho_mw', '')::numeric,
        NULLIF(v_kentat ->> 'it_teho_mw', '')::numeric,
        NULLIF(v_kentat ->> 'pinta_ala_ha', '')::numeric,
        NULLIF(v_kentat ->> 'sahkonkaytto_twh_a', '')::numeric,
        NULLIF(v_kentat ->> 'generaattorit_lkm', '')::integer,
        NULLIF(v_kentat ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
        NULLIF(v_kentat ->> 'generaattori_polttoaineteho_mw', '')::numeric,
        NULLIF(v_kentat ->> 'polttoainevarasto_maara', '')::numeric,
        NULLIF(btrim(v_kentat ->> 'polttoainevarasto_yksikko'), ''),
        true
      )
      RETURNING id INTO v_ve_id;
    ELSE
      UPDATE hanke_vaihtoehdot
      SET
        teho_mw = COALESCE(NULLIF(v_kentat ->> 'teho_mw', '')::numeric, teho_mw),
        it_teho_mw = COALESCE(NULLIF(v_kentat ->> 'it_teho_mw', '')::numeric, it_teho_mw),
        pinta_ala_ha = COALESCE(NULLIF(v_kentat ->> 'pinta_ala_ha', '')::numeric, pinta_ala_ha),
        sahkonkaytto_twh_a = COALESCE(
          NULLIF(v_kentat ->> 'sahkonkaytto_twh_a', '')::numeric,
          sahkonkaytto_twh_a
        ),
        generaattorit_lkm = COALESCE(
          NULLIF(v_kentat ->> 'generaattorit_lkm', '')::integer,
          generaattorit_lkm
        ),
        generaattorit_kaytossa_max_lkm = COALESCE(
          NULLIF(v_kentat ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
          generaattorit_kaytossa_max_lkm
        ),
        generaattori_polttoaineteho_mw = COALESCE(
          NULLIF(v_kentat ->> 'generaattori_polttoaineteho_mw', '')::numeric,
          generaattori_polttoaineteho_mw
        ),
        polttoainevarasto_maara = COALESCE(
          NULLIF(v_kentat ->> 'polttoainevarasto_maara', '')::numeric,
          polttoainevarasto_maara
        ),
        polttoainevarasto_yksikko = COALESCE(
          NULLIF(btrim(v_kentat ->> 'polttoainevarasto_yksikko'), ''),
          polttoainevarasto_yksikko
        )
      WHERE id = v_ve_id;
    END IF;

    v_on_tunnus_lahde := false;
    FOR v_lahde IN SELECT value FROM jsonb_array_elements(COALESCE(v_ve -> 'lahteet', '[]'::jsonb))
    LOOP
      IF v_lahde ->> 'kentta' = 'tunnus' AND NOT v_uusi THEN
        CONTINUE;
      END IF;
      IF v_lahde ->> 'kentta' = 'tunnus' THEN
        v_on_tunnus_lahde := true;
        IF NOT v_uusi THEN
          CONTINUE;
        END IF;
      END IF;
      PERFORM tallenna_kentta_lahde(
        'hanke_vaihtoehdot',
        v_ve_id,
        v_lahde ->> 'kentta',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty',
        vaadi_lahde_laji(v_lahde)
      );
    END LOOP;

    IF v_uusi AND NOT v_on_tunnus_lahde THEN
      RAISE EXCEPTION 'Uudelta vaihtoehdolta % puuttuu tunnuksen lahde', v_tunnus;
    END IF;
  END LOOP;

  IF p_tyyppi <> 'uusi_hanke'
    AND NOT v_hanke_kenttia
    AND jsonb_array_length(v_vaihtoehdot) = 0 THEN
    RAISE EXCEPTION 'Taydennyksessa ei ole kenttia eika vaihtoehtoja';
  END IF;

  IF p_paivita_ehdotus THEN
    UPDATE muutosehdotukset
    SET
      tila = 'hyvaksytty',
      kasitelty_pvm = now(),
      kasittelija = p_kasittelija,
      hanke_id = v_hanke_id
    WHERE id = p_ehdotus_id
      AND tila = 'odottaa';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
    END IF;
  END IF;

  RETURN v_hanke_id;
END;
$$;


CREATE OR REPLACE FUNCTION julkaise_hanketason_tyhjennykset(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset;
  v_rivi jsonb;
  v_kentta text;
  v_perustelu text;
BEGIN
  IF p_kasittelija IS NULL OR btrim(p_kasittelija) = '' THEN
    RAISE EXCEPTION 'Käsittelijä puuttuu';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND OR v_ehdotus.tila IS DISTINCT FROM 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;
  IF v_ehdotus.tyyppi IS DISTINCT FROM 'kentta_tyhjennys' OR v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Tyhjennys vaatii hankkeen';
  END IF;
  IF jsonb_typeof(v_ehdotus.sisalto -> 'tyhjennykset') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_ehdotus.sisalto -> 'tyhjennykset') = 0 THEN
    RAISE EXCEPTION 'Ehdotuksessa ei ole tyhjennettäviä kenttiä';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_ehdotus.hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  FOR v_rivi IN
    SELECT value FROM jsonb_array_elements(v_ehdotus.sisalto -> 'tyhjennykset')
  LOOP
    v_kentta := NULLIF(btrim(COALESCE(v_rivi ->> 'kentta', '')), '');
    v_perustelu := NULLIF(btrim(COALESCE(v_rivi ->> 'perustelu', '')), '');
    IF v_kentta IS NULL OR v_perustelu IS NULL OR char_length(v_perustelu) < 12 THEN
      RAISE EXCEPTION 'Tyhjennyksen kenttä tai perustelu puuttuu';
    END IF;
    IF v_kentta NOT IN (
      'teho_mw',
      'it_teho_mw',
      'pinta_ala_ha',
      'sahkonkaytto_twh_a',
      'generaattorit_lkm',
      'generaattori_polttoaineteho_mw'
    ) THEN
      RAISE EXCEPTION 'Kenttää % ei voi tyhjentää tällä ehdotuksella', v_kentta;
    END IF;

    EXECUTE format('UPDATE hankkeet SET %I = NULL WHERE id = $1', v_kentta)
      USING v_ehdotus.hanke_id;

    DELETE FROM kentta_lahteet
    WHERE taulu = 'hankkeet'
      AND rivi_id = v_ehdotus.hanke_id
      AND kentta = v_kentta;

    DELETE FROM kentta_tarkistukset
    WHERE taulu = 'hankkeet'
      AND rivi_id = v_ehdotus.hanke_id
      AND kentta = v_kentta;
  END LOOP;

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

COMMENT ON FUNCTION julkaise_hanketason_tyhjennykset(uuid, text) IS
  'Tyhjentää hanketason kentät, kun sama luku on julkaistulla vaihtoehdolla. Vain ihmisen hyväksyntä.';

REVOKE ALL ON FUNCTION julkaise_hanketason_tyhjennykset(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_hanketason_tyhjennykset(uuid, text) TO service_role;

-- Forssa: 675 MW ja 963 MW korvataan päätelmän luvuilla.
UPDATE hanke_vaihtoehdot
SET generaattori_polttoaineteho_mw = 1830
WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e'
  AND tunnus = 'VE1';

UPDATE hanke_vaihtoehdot
SET generaattori_polttoaineteho_mw = 2611
WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e'
  AND tunnus = 'VE2';

DELETE FROM kentta_lahteet
WHERE taulu = 'hanke_vaihtoehdot'
  AND kentta = 'generaattori_polttoaineteho_mw'
  AND rivi_id IN (
    SELECT id FROM hanke_vaihtoehdot
    WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e'
      AND tunnus IN ('VE1', 'VE2')
  );

SELECT tallenna_kentta_lahde(
  'hanke_vaihtoehdot',
  (SELECT id FROM hanke_vaihtoehdot WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e' AND tunnus = 'VE1'),
  'generaattori_polttoaineteho_mw',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
  6,
  CURRENT_DATE,
  'epavarma',
  'VE1 varavoimageneraattoreiden yhteenlaskettu polttoaineteho on näin ollen 1830 MWth ja vaihtoehdon VE2 2611 MWth.',
  'ihmisen_vahvistama',
  'dokumentti'
);

SELECT tallenna_kentta_lahde(
  'hanke_vaihtoehdot',
  (SELECT id FROM hanke_vaihtoehdot WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e' AND tunnus = 'VE2'),
  'generaattori_polttoaineteho_mw',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
  6,
  CURRENT_DATE,
  'epavarma',
  'VE1 varavoimageneraattoreiden yhteenlaskettu polttoaineteho on näin ollen 1830 MWth ja vaihtoehdon VE2 2611 MWth.',
  'ihmisen_vahvistama',
  'dokumentti'
);

UPDATE hankkeet
SET
  generaattorit_lkm = NULL,
  generaattori_polttoaineteho_mw = NULL
WHERE id = '780537d4-907d-417b-91fe-ddb0fcef250e';

DELETE FROM kentta_lahteet
WHERE taulu = 'hankkeet'
  AND rivi_id = '780537d4-907d-417b-91fe-ddb0fcef250e'
  AND kentta IN ('generaattorit_lkm', 'generaattori_polttoaineteho_mw');

UPDATE muutosehdotukset
SET
  sisalto = jsonb_set(
    jsonb_set(
      sisalto,
      '{vaihtoehdot,VE1,generaattori_polttoaineteho_mw}',
      jsonb_build_object(
        'arvo', '1830',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
        'lahde_sivu', 6,
        'lainaus', 'VE1 varavoimageneraattoreiden yhteenlaskettu polttoaineteho on näin ollen 1830 MWth ja vaihtoehdon VE2 2611 MWth.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      )
    ),
    '{vaihtoehdot,VE2,generaattori_polttoaineteho_mw}',
    jsonb_build_object(
      'arvo', '2611',
      'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
      'lahde_sivu', 6,
      'lainaus', 'VE1 varavoimageneraattoreiden yhteenlaskettu polttoaineteho on näin ollen 1830 MWth ja vaihtoehdon VE2 2611 MWth.',
      'luottamus', 'epavarma',
      'lahde_laji', 'dokumentti'
    )
  ),
  tila = 'hyvaksytty',
  kasitelty_pvm = now(),
  kasittelija = 'ylläpito',
  perustelu = 'Perusteltu päätelmä 28.5.2026 sivu 6 korjaa selostuksen nimellistehot. VE1 on 1830 MWth ja VE2 on 2611 MWth. 675 MW ja 963 MW hylätään.'
WHERE id = 'fa2d7731-2691-47e8-b525-8124b93e75d5'
  AND tila = 'odottaa';

UPDATE muutosehdotukset
SET
  tila = 'hylatty',
  kasitelty_pvm = now(),
  kasittelija = 'ylläpito',
  perustelu = '1830 MWth julkaistaan vaihtoehdolle VE1 ja 2611 MWth vaihtoehdolle VE2. Hanketason polttoainetehoa ei päivitetä, vaan se tyhjennetään. 675 MW ja 963 MW hylätään.'
WHERE id = '61852588-3acb-4434-b289-9ac8f34c2a43'
  AND tila = 'odottaa';

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus, perustelu, kasittelija, kasitelty_pvm
)
VALUES
(
  'kentta_tyhjennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'tyhjennys', jsonb_build_object(
      'taulu', 'hankkeet',
      'rivi_id', '780537d4-907d-417b-91fe-ddb0fcef250e',
      'kentta', 'generaattorit_lkm',
      'perustelu', 'VE1:ssä on 345 generaattoria. Hanketason luku on sama luku, joten se tyhjennetään.',
      'merkitse_ei_lahdetta', false
    )
  ),
  'hyvaksytty',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  'Hanketason generaattoriluku 345 tyhjennettiin, koska luku on VE1:llä.',
  'VE1:ssä on 345 generaattoria. Hanketason luku on sama luku, joten se tyhjennetään.',
  'ylläpito',
  now()
),
(
  'kentta_tyhjennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'tyhjennys', jsonb_build_object(
      'taulu', 'hankkeet',
      'rivi_id', '780537d4-907d-417b-91fe-ddb0fcef250e',
      'kentta', 'generaattori_polttoaineteho_mw',
      'perustelu', 'Perusteltu päätelmä 28.5.2026 sivu 6 esittää VE1:lle 1830 MWth ja VE2:lle 2611 MWth. Hanketason 675 MW tyhjennetään.',
      'merkitse_ei_lahdetta', false
    )
  ),
  'hyvaksytty',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
  'Hanketason polttoaineteho 675 MW tyhjennettiin. Vaihtoehdoilla on 1830 MWth ja 2611 MWth.',
  'Perusteltu päätelmä 28.5.2026 sivu 6 esittää VE1:lle 1830 MWth ja VE2:lle 2611 MWth. Hanketason 675 MW tyhjennetään.',
  'ylläpito',
  now()
);

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES (
  'taydennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'polttoainevarasto',
    'vaihtoehdot', jsonb_build_object(
      'VE1', jsonb_build_object(
        'polttoainevarasto_maara', jsonb_build_object(
          'arvo', '15350',
          'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
          'lahde_sivu', 1,
          'lainaus', 'Yhteensä kevyttä polttoöljyä on varastoituna generaattoreita varten nykyisen hankesuunnitelman mukaan 15 350 m³.',
          'luottamus', 'vahvistettu',
          'lahde_laji', 'dokumentti'
        ),
        'polttoainevarasto_yksikko', jsonb_build_object(
          'arvo', 'm3',
          'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
          'lahde_sivu', 1,
          'lainaus', 'Yhteensä kevyttä polttoöljyä on varastoituna generaattoreita varten nykyisen hankesuunnitelman mukaan 15 350 m³.',
          'luottamus', 'vahvistettu',
          'lahde_laji', 'dokumentti'
        )
      ),
      'VE2', jsonb_build_object(
        'polttoainevarasto_maara', jsonb_build_object(
          'arvo', '23400',
          'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
          'lahde_sivu', 2,
          'lainaus', 'Yhteensä kevyttä polttoöljyä on varastoituna generaattoreita varten nykyisen hankesuunnitelman mukaan 23 400 m³.',
          'luottamus', 'vahvistettu',
          'lahde_laji', 'dokumentti'
        ),
        'polttoainevarasto_yksikko', jsonb_build_object(
          'arvo', 'm3',
          'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
          'lahde_sivu', 2,
          'lainaus', 'Yhteensä kevyttä polttoöljyä on varastoituna generaattoreita varten nykyisen hankesuunnitelman mukaan 23 400 m³.',
          'luottamus', 'vahvistettu',
          'lahde_laji', 'dokumentti'
        )
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20Forssa%20datakeskus.pdf',
  'Polttoainevarasto perustellusta päätelmästä: VE1 15 350 m³ sivulla 1, VE2 23 400 m³ sivulla 2. Yksikkö m3.'
);

UPDATE dokumentit
SET
  otsikko = 'Yhteysviranomaisen lausunto arviointiohjelmasta, Forssan datakeskushanke',
  julkaisija = 'Lupa- ja valvontavirasto',
  lahde_tyyppi = 'viranomaisasiakirja',
  sitovuustaso = 'virallinen',
  otsikko_automaattinen = false
WHERE id = 'e018f2a3-f6a4-4688-bbec-7f356c5cb435';

UPDATE dokumentit
SET
  otsikko = 'Arviointiselostus, Forssan datakeskus',
  julkaisija = 'Lupa- ja valvontavirasto',
  lahde_tyyppi = 'viranomaisasiakirja',
  sitovuustaso = 'virallinen',
  otsikko_automaattinen = false
WHERE id = '4ceea0d1-518b-492d-b765-f6083f14a32c';

UPDATE dokumentit
SET
  otsikko = 'Yhteysviranomaisen perusteltu päätelmä arviointiselostuksesta, Forssan datakeskus, 28.5.2026',
  julkaisija = 'Lupa- ja valvontavirasto',
  lahde_tyyppi = 'viranomaisasiakirja',
  sitovuustaso = 'virallinen',
  otsikko_automaattinen = false
WHERE id = 'eba341d4-024b-4a5b-9f32-4a63f5120453';

SELECT tallenna_kentta_lahde(
  'dokumentit', 'e018f2a3-f6a4-4688-bbec-7f356c5cb435', 'otsikko',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  NULL, CURRENT_DATE, 'vahvistettu',
  'Yhteysviranomaisen lausunto arviointiohjelmasta, Forssan datakeskushanke',
  'ihmisen_vahvistama', 'html'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', 'e018f2a3-f6a4-4688-bbec-7f356c5cb435', 'julkaisija',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  NULL, CURRENT_DATE, 'vahvistettu',
  'Yhteysviranomainen: Lupa- ja valvontavirasto',
  'ihmisen_vahvistama', 'html'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', '4ceea0d1-518b-492d-b765-f6083f14a32c', 'otsikko',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  NULL, CURRENT_DATE, 'vahvistettu',
  'Arviointiselostus, Forssan datakeskus',
  'ihmisen_vahvistama', 'html'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', '4ceea0d1-518b-492d-b765-f6083f14a32c', 'julkaisija',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  NULL, CURRENT_DATE, 'vahvistettu',
  'Yhteysviranomainen: Lupa- ja valvontavirasto',
  'ihmisen_vahvistama', 'html'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', 'eba341d4-024b-4a5b-9f32-4a63f5120453', 'otsikko',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  NULL, CURRENT_DATE, 'vahvistettu',
  'Yhteysviranomaisen perusteltu päätelmä arviointiselostuksesta, Forssan datakeskus, 28.5.2026',
  'ihmisen_vahvistama', 'html'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', 'eba341d4-024b-4a5b-9f32-4a63f5120453', 'julkaisija',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  NULL, CURRENT_DATE, 'vahvistettu',
  'Yhteysviranomainen: Lupa- ja valvontavirasto',
  'ihmisen_vahvistama', 'html'
);

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
SELECT
  'kentta_tyhjennys',
  q.id,
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'hanketason-vaihtoehto',
    'tyhjennykset', q.tyhjennykset
  ),
  'odottaa',
  q.lahde_url,
  'Julkaistulla vaihtoehdolla, VE0 pois lukien, on sama kenttä. Hanketason luku tyhjennetään hankekohtaisesti.'
FROM (
  SELECT
    h.id,
    (array_agg(src.lahde_url) FILTER (WHERE src.lahde_url IS NOT NULL))[1] AS lahde_url,
    jsonb_agg(
      jsonb_build_object(
        'kentta', x.kentta,
        'perustelu', 'Julkaistulla vaihtoehdolla on kentässä ' || x.kentta || ' luku. Hanketason sama kenttä tyhjennetään.',
        'lahde_url', src.lahde_url,
        'lainaus', src.lainaus
      )
      ORDER BY x.kentta
    ) AS tyhjennykset
  FROM hankkeet h
  CROSS JOIN (
    VALUES
      ('teho_mw'),
      ('it_teho_mw'),
      ('pinta_ala_ha'),
      ('sahkonkaytto_twh_a'),
      ('generaattorit_lkm'),
      ('generaattori_polttoaineteho_mw')
  ) AS x(kentta)
  LEFT JOIN LATERAL (
    SELECT k.lahde_url, k.lainaus
    FROM hanke_vaihtoehdot v
    JOIN kentta_lahteet k
      ON k.taulu = 'hanke_vaihtoehdot'
      AND k.rivi_id = v.id
      AND k.kentta = x.kentta
    WHERE v.hanke_id = h.id
      AND v.julkaistu
      AND upper(btrim(v.tunnus)) <> 'VE0'
    LIMIT 1
  ) src ON true
  WHERE h.julkaistu
    AND h.yhdistetty_kohde_id IS NULL
    AND NOT (
      h.id = '780537d4-907d-417b-91fe-ddb0fcef250e'
      AND x.kentta IN ('generaattorit_lkm', 'generaattori_polttoaineteho_mw')
    )
    AND CASE x.kentta
      WHEN 'teho_mw' THEN h.teho_mw IS NOT NULL AND EXISTS (
        SELECT 1 FROM hanke_vaihtoehdot v
        WHERE v.hanke_id = h.id AND v.julkaistu AND upper(btrim(v.tunnus)) <> 'VE0' AND v.teho_mw IS NOT NULL
      )
      WHEN 'it_teho_mw' THEN h.it_teho_mw IS NOT NULL AND EXISTS (
        SELECT 1 FROM hanke_vaihtoehdot v
        WHERE v.hanke_id = h.id AND v.julkaistu AND upper(btrim(v.tunnus)) <> 'VE0' AND v.it_teho_mw IS NOT NULL
      )
      WHEN 'pinta_ala_ha' THEN h.pinta_ala_ha IS NOT NULL AND EXISTS (
        SELECT 1 FROM hanke_vaihtoehdot v
        WHERE v.hanke_id = h.id AND v.julkaistu AND upper(btrim(v.tunnus)) <> 'VE0' AND v.pinta_ala_ha IS NOT NULL
      )
      WHEN 'sahkonkaytto_twh_a' THEN h.sahkonkaytto_twh_a IS NOT NULL AND EXISTS (
        SELECT 1 FROM hanke_vaihtoehdot v
        WHERE v.hanke_id = h.id AND v.julkaistu AND upper(btrim(v.tunnus)) <> 'VE0' AND v.sahkonkaytto_twh_a IS NOT NULL
      )
      WHEN 'generaattorit_lkm' THEN h.generaattorit_lkm IS NOT NULL AND EXISTS (
        SELECT 1 FROM hanke_vaihtoehdot v
        WHERE v.hanke_id = h.id AND v.julkaistu AND upper(btrim(v.tunnus)) <> 'VE0' AND v.generaattorit_lkm IS NOT NULL
      )
      WHEN 'generaattori_polttoaineteho_mw' THEN h.generaattori_polttoaineteho_mw IS NOT NULL AND EXISTS (
        SELECT 1 FROM hanke_vaihtoehdot v
        WHERE v.hanke_id = h.id AND v.julkaistu AND upper(btrim(v.tunnus)) <> 'VE0' AND v.generaattori_polttoaineteho_mw IS NOT NULL
      )
      ELSE false
    END
  GROUP BY h.id
) q;

DO $$
DECLARE
  v_lkm integer;
  v_ve1 numeric;
  v_ve2 numeric;
  v_hanke_gen integer;
  v_hanke_poltto numeric;
BEGIN
  SELECT generaattori_polttoaineteho_mw INTO v_ve1
  FROM hanke_vaihtoehdot
  WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e' AND tunnus = 'VE1';
  SELECT generaattori_polttoaineteho_mw INTO v_ve2
  FROM hanke_vaihtoehdot
  WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e' AND tunnus = 'VE2';
  SELECT generaattorit_lkm, generaattori_polttoaineteho_mw
  INTO v_hanke_gen, v_hanke_poltto
  FROM hankkeet
  WHERE id = '780537d4-907d-417b-91fe-ddb0fcef250e';
  IF v_ve1 IS DISTINCT FROM 1830 OR v_ve2 IS DISTINCT FROM 2611 THEN
    RAISE EXCEPTION 'Forssan polttoaineteho ei päivittynyt';
  END IF;
  IF v_hanke_gen IS NOT NULL OR v_hanke_poltto IS NOT NULL THEN
    RAISE EXCEPTION 'Forssan hanketason generaattoriluvut jäivät';
  END IF;

  SELECT count(*) INTO v_lkm
  FROM muutosehdotukset
  WHERE tila = 'odottaa'
    AND sisalto ->> 'huomio' = 'hanketason-vaihtoehto';
  IF v_lkm <> 10 THEN
    RAISE EXCEPTION 'Hanketason jono: % / 10', v_lkm;
  END IF;
END $$;
