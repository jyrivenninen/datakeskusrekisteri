-- LUONNOS — ei migrations/. Ajo vasta hyväksynnän jälkeen.

DROP FUNCTION IF EXISTS public.julkaise_ehdotetut_tiedot(text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean);
CREATE FUNCTION public.julkaise_ehdotetut_tiedot(p_tyyppi text, p_hanke_id uuid, p_hanke jsonb, p_lahteet jsonb, p_ehdotus_id uuid, p_kasittelija text, p_vaihtoehdot jsonb DEFAULT '[]'::jsonb, p_paivita_ehdotus boolean DEFAULT true, p_tehohavainnot jsonb DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE

  v_th jsonb;
  v_th_lahde jsonb;
  v_th_id uuid;
  v_merkitty text;
  v_korvaa_id uuid;
  v_poista_id uuid;
  v_laji text;
  v_mw numeric;
  v_mw_min numeric;
  v_mw_max numeric;
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
    OR NULLIF(v_hanke ->> 'kaava_ala_ha', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'sahkonkaytto_twh_a', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattorit_lkm', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattorit_kaytossa_max_lkm', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattori_polttoaineteho_mw', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'generaattori_yksikkoteho_mwe', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'diesel_vuosikulutus_maara', '') IS NOT NULL
    OR NULLIF(v_hanke ->> 'varavoima_paastot_t_co2e', '') IS NOT NULL
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
      teho_mw, it_teho_mw, pinta_ala_ha, kaava_ala_ha, sahkonkaytto_twh_a,
      generaattorit_lkm, generaattorit_kaytossa_max_lkm,
      generaattori_polttoaineteho_mw, generaattori_yksikkoteho_mwe,
      diesel_vuosikulutus_maara, diesel_vuosikulutus_yksikko,
      varavoima_paastot_t_co2e, toimija_organisaatio_id,
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
      NULLIF(v_hanke ->> 'kaava_ala_ha', '')::numeric,
      NULLIF(v_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
      NULLIF(v_hanke ->> 'generaattorit_lkm', '')::integer,
      NULLIF(v_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
      NULLIF(v_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
      NULLIF(v_hanke ->> 'generaattori_yksikkoteho_mwe', '')::numeric,
      NULLIF(v_hanke ->> 'diesel_vuosikulutus_maara', '')::numeric,
      NULLIF(btrim(v_hanke ->> 'diesel_vuosikulutus_yksikko'), ''),
      NULLIF(v_hanke ->> 'varavoima_paastot_t_co2e', '')::numeric,
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
        kaava_ala_ha = COALESCE(NULLIF(v_hanke ->> 'kaava_ala_ha', '')::numeric, kaava_ala_ha),
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
        generaattori_yksikkoteho_mwe = COALESCE(
          NULLIF(v_hanke ->> 'generaattori_yksikkoteho_mwe', '')::numeric,
          generaattori_yksikkoteho_mwe
        ),
        diesel_vuosikulutus_maara = COALESCE(
          NULLIF(v_hanke ->> 'diesel_vuosikulutus_maara', '')::numeric,
          diesel_vuosikulutus_maara
        ),
        diesel_vuosikulutus_yksikko = COALESCE(
          NULLIF(btrim(v_hanke ->> 'diesel_vuosikulutus_yksikko'), ''),
          diesel_vuosikulutus_yksikko
        ),
        varavoima_paastot_t_co2e = COALESCE(
          NULLIF(v_hanke ->> 'varavoima_paastot_t_co2e', '')::numeric,
          varavoima_paastot_t_co2e
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
        COALESCE(NULLIF(btrim(v_lahde ->> 'merkitty'), ''), 'koneen_ehdottama'),
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
        COALESCE(NULLIF(btrim(v_lahde ->> 'merkitty'), ''), 'koneen_ehdottama'),
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
        COALESCE(NULLIF(btrim(v_lahde ->> 'merkitty'), ''), 'koneen_ehdottama'),
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
        generaattori_yksikkoteho_mwe,
        diesel_vuosikulutus_maara,
        diesel_vuosikulutus_yksikko,
        varavoima_paastot_t_co2e,
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
        NULLIF(v_kentat ->> 'generaattori_yksikkoteho_mwe', '')::numeric,
        NULLIF(v_kentat ->> 'diesel_vuosikulutus_maara', '')::numeric,
        NULLIF(btrim(v_kentat ->> 'diesel_vuosikulutus_yksikko'), ''),
        NULLIF(v_kentat ->> 'varavoima_paastot_t_co2e', '')::numeric,
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
        ),
        generaattori_yksikkoteho_mwe = COALESCE(
          NULLIF(v_kentat ->> 'generaattori_yksikkoteho_mwe', '')::numeric,
          generaattori_yksikkoteho_mwe
        ),
        diesel_vuosikulutus_maara = COALESCE(
          NULLIF(v_kentat ->> 'diesel_vuosikulutus_maara', '')::numeric,
          diesel_vuosikulutus_maara
        ),
        diesel_vuosikulutus_yksikko = COALESCE(
          NULLIF(btrim(v_kentat ->> 'diesel_vuosikulutus_yksikko'), ''),
          diesel_vuosikulutus_yksikko
        ),
        varavoima_paastot_t_co2e = COALESCE(
          NULLIF(v_kentat ->> 'varavoima_paastot_t_co2e', '')::numeric,
          varavoima_paastot_t_co2e
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
        COALESCE(NULLIF(btrim(v_lahde ->> 'merkitty'), ''), 'koneen_ehdottama'),
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

  -- merkitty: vain sallitut; puuttuva -> koneen_ehdottama (ei ihmisen_vahvistama)
  FOR v_lahde IN SELECT value FROM jsonb_array_elements(v_lahteet)
  LOOP
    v_merkitty := COALESCE(NULLIF(btrim(COALESCE(v_lahde ->> 'merkitty', '')), ''), 'koneen_ehdottama');
    IF v_merkitty NOT IN ('ihmisen_vahvistama', 'koneen_ehdottama') THEN
      RAISE EXCEPTION 'merkitty virheellinen: %', v_lahde ->> 'merkitty';
    END IF;
  END LOOP;

  IF p_tehohavainnot IS NOT NULL THEN
    IF jsonb_typeof(p_tehohavainnot) <> 'array' THEN
      RAISE EXCEPTION 'p_tehohavainnot on oltava taulukko tai NULL';
    END IF;
    FOR v_th IN SELECT value FROM jsonb_array_elements(p_tehohavainnot)
    LOOP
      v_poista_id := NULLIF(v_th ->> 'poista_id', '')::uuid;
      IF v_poista_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM tehohavainnot t WHERE t.id = v_poista_id AND t.hanke_id = v_hanke_id) THEN
          RAISE EXCEPTION 'poista_id ei kuulu hankkeeseen %', v_hanke_id;
        END IF;
        UPDATE tehohavainnot SET tila = 'ei_tue' WHERE id = v_poista_id;
        CONTINUE;
      END IF;

      v_th_lahde := COALESCE(v_th -> 'lahde', '{}'::jsonb);
      IF NULLIF(btrim(COALESCE(v_th_lahde ->> 'lahde_url', '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_tehohavainnot: lahde_url pakollinen';
      END IF;
      IF NULLIF(btrim(COALESCE(v_th_lahde ->> 'lainaus', '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_tehohavainnot: lainaus pakollinen';
      END IF;
      v_laji := NULLIF(btrim(COALESCE(v_th ->> 'laji', '')), '');
      IF v_laji IS NULL THEN
        RAISE EXCEPTION 'p_tehohavainnot: laji pakollinen';
      END IF;
      IF NULLIF(btrim(COALESCE(v_th ->> 'kohde', '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_tehohavainnot: kohde pakollinen';
      END IF;
      IF NULLIF(btrim(COALESCE(v_th ->> 'rajaus', '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_tehohavainnot: rajaus pakollinen';
      END IF;
      v_mw := NULLIF(v_th ->> 'mw', '')::numeric;
      v_mw_min := NULLIF(v_th ->> 'mw_min', '')::numeric;
      v_mw_max := NULLIF(v_th ->> 'mw_max', '')::numeric;
      IF v_mw IS NOT NULL AND (v_mw_min IS NOT NULL OR v_mw_max IS NOT NULL) THEN
        RAISE EXCEPTION 'p_tehohavainnot: mw ja mw_min/mw_max eivät saa olla yhdessä';
      END IF;
      IF v_mw IS NULL AND v_mw_min IS NULL AND v_mw_max IS NULL THEN
        RAISE EXCEPTION 'p_tehohavainnot: mw tai mw_min/mw_max vaaditaan';
      END IF;
      IF (v_mw_min IS NOT NULL) <> (v_mw_max IS NOT NULL) THEN
        RAISE EXCEPTION 'p_tehohavainnot: mw_min ja mw_max yhdessä';
      END IF;
      IF v_mw_min IS NOT NULL AND v_mw_min > v_mw_max THEN
        RAISE EXCEPTION 'p_tehohavainnot: mw_min > mw_max';
      END IF;
      IF NULLIF(btrim(COALESCE(v_th ->> 'rajaus', '')), '') = 'vali' THEN
        IF v_mw_min IS NULL OR v_mw_max IS NULL OR v_mw IS NOT NULL THEN
          RAISE EXCEPTION 'p_tehohavainnot: rajaus=vali vaatii mw_min ja mw_max (ei mw)';
        END IF;
      ELSE
        IF v_mw IS NULL OR v_mw_min IS NOT NULL OR v_mw_max IS NOT NULL THEN
          RAISE EXCEPTION 'p_tehohavainnot: rajaus<>vali vaatii mw (ei mw_min/mw_max)';
        END IF;
      END IF;

      v_merkitty := COALESCE(NULLIF(btrim(COALESCE(v_th_lahde ->> 'merkitty', '')), ''), 'koneen_ehdottama');
      IF v_merkitty NOT IN ('ihmisen_vahvistama', 'koneen_ehdottama') THEN
        RAISE EXCEPTION 'p_tehohavainnot: merkitty virheellinen';
      END IF;

      v_korvaa_id := NULLIF(v_th ->> 'korvaa_id', '')::uuid;
      IF v_korvaa_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM tehohavainnot t WHERE t.id = v_korvaa_id AND t.hanke_id = v_hanke_id) THEN
          RAISE EXCEPTION 'korvaa_id ei kuulu hankkeeseen %', v_hanke_id;
        END IF;
      END IF;

      INSERT INTO tehohavainnot (
        hanke_id, laji, kohde, rajaus, mw, mw_min, mw_max, tila, havainto_pvm
      ) VALUES (
        v_hanke_id,
        v_laji,
        NULLIF(v_th ->> 'kohde', ''),
        NULLIF(v_th ->> 'rajaus', ''),
        v_mw, v_mw_min, v_mw_max,
        'voimassa',
        COALESCE(NULLIF(v_th ->> 'havainto_pvm', '')::date, CURRENT_DATE)
      ) RETURNING id INTO v_th_id;

      PERFORM tallenna_kentta_lahde(
        'tehohavainnot',
        v_th_id,
        'havainto',
        v_th_lahde ->> 'lahde_url',
        NULLIF(v_th_lahde ->> 'lahde_sivu', '')::integer,
        COALESCE(NULLIF(v_th_lahde ->> 'vahvistettu_pvm', '')::date, CURRENT_DATE),
        COALESCE(NULLIF(v_th_lahde ->> 'luottamus', ''), 'epavarma'),
        NULLIF(v_th_lahde ->> 'lainaus', ''),
        v_merkitty,
        vaadi_lahde_laji(v_th_lahde)
      );

      IF v_korvaa_id IS NOT NULL THEN
        UPDATE tehohavainnot
        SET tila = 'korvattu', korvaava_id = v_th_id
        WHERE id = v_korvaa_id;
      END IF;
    END LOOP;
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
$function$



REVOKE ALL ON FUNCTION public.julkaise_ehdotetut_tiedot(text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean, jsonb)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_ehdotetut_tiedot(text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
