-- poista lahde_laji-oletus, pakollinen laji tallennuksessa, DEFINER EXECUTE-rajaus.

ALTER TABLE kentta_lahteet
  ALTER COLUMN lahde_laji DROP DEFAULT;

CREATE OR REPLACE FUNCTION vaadi_lahde_laji(p_lahde jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := NULLIF(btrim(COALESCE(p_lahde ->> 'lahde_laji', '')), '');
  IF v IS NULL OR v NOT IN ('dokumentti', 'rajapinta', 'rss', 'html') THEN
    RAISE EXCEPTION 'lahde_laji puuttuu tai ei ole sallittu';
  END IF;
  RETURN v;
END;
$$;

DROP FUNCTION IF EXISTS tallenna_kentta_lahde(
  text, uuid, text, text, integer, date, text, text, text
);

CREATE FUNCTION tallenna_kentta_lahde(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text,
  p_lahde_url text,
  p_lahde_sivu integer,
  p_vahvistettu_pvm date,
  p_luottamus text,
  p_lainaus text,
  p_merkitty text,
  p_lahde_laji text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_lahde_laji NOT IN ('dokumentti', 'rajapinta', 'rss', 'html') THEN
    RAISE EXCEPTION 'lahde_laji puuttuu tai ei ole sallittu';
  END IF;
  INSERT INTO kentta_lahteet (
    taulu, rivi_id, kentta, lahde_url, lahde_sivu, lahde_laji,
    vahvistettu_pvm, luottamus, lainaus, merkitty
  )
  VALUES (
    p_taulu,
    p_rivi_id,
    p_kentta,
    p_lahde_url,
    p_lahde_sivu,
    p_lahde_laji,
    p_vahvistettu_pvm,
    p_luottamus,
    p_lainaus,
    p_merkitty
  )
  ON CONFLICT ON CONSTRAINT kentta_lahteet_sama_lahde_kerran
  DO UPDATE SET
    lahde_sivu = EXCLUDED.lahde_sivu,
    lahde_laji = EXCLUDED.lahde_laji,
    vahvistettu_pvm = EXCLUDED.vahvistettu_pvm,
    luottamus = EXCLUDED.luottamus,
    lainaus = EXCLUDED.lainaus,
    merkitty = EXCLUDED.merkitty;
END;
$$;

CREATE OR REPLACE FUNCTION julkaise_ehdotetut_tiedot(
  p_tyyppi text,
  p_hanke_id uuid,
  p_hanke jsonb,
  p_lahteet jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text,
  p_vaihtoehdot jsonb DEFAULT '[]'::jsonb
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
    INSERT INTO organisaatiot (nimi, tyyppi, julkaistu)
    VALUES (v_hanke ->> 'toimija_nimi', 'yritys', true)
    RETURNING id INTO v_toimija_id;

    SELECT value INTO v_org_lahde
    FROM jsonb_array_elements(v_lahteet) AS t(value)
    WHERE t.value ->> 'kentta' IN ('toimija_organisaatio_id', 'toimija_nimi')
    LIMIT 1;

    IF v_org_lahde IS NULL THEN
      RAISE EXCEPTION 'Toimijan nimelta puuttuu lahde';
    END IF;

    PERFORM tallenna_kentta_lahde(
      'organisaatiot',
      v_toimija_id,
      'nimi',
      v_org_lahde ->> 'lahde_url',
      NULLIF(v_org_lahde ->> 'lahde_sivu', '')::integer,
      (v_org_lahde ->> 'vahvistettu_pvm')::date,
      v_org_lahde ->> 'luottamus',
      NULLIF(v_org_lahde ->> 'lainaus', ''),
      v_org_lahde ->> 'merkitty',
      vaadi_lahde_laji(v_org_lahde)
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
    OR v_toimija_id IS NOT NULL;

  IF p_tyyppi = 'uusi_hanke' THEN
    INSERT INTO hankkeet (
      nimi, kunta, maakunta, vaihe, yva_diaarinumero,
      teho_mw, it_teho_mw, pinta_ala_ha, sahkonkaytto_twh_a,
      generaattorit_lkm, generaattorit_kaytossa_max_lkm,
      generaattori_polttoaineteho_mw, toimija_organisaatio_id,
      kaavatunnus, kortteli,
      sijainti_lat, sijainti_lon, sijainti_alue_tyyppi,
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
        )
      WHERE id = v_ve_id;
    END IF;

    v_on_tunnus_lahde := false;
    FOR v_lahde IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_ve -> 'lahteet', '[]'::jsonb))
    LOOP
      IF v_lahde ->> 'kentta' NOT IN (
        'tunnus',
        'teho_mw',
        'it_teho_mw',
        'pinta_ala_ha',
        'sahkonkaytto_twh_a',
        'generaattorit_lkm',
        'generaattorit_kaytossa_max_lkm',
        'generaattori_polttoaineteho_mw'
      ) THEN
        RAISE EXCEPTION 'Vaihtoehdon kentta ei ole sallittu: %', v_lahde ->> 'kentta';
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

  RETURN v_hanke_id;
END;
$$;


CREATE OR REPLACE FUNCTION julkaise_hanke_kuvat(
  p_hanke_id uuid,
  p_kuvat jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kuva jsonb;
  v_lahde jsonb;
  v_kuva_id uuid;
  v_jarjestys integer;
  v_kuva_url text;
BEGIN
  IF p_hanke_id IS NULL THEN
    RAISE EXCEPTION 'Kuvaehdotuksella on oltava hanke';
  END IF;
  IF jsonb_typeof(COALESCE(p_kuvat, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_kuvat, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Kuvaehdotuksessa ei ole kuvia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hankkeet WHERE id = p_hanke_id AND julkaistu) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  SELECT COALESCE(MAX(jarjestys), -1) + 1 INTO v_jarjestys
  FROM hanke_kuvat
  WHERE hanke_id = p_hanke_id;

  FOR v_kuva IN SELECT value FROM jsonb_array_elements(p_kuvat)
  LOOP
    IF NULLIF(btrim(COALESCE(v_kuva ->> 'kuva_url', '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(v_kuva ->> 'kuvateksti', '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(v_kuva ->> 'kuvaaja', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Kuvasta puuttuu osoite, kuvateksti tai kuvaaja';
    END IF;

    v_kuva_url := btrim(v_kuva ->> 'kuva_url');

    IF EXISTS (
      SELECT 1
      FROM hanke_kuvat
      WHERE hanke_id = p_hanke_id
        AND kuva_url = v_kuva_url
        AND julkaistu
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO hanke_kuvat (
      hanke_id, kuva_url, kuvateksti, kuvaaja, jarjestys, julkaistu
    )
    VALUES (
      p_hanke_id,
      v_kuva_url,
      btrim(v_kuva ->> 'kuvateksti'),
      btrim(v_kuva ->> 'kuvaaja'),
      v_jarjestys,
      true
    )
    RETURNING id INTO v_kuva_id;

    v_jarjestys := v_jarjestys + 1;

    FOR v_lahde IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_kuva -> 'lahteet', '[]'::jsonb))
    LOOP
      IF v_lahde ->> 'kentta' NOT IN ('kuva_url', 'kuvateksti', 'kuvaaja') THEN
        RAISE EXCEPTION 'Kuvan kentta ei ole sallittu: %', v_lahde ->> 'kentta';
      END IF;
      PERFORM tallenna_kentta_lahde(
        'hanke_kuvat',
        v_kuva_id,
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
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    hanke_id = p_hanke_id
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;

  RETURN p_hanke_id;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS allekirjoitus
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      r.allekirjoitus
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION vaadi_lahde_laji(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION julkaise_ehdotetut_tiedot(
  text, uuid, jsonb, jsonb, uuid, text, jsonb
) TO service_role;

GRANT EXECUTE ON FUNCTION julkaise_hanke_kuvat(uuid, jsonb, uuid, text)
  TO service_role;

GRANT EXECUTE ON FUNCTION onko_yllapitaja() TO authenticated;
