-- Agentin automaattijulkaisu: säännöt SQL:ssä (PROJEKTI-lisays-agentti-julkaisu.md).
-- Ihmisen kuittaus: kuitaa_hanke_kentat.

CREATE FUNCTION luottamus_taso(p_luottamus text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_luottamus
    WHEN 'epavarma' THEN 1
    WHEN 'vahvistettu' THEN 2
    ELSE 0
  END;
$$;

CREATE FUNCTION agentti_lahde_kentta(p_kentta text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_kentta = 'toimija_nimi' THEN 'toimija_organisaatio_id'
    WHEN p_kentta IN ('sijainti_lat', 'sijainti_lon', 'sijainti_alue_tyyppi') THEN 'sijainti'
    ELSE p_kentta
  END;
$$;

CREATE FUNCTION agentti_kayta_luottamus(p_luottamus text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_luottamus = 'ristiriitainen' THEN NULL::text
    ELSE 'epavarma'
  END;
$$;

CREATE FUNCTION hanke_kentta_arvo(p_hanke hankkeet, p_kentta text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN CASE p_kentta
    WHEN 'nimi' THEN p_hanke.nimi
    WHEN 'kunta' THEN p_hanke.kunta
    WHEN 'maakunta' THEN p_hanke.maakunta
    WHEN 'vaihe' THEN p_hanke.vaihe::text
    WHEN 'yva_diaarinumero' THEN p_hanke.yva_diaarinumero
    WHEN 'teho_mw' THEN p_hanke.teho_mw::text
    WHEN 'it_teho_mw' THEN p_hanke.it_teho_mw::text
    WHEN 'pinta_ala_ha' THEN p_hanke.pinta_ala_ha::text
    WHEN 'sahkonkaytto_twh_a' THEN p_hanke.sahkonkaytto_twh_a::text
    WHEN 'generaattorit_lkm' THEN p_hanke.generaattorit_lkm::text
    WHEN 'generaattorit_kaytossa_max_lkm' THEN p_hanke.generaattorit_kaytossa_max_lkm::text
    WHEN 'generaattori_polttoaineteho_mw' THEN p_hanke.generaattori_polttoaineteho_mw::text
    WHEN 'toimija_organisaatio_id' THEN p_hanke.toimija_organisaatio_id::text
    WHEN 'toimija_nimi' THEN p_hanke.toimija_organisaatio_id::text
    WHEN 'kaavatunnus' THEN p_hanke.kaavatunnus
    WHEN 'kortteli' THEN p_hanke.kortteli
    WHEN 'sijainti_lat' THEN p_hanke.sijainti_lat::text
    WHEN 'sijainti_lon' THEN p_hanke.sijainti_lon::text
    WHEN 'sijainti_alue_tyyppi' THEN p_hanke.sijainti_alue_tyyppi::text
    ELSE NULL
  END;
END;
$$;

CREATE FUNCTION kentta_on_ihmisen_vahvistama(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kentta_lahteet kl
    WHERE kl.taulu = p_taulu
      AND kl.rivi_id = p_rivi_id
      AND kl.kentta = p_kentta
      AND kl.merkitty = 'ihmisen_vahvistama'
  );
$$;

CREATE FUNCTION kentta_paras_luottamus_taso(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(MAX(luottamus_taso(kl.luottamus)), 0)
  FROM kentta_lahteet kl
  WHERE kl.taulu = p_taulu
    AND kl.rivi_id = p_rivi_id
    AND kl.kentta = p_kentta;
$$;

CREATE FUNCTION agentti_saako_julkaista_kentan(
  p_hanke hankkeet,
  p_kentta text,
  p_uusi_arvo text,
  p_ehdotettu_luottamus text,
  p_uusi_hanke boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lahde_kentta text;
  v_uusi_luott text;
  v_tyhja boolean;
  v_nyky_arvo text;
  v_nyky_taso integer;
  v_uusi_taso integer;
BEGIN
  v_lahde_kentta := agentti_lahde_kentta(p_kentta);
  v_uusi_luott := agentti_kayta_luottamus(p_ehdotettu_luottamus);
  IF v_uusi_luott IS NULL THEN
    RETURN false;
  END IF;

  IF NULLIF(btrim(COALESCE(p_uusi_arvo, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  IF p_uusi_hanke OR p_hanke.id IS NULL THEN
    RETURN true;
  END IF;

  IF kentta_on_ihmisen_vahvistama('hankkeet', p_hanke.id, v_lahde_kentta) THEN
    RETURN false;
  END IF;

  IF v_lahde_kentta = 'sijainti' THEN
    v_tyhja := hanke_kentta_on_tyhja(p_hanke, 'sijainti');
  ELSE
    v_tyhja := hanke_kentta_on_tyhja(p_hanke, p_kentta);
  END IF;

  IF v_tyhja IS TRUE THEN
    RETURN true;
  END IF;

  v_nyky_arvo := hanke_kentta_arvo(p_hanke, p_kentta);
  v_nyky_taso := kentta_paras_luottamus_taso('hankkeet', p_hanke.id, v_lahde_kentta);
  v_uusi_taso := luottamus_taso(v_uusi_luott);

  IF btrim(COALESCE(v_nyky_arvo, '')) = btrim(COALESCE(p_uusi_arvo, '')) THEN
    RETURN v_uusi_taso > v_nyky_taso;
  END IF;

  RETURN v_uusi_taso > v_nyky_taso;
END;
$$;

COMMENT ON FUNCTION agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean) IS
  'TRUE jos agentti saa julkaista kentän automaattisesti. Varmennettu kenttä on aina FALSE.';

-- julkaise_ehdotetut_tiedot: valinnainen ehdotuspäivitys (osittainen agenttijulkaisu).

DROP FUNCTION IF EXISTS julkaise_ehdotetut_tiedot(
  text, uuid, jsonb, jsonb, uuid, text, jsonb
);

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

REVOKE ALL ON FUNCTION julkaise_ehdotetut_tiedot(
  text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_ehdotetut_tiedot(
  text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean
) TO service_role;

CREATE FUNCTION julkaise_agentti_ehdotus(p_ehdotus_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_hanke hankkeet%ROWTYPE;
  v_kentat jsonb;
  v_jonossa jsonb := '{}'::jsonb;
  v_hanke_pub jsonb := '{}'::jsonb;
  v_lahteet jsonb := '[]'::jsonb;
  v_avain text;
  v_tieto jsonb;
  v_arvo text;
  v_luottamus text;
  v_lahde_kentta text;
  v_hanke_id uuid;
  v_tyyppi text;
  v_uusi_hanke boolean;
  v_julkaistu_lkm integer := 0;
  v_jonossa_lkm integer := 0;
  v_tanaan date := CURRENT_DATE;
  v_sijainti_tieto jsonb;
BEGIN
  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei löytynyt';
  END IF;

  IF v_ehdotus.ehdottaja_tyyppi <> 'agentti' THEN
    RAISE EXCEPTION 'Automaattijulkaisu vain agentin ehdotuksille';
  END IF;

  IF v_ehdotus.tila <> 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotus on jo käsitelty';
  END IF;

  IF v_ehdotus.tyyppi NOT IN ('uusi_hanke', 'taydennys', 'korjaus') THEN
    RAISE EXCEPTION 'Tyyppi % ei kelpaa automaattijulkaisuun', v_ehdotus.tyyppi;
  END IF;

  v_uusi_hanke := v_ehdotus.tyyppi = 'uusi_hanke';
  v_kentat := COALESCE(v_ehdotus.sisalto -> 'kentat', '{}'::jsonb);

  IF v_uusi_hanke THEN
    NULL;
  ELSIF v_ehdotus.hanke_id IS NOT NULL THEN
    SELECT * INTO v_hanke FROM hankkeet WHERE id = v_ehdotus.hanke_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hanketta ei löytynyt';
    END IF;
  ELSE
    RAISE EXCEPTION 'Taydennykselta puuttuu hanke';
  END IF;

  IF v_kentat ? 'sijainti_lat' OR v_kentat ? 'sijainti_lon' OR v_kentat ? 'sijainti_alue_tyyppi' THEN
    v_sijainti_tieto := COALESCE(
      v_kentat -> 'sijainti_lat',
      v_kentat -> 'sijainti_lon',
      v_kentat -> 'sijainti_alue_tyyppi'
    );
    IF agentti_saako_julkaista_kentan(
      v_hanke,
      'sijainti_lat',
      COALESCE(v_kentat -> 'sijainti_lat' ->> 'arvo', v_kentat -> 'sijainti_lon' ->> 'arvo', ''),
      COALESCE(v_sijainti_tieto ->> 'luottamus', 'epavarma'),
      v_uusi_hanke
    ) THEN
      IF v_kentat ? 'sijainti_lat' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object(
          'sijainti_lat', v_kentat -> 'sijainti_lat' ->> 'arvo'
        );
      END IF;
      IF v_kentat ? 'sijainti_lon' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object(
          'sijainti_lon', v_kentat -> 'sijainti_lon' ->> 'arvo'
        );
      END IF;
      IF v_kentat ? 'sijainti_alue_tyyppi' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object(
          'sijainti_alue_tyyppi', v_kentat -> 'sijainti_alue_tyyppi' ->> 'arvo'
        );
      END IF;
      v_luottamus := agentti_kayta_luottamus(v_sijainti_tieto ->> 'luottamus');
      v_lahteet := v_lahteet || jsonb_build_array(
        jsonb_build_object(
          'kentta', 'sijainti',
          'lahde_url', v_sijainti_tieto ->> 'lahde_url',
          'lahde_sivu', v_sijainti_tieto ->> 'lahde_sivu',
          'lahde_laji', COALESCE(v_sijainti_tieto ->> 'lahde_laji', 'html'),
          'vahvistettu_pvm', COALESCE(v_sijainti_tieto ->> 'vahvistettu_pvm', v_tanaan::text),
          'luottamus', v_luottamus,
          'lainaus', COALESCE(v_sijainti_tieto ->> 'lainaus', ''),
          'merkitty', 'koneen_ehdottama'
        )
      );
      v_julkaistu_lkm := v_julkaistu_lkm + 1;
    ELSE
      IF v_kentat ? 'sijainti_lat' THEN
        v_jonossa := v_jonossa || jsonb_build_object('sijainti_lat', v_kentat -> 'sijainti_lat');
      END IF;
      IF v_kentat ? 'sijainti_lon' THEN
        v_jonossa := v_jonossa || jsonb_build_object('sijainti_lon', v_kentat -> 'sijainti_lon');
      END IF;
      IF v_kentat ? 'sijainti_alue_tyyppi' THEN
        v_jonossa := v_jonossa || jsonb_build_object(
          'sijainti_alue_tyyppi', v_kentat -> 'sijainti_alue_tyyppi'
        );
      END IF;
      v_jonossa_lkm := v_jonossa_lkm + 1;
    END IF;
  END IF;

  FOR v_avain, v_tieto IN
    SELECT key, value FROM jsonb_each(v_kentat)
  LOOP
    IF v_avain IN ('sijainti_lat', 'sijainti_lon', 'sijainti_alue_tyyppi') THEN
      CONTINUE;
    END IF;

    v_arvo := v_tieto ->> 'arvo';
    IF agentti_saako_julkaista_kentan(
      v_hanke,
      v_avain,
      v_arvo,
      COALESCE(v_tieto ->> 'luottamus', 'epavarma'),
      v_uusi_hanke
    ) THEN
      IF v_avain = 'toimija_nimi' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object('toimija_nimi', v_arvo);
      ELSE
        v_hanke_pub := v_hanke_pub || jsonb_build_object(v_avain, v_arvo);
      END IF;

      v_lahde_kentta := agentti_lahde_kentta(v_avain);
      v_luottamus := agentti_kayta_luottamus(v_tieto ->> 'luottamus');
      v_lahteet := v_lahteet || jsonb_build_array(
        jsonb_build_object(
          'kentta', v_lahde_kentta,
          'lahde_url', v_tieto ->> 'lahde_url',
          'lahde_sivu', v_tieto ->> 'lahde_sivu',
          'lahde_laji', COALESCE(v_tieto ->> 'lahde_laji', 'html'),
          'vahvistettu_pvm', COALESCE(v_tieto ->> 'vahvistettu_pvm', v_tanaan::text),
          'luottamus', v_luottamus,
          'lainaus', COALESCE(v_tieto ->> 'lainaus', ''),
          'merkitty', 'koneen_ehdottama'
        )
      );
      v_julkaistu_lkm := v_julkaistu_lkm + 1;
    ELSE
      v_jonossa := v_jonossa || jsonb_build_object(v_avain, v_tieto);
      v_jonossa_lkm := v_jonossa_lkm + 1;
    END IF;
  END LOOP;

  IF v_uusi_hanke THEN
    IF NOT (
      v_hanke_pub ? 'nimi'
      AND v_hanke_pub ? 'kunta'
      AND v_hanke_pub ? 'vaihe'
    ) THEN
      RETURN jsonb_build_object(
        'hanke_id', NULL,
        'julkaistu_kentat', '[]'::jsonb,
        'jonossa_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_kentat) AS key),
        'tila', 'odottaa',
        'viesti', 'Pakolliset kentät (nimi, kunta, vaihe) vaativat hyväksynnän tai kelvollisen lähteen'
      );
    END IF;
  END IF;

  IF v_julkaistu_lkm = 0 THEN
    RETURN jsonb_build_object(
      'hanke_id', v_ehdotus.hanke_id,
      'julkaistu_kentat', '[]'::jsonb,
      'jonossa_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_jonossa) AS key),
      'tila', 'odottaa',
      'viesti', 'Yksikään kenttä ei kelvanut automaattijulkaisuun'
    );
  END IF;

  v_tyyppi := CASE WHEN v_uusi_hanke THEN 'uusi_hanke' ELSE v_ehdotus.tyyppi END;

  v_hanke_id := julkaise_ehdotetut_tiedot(
    v_tyyppi,
    v_ehdotus.hanke_id,
    v_hanke_pub,
    v_lahteet,
    p_ehdotus_id,
    'agentti:automaattinen',
    '[]'::jsonb,
    false
  );

  IF v_jonossa_lkm = 0 THEN
    UPDATE muutosehdotukset
    SET
      tila = 'hyvaksytty',
      kasitelty_pvm = now(),
      kasittelija = 'agentti:automaattinen',
      hanke_id = v_hanke_id
    WHERE id = p_ehdotus_id;

    RETURN jsonb_build_object(
      'hanke_id', v_hanke_id,
      'julkaistu_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_hanke_pub) AS key),
      'jonossa_kentat', '[]'::jsonb,
      'tila', 'hyvaksytty',
      'viesti', 'Kaikki kentät julkaistu automaattisesti'
    );
  END IF;

  UPDATE muutosehdotukset
  SET
    tyyppi = 'taydennys',
    hanke_id = v_hanke_id,
    sisalto = jsonb_set(
      COALESCE(sisalto, '{}'::jsonb),
      '{kentat}',
      v_jonossa,
      true
    ),
    huomautus = trim(both FROM concat_ws(
      ' ',
      COALESCE(huomautus, ''),
      format('Automaattijulkaistu %s kenttää; loput odottavat hyväksyntää.', v_julkaistu_lkm)
    ))
  WHERE id = p_ehdotus_id;

  RETURN jsonb_build_object(
    'hanke_id', v_hanke_id,
    'julkaistu_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_hanke_pub) AS key),
    'jonossa_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_jonossa) AS key),
    'tila', 'odottaa',
    'viesti', 'Osittainen automaattijulkaisu'
  );
END;
$$;

COMMENT ON FUNCTION julkaise_agentti_ehdotus(uuid) IS
  'Agentin automaattijulkaisu: uudet kentät ja korkeampi luottamus. Varmennettu tieto ja samatason muutokset jäävät jonoon.';

CREATE FUNCTION kuitaa_hanke_kentat(
  p_hanke_id uuid,
  p_kentat text[],
  p_kasittelija text,
  p_luottamus text DEFAULT 'vahvistettu'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kentta text;
  v_lkm integer := 0;
  v_rivit integer;
BEGIN
  IF p_luottamus NOT IN ('vahvistettu', 'epavarma') THEN
    RAISE EXCEPTION 'Kuittauksen luottamus ei ole sallittu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = p_hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  FOREACH v_kentta IN ARRAY p_kentat
  LOOP
    UPDATE kentta_lahteet
    SET
      merkitty = 'ihmisen_vahvistama',
      luottamus = p_luottamus,
      merkitty_pvm = now()
    WHERE taulu = 'hankkeet'
      AND rivi_id = p_hanke_id
      AND kentta = agentti_lahde_kentta(v_kentta)
      AND merkitty = 'koneen_ehdottama';

    GET DIAGNOSTICS v_rivit = ROW_COUNT;
    v_lkm := v_lkm + v_rivit;
  END LOOP;

  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION kuitaa_hanke_kentat(uuid, text[], text, text) IS
  'Ylläpitäjä kuittaa automaattijulkaistun kentän nähdyksi: merkitty=ihmisen_vahvistama.';

REVOKE ALL ON FUNCTION julkaise_agentti_ehdotus(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION julkaise_agentti_ehdotus(uuid) TO agentti;

REVOKE ALL ON FUNCTION kuitaa_hanke_kentat(uuid, text[], text, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION kuitaa_hanke_kentat(uuid, text[], text, text)
  TO service_role;

COMMENT ON ROLE agentti IS
  'Ulkoiset tarkistusagentit. Lukuoikeus julkaistuun; kirjoitus muutosehdotukset + julkaise_agentti_ehdotus.';
