-- LUONNOS — ei migrations-kansiossa. Ajo vasta hyväksynnän jälkeen.

ALTER TABLE tehohavainnot ADD COLUMN IF NOT EXISTS korvaava_id uuid REFERENCES tehohavainnot(id);

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

CREATE OR REPLACE FUNCTION public.julkaise_agentti_ehdotus(p_ehdotus_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$


REVOKE ALL ON FUNCTION public.julkaise_agentti_ehdotus(uuid)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_agentti_ehdotus(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.julkaise_kentta_tyhjennys(p_ehdotus_id uuid, p_kasittelija text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_kentta text;
  v_lahde_kentta text;
  v_perustelu text;
  v_merkitse boolean;
  v_hanke hankkeet%ROWTYPE;
  v_rivi_id uuid;
  v_taulu text;
BEGIN
  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei löytynyt';
  END IF;
  IF v_ehdotus.tila <> 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotus on jo käsitelty';
  END IF;
  IF v_ehdotus.tyyppi <> 'kentta_tyhjennys' THEN
    RAISE EXCEPTION 'Ei kentta_tyhjennys-ehdotus';
  END IF;
  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Tyhjennys vaatii hankkeen';
  END IF;

  v_kentta := NULLIF(btrim(COALESCE(v_ehdotus.sisalto #>> '{tyhjennys,kentta}', '')), '');
  v_perustelu := NULLIF(btrim(COALESCE(v_ehdotus.sisalto #>> '{tyhjennys,perustelu}', '')), '');
  v_merkitse := COALESCE((v_ehdotus.sisalto #>> '{tyhjennys,merkitse_ei_lahdetta}')::boolean, false);
  v_taulu := COALESCE(NULLIF(v_ehdotus.sisalto #>> '{tyhjennys,taulu}', ''), 'hankkeet');
  v_rivi_id := COALESCE(
    NULLIF(v_ehdotus.sisalto #>> '{tyhjennys,rivi_id}', '')::uuid,
    v_ehdotus.hanke_id
  );

  IF v_kentta IS NULL THEN
    RAISE EXCEPTION 'Tyhjennys: kentta puuttuu';
  END IF;
  IF v_taulu <> 'hankkeet' THEN
    RAISE EXCEPTION 'Tyhjennys tuettu vain hankkeet-taululle';
  END IF;
  IF NOT kentta_tyhjennys_sallittu(v_kentta) THEN
    RAISE EXCEPTION 'Kenttää % ei voi tyhjentää', v_kentta;
  END IF;
  IF v_perustelu IS NULL OR char_length(v_perustelu) < 12 THEN
    RAISE EXCEPTION 'Perustelu vaaditaan (vähintään 12 merkkiä)';
  END IF;

  v_lahde_kentta := agentti_lahde_kentta(v_kentta);

  SELECT * INTO v_hanke
  FROM hankkeet
  WHERE id = v_rivi_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei löytynyt';
  END IF;

  IF v_ehdotus.hanke_id IS DISTINCT FROM v_rivi_id THEN
    RAISE EXCEPTION 'Tyhjennys: hanke_id ei täsmää';
  END IF;

  IF v_kentta IN ('sijainti', 'sijainti_lat', 'sijainti_lon', 'sijainti_alue_tyyppi') THEN
    UPDATE hankkeet
    SET
      sijainti_lat = NULL,
      sijainti_lon = NULL,
      sijainti_alue_tyyppi = NULL
    WHERE id = v_rivi_id;
    v_lahde_kentta := 'sijainti';
  ELSIF v_kentta IN ('toimija_nimi', 'toimija_organisaatio_id') THEN
    UPDATE hankkeet
    SET toimija_organisaatio_id = NULL
    WHERE id = v_rivi_id;
    v_lahde_kentta := 'toimija_organisaatio_id';
  ELSE
    UPDATE hankkeet
    SET
      maakunta = CASE WHEN v_kentta = 'maakunta' THEN NULL ELSE maakunta END,
      teho_mw = CASE WHEN v_kentta = 'teho_mw' THEN NULL ELSE teho_mw END,
      teho_erittelematon_mw = CASE WHEN v_kentta = 'teho_erittelematon_mw' THEN NULL ELSE teho_erittelematon_mw END,
      it_teho_mw = CASE WHEN v_kentta = 'it_teho_mw' THEN NULL ELSE it_teho_mw END,
      pinta_ala_ha = CASE WHEN v_kentta = 'pinta_ala_ha' THEN NULL ELSE pinta_ala_ha END,
      kaava_ala_ha = CASE WHEN v_kentta = 'kaava_ala_ha' THEN NULL ELSE kaava_ala_ha END,
      sahkonkaytto_twh_a = CASE WHEN v_kentta = 'sahkonkaytto_twh_a' THEN NULL ELSE sahkonkaytto_twh_a END,
      generaattorit_lkm = CASE WHEN v_kentta = 'generaattorit_lkm' THEN NULL ELSE generaattorit_lkm END,
      generaattorit_kaytossa_max_lkm = CASE
        WHEN v_kentta = 'generaattorit_kaytossa_max_lkm' THEN NULL
        ELSE generaattorit_kaytossa_max_lkm
      END,
      generaattori_polttoaineteho_mw = CASE
        WHEN v_kentta = 'generaattori_polttoaineteho_mw' THEN NULL
        ELSE generaattori_polttoaineteho_mw
      END,
      yva_diaarinumero = CASE WHEN v_kentta = 'yva_diaarinumero' THEN NULL ELSE yva_diaarinumero END,
      kaavatunnus = CASE WHEN v_kentta = 'kaavatunnus' THEN NULL ELSE kaavatunnus END,
      kortteli = CASE WHEN v_kentta = 'kortteli' THEN NULL ELSE kortteli END
    WHERE id = v_rivi_id;
  END IF;

  DELETE FROM kentta_lahteet
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_rivi_id
    AND kentta = v_lahde_kentta;

  DELETE FROM kentta_tarkistukset
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_rivi_id
    AND kentta = v_lahde_kentta;

  IF v_merkitse THEN
    INSERT INTO kentta_tarkistukset (
      taulu, rivi_id, kentta, tulos, vahvistettu_pvm, merkitty, huomautus
    )
    VALUES (
      'hankkeet',
      v_rivi_id,
      v_lahde_kentta,
      'ei_julkista_lahdetta',
      CURRENT_DATE,
      'ihmisen_vahvistama',
      v_perustelu
    )
    ON CONFLICT (taulu, rivi_id, kentta) DO UPDATE
    SET
      tulos = EXCLUDED.tulos,
      vahvistettu_pvm = EXCLUDED.vahvistettu_pvm,
      merkitty = EXCLUDED.merkitty,
      merkitty_pvm = now(),
      huomautus = EXCLUDED.huomautus;
  END IF;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    perustelu = v_perustelu
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$function$


REVOKE ALL ON FUNCTION public.julkaise_kentta_tyhjennys(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_kentta_tyhjennys(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.julkaise_hanketason_tyhjennykset(p_ehdotus_id uuid, p_kasittelija text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ehdotus muutosehdotukset;
  v_rivi jsonb;
  v_kentta text;
  v_perustelu text;
  v_kentat text[] := ARRAY[]::text[];
  v_osat text[] := ARRAY[]::text[];
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
      'teho_erittelematon_mw',
      'it_teho_mw',
      'pinta_ala_ha',
      'sahkonkaytto_twh_a',
      'generaattorit_lkm',
      'generaattori_polttoaineteho_mw',
      'generaattori_yksikkoteho_mwe',
      'diesel_vuosikulutus_maara',
      'varavoima_paastot_t_co2e'
    ) THEN
      RAISE EXCEPTION 'Kenttää % ei voi tyhjentää tällä ehdotuksella', v_kentta;
    END IF;
    v_kentat := array_append(v_kentat, v_kentta);
    v_osat := array_append(v_osat, format('%I = NULL', v_kentta));
    IF v_kentta = 'diesel_vuosikulutus_maara' THEN
      v_kentat := array_append(v_kentat, 'diesel_vuosikulutus_yksikko');
      v_osat := array_append(v_osat, 'diesel_vuosikulutus_yksikko = NULL');
    END IF;
  END LOOP;

  EXECUTE format(
    'UPDATE hankkeet SET %s WHERE id = $1',
    array_to_string(v_osat, ', ')
  )
  USING v_ehdotus.hanke_id;

  DELETE FROM kentta_lahteet
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_ehdotus.hanke_id
    AND kentta = ANY (v_kentat);

  DELETE FROM kentta_tarkistukset
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_ehdotus.hanke_id
    AND kentta = ANY (v_kentat);

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
$function$


REVOKE ALL ON FUNCTION public.julkaise_hanketason_tyhjennykset(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_hanketason_tyhjennykset(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.kirjaa_julkaistu_muutos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  muutos record;
  v_ehdotus uuid;
  v_lahde_url text;
  v_lahde_otsikko text;
BEGIN
  IF NEW.yhdistetty_kohde_id IS NOT NULL OR NOT NEW.julkaistu THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NOT OLD.julkaistu) THEN
    SELECT e.id INTO v_ehdotus
    FROM muutosehdotukset e
    WHERE e.hanke_id = NEW.id
      AND e.tila = 'hyvaksytty'
      AND e.tyyppi = 'uusi_hanke'
      AND e.kasitelty_pvm >= transaction_timestamp() - interval '5 minutes'
    ORDER BY e.kasitelty_pvm DESC
    LIMIT 1;

    SELECT lahde_url, lahde_otsikko
    INTO v_lahde_url, v_lahde_otsikko
    FROM julkaistu_muutos_lahde(NEW.id, 'uusi_hanke', v_ehdotus);

    INSERT INTO julkaistut_muutokset (
      hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
    )
    VALUES (
      NEW.id, 'uusi_hanke', NEW.nimi, transaction_timestamp(),
      v_lahde_url, v_lahde_otsikko, v_ehdotus
    )
    ON CONFLICT (ehdotus_id, kentta) WHERE ehdotus_id IS NOT NULL DO NOTHING;

    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  FOR muutos IN
    SELECT kentta, arvo
    FROM (
      SELECT
        'nimi'::text AS kentta,
        NULLIF(btrim(NEW.nimi), '') AS arvo,
        NULLIF(btrim(OLD.nimi), '') IS DISTINCT FROM NULLIF(btrim(NEW.nimi), '') AS muuttui
      UNION ALL SELECT 'kunta', NULLIF(btrim(NEW.kunta), ''),
        NULLIF(btrim(OLD.kunta), '') IS DISTINCT FROM NULLIF(btrim(NEW.kunta), '')
      UNION ALL SELECT 'maakunta', NULLIF(btrim(NEW.maakunta), ''),
        NULLIF(btrim(OLD.maakunta), '') IS DISTINCT FROM NULLIF(btrim(NEW.maakunta), '')
      UNION ALL SELECT 'vaihe', NEW.vaihe,
        OLD.vaihe IS DISTINCT FROM NEW.vaihe
      UNION ALL SELECT 'yva_diaarinumero', NULLIF(btrim(NEW.yva_diaarinumero), ''),
        NULLIF(btrim(OLD.yva_diaarinumero), '') IS DISTINCT FROM NULLIF(btrim(NEW.yva_diaarinumero), '')
      UNION ALL SELECT 'kaavatunnus', NULLIF(btrim(NEW.kaavatunnus), ''),
        NULLIF(btrim(OLD.kaavatunnus), '') IS DISTINCT FROM NULLIF(btrim(NEW.kaavatunnus), '')
      UNION ALL SELECT 'kortteli', NULLIF(btrim(NEW.kortteli), ''),
        NULLIF(btrim(OLD.kortteli), '') IS DISTINCT FROM NULLIF(btrim(NEW.kortteli), '')
      UNION ALL SELECT 'sijainti_alue_tyyppi', NULLIF(btrim(NEW.sijainti_alue_tyyppi), ''),
        NULLIF(btrim(OLD.sijainti_alue_tyyppi), '') IS DISTINCT FROM NULLIF(btrim(NEW.sijainti_alue_tyyppi), '')
      UNION ALL SELECT 'it_teho_mw', julkaistu_muutos_numero(NEW.it_teho_mw),
        OLD.it_teho_mw IS DISTINCT FROM NEW.it_teho_mw
      UNION ALL SELECT 'teho_mw', julkaistu_muutos_numero(NEW.teho_mw),
        OLD.teho_mw IS DISTINCT FROM NEW.teho_mw
      UNION ALL SELECT 'teho_erittelematon_mw', julkaistu_muutos_numero(NEW.teho_erittelematon_mw),
        OLD.teho_erittelematon_mw IS DISTINCT FROM NEW.teho_erittelematon_mw
      UNION ALL SELECT 'pinta_ala_ha', julkaistu_muutos_numero(NEW.pinta_ala_ha),
        OLD.pinta_ala_ha IS DISTINCT FROM NEW.pinta_ala_ha
      UNION ALL SELECT 'kaava_ala_ha', julkaistu_muutos_numero(NEW.kaava_ala_ha),
        OLD.kaava_ala_ha IS DISTINCT FROM NEW.kaava_ala_ha
      UNION ALL SELECT 'sahkonkaytto_twh_a', julkaistu_muutos_numero(NEW.sahkonkaytto_twh_a),
        OLD.sahkonkaytto_twh_a IS DISTINCT FROM NEW.sahkonkaytto_twh_a
      UNION ALL SELECT 'generaattori_polttoaineteho_mw', julkaistu_muutos_numero(NEW.generaattori_polttoaineteho_mw),
        OLD.generaattori_polttoaineteho_mw IS DISTINCT FROM NEW.generaattori_polttoaineteho_mw
      UNION ALL SELECT 'generaattorit_lkm', NEW.generaattorit_lkm::text,
        OLD.generaattorit_lkm IS DISTINCT FROM NEW.generaattorit_lkm
      UNION ALL SELECT 'generaattorit_kaytossa_max_lkm', NEW.generaattorit_kaytossa_max_lkm::text,
        OLD.generaattorit_kaytossa_max_lkm IS DISTINCT FROM NEW.generaattorit_kaytossa_max_lkm
      UNION ALL SELECT 'sijainti_lat', julkaistu_muutos_numero(NEW.sijainti_lat),
        OLD.sijainti_lat IS DISTINCT FROM NEW.sijainti_lat
      UNION ALL SELECT 'sijainti_lon', julkaistu_muutos_numero(NEW.sijainti_lon),
        OLD.sijainti_lon IS DISTINCT FROM NEW.sijainti_lon
      UNION ALL SELECT 'toimija_organisaatio_id',
        (SELECT o.nimi FROM organisaatiot o WHERE o.id = NEW.toimija_organisaatio_id),
        OLD.toimija_organisaatio_id IS DISTINCT FROM NEW.toimija_organisaatio_id
    ) ero
    WHERE ero.muuttui
  LOOP
    SELECT e.id INTO v_ehdotus
    FROM muutosehdotukset e
    WHERE e.hanke_id = NEW.id
      AND e.tila = 'hyvaksytty'
      AND e.kasitelty_pvm >= transaction_timestamp() - interval '5 minutes'
      AND (
        (
          e.tyyppi IN ('taydennys', 'korjaus')
          AND (
            jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), muutos.kentta)
            OR (
              muutos.kentta = 'toimija_organisaatio_id'
              AND jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), 'toimija_nimi')
            )
          )
        )
        OR (
          e.tyyppi = 'kentta_tyhjennys'
          AND COALESCE(e.sisalto #>> '{tyhjennys,kentta}', '') IN (muutos.kentta, 'toimija_nimi')
        )
      )
    ORDER BY e.kasitelty_pvm DESC
    LIMIT 1;

    SELECT l.lahde_url, l.lahde_otsikko
    INTO v_lahde_url, v_lahde_otsikko
    FROM julkaistu_muutos_lahde(NEW.id, muutos.kentta, v_ehdotus) AS l;

    IF v_lahde_url IS NULL AND v_ehdotus IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF(e.sisalto #>> ARRAY['kentat', muutos.kentta, 'lahde_url'], ''),
        NULLIF(e.sisalto #>> '{kentat,toimija_nimi,lahde_url}', ''),
        NULLIF(e.sisalto #>> '{tyhjennys,lahde_url}', ''),
        e.lahde_url
      )
      INTO v_lahde_url
      FROM muutosehdotukset e
      WHERE e.id = v_ehdotus;

      SELECT dok.otsikko INTO v_lahde_otsikko
      FROM dokumentit dok
      WHERE dok.julkaistu AND dok.url = v_lahde_url
      LIMIT 1;
    END IF;

    INSERT INTO julkaistut_muutokset (
      hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
    )
    VALUES (
      NEW.id,
      muutos.kentta,
      muutos.arvo,
      transaction_timestamp(),
      v_lahde_url,
      v_lahde_otsikko,
      v_ehdotus
    )
    ON CONFLICT (ehdotus_id, kentta) WHERE ehdotus_id IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$


REVOKE ALL ON FUNCTION public.kirjaa_julkaistu_muutos()
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.kirjaa_julkaistu_muutos() TO service_role;

NOTIFY pgrst, 'reload schema';
