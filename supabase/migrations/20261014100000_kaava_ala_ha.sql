-- Kaava-alueen pinta-ala erilleen hankkeen maa-/tonttialasta.

ALTER TABLE hankkeet
  ADD COLUMN IF NOT EXISTS kaava_ala_ha numeric(12, 3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hankkeet_kaava_ala_ha_positiivinen'
  ) THEN
    ALTER TABLE hankkeet
      ADD CONSTRAINT hankkeet_kaava_ala_ha_positiivinen
        CHECK (kaava_ala_ha IS NULL OR kaava_ala_ha > 0);
  END IF;
END $$;

COMMENT ON COLUMN hankkeet.pinta_ala_ha IS
  'Hankkeen maa- tai tonttiala hehtaareina. Ei kaava-alueen pinta-alaa; se on kaava_ala_ha.';

COMMENT ON COLUMN hankkeet.kaava_ala_ha IS
  'Kaava-alueen pinta-ala hehtaareina. Eroaa hankkeen maa- tai tonttialasta (pinta_ala_ha).';

INSERT INTO faktakentta_sitovuus (taulu, kentta, luokka)
SELECT 'hankkeet', 'kaava_ala_ha', 'sitovuus_merkittaa'
WHERE NOT EXISTS (
  SELECT 1 FROM faktakentta_sitovuus
  WHERE taulu = 'hankkeet' AND kentta = 'kaava_ala_ha'
);



CREATE OR REPLACE FUNCTION public.hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF h.nimi IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'nimi') THEN
    puuttuvat := array_append(puuttuvat, 'nimi');
  END IF;
  IF h.kunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kunta') THEN
    puuttuvat := array_append(puuttuvat, 'kunta');
  END IF;
  IF h.vaihe IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'vaihe') THEN
    puuttuvat := array_append(puuttuvat, 'vaihe');
  END IF;
  IF (h.sijainti_lat IS NOT NULL OR h.sijainti_alue IS NOT NULL)
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
    puuttuvat := array_append(puuttuvat, 'sijainti');
  END IF;
  IF h.teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'teho_mw');
  END IF;
  IF h.it_teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'it_teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'it_teho_mw');
  END IF;
  IF h.pinta_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'pinta_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'pinta_ala_ha');
  END IF;
  IF h.kaava_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaava_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'kaava_ala_ha');
  END IF;
  IF h.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := array_append(puuttuvat, 'sahkonkaytto_twh_a');
  END IF;
  IF h.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_lkm');
  END IF;
  IF h.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_kaytossa_max_lkm');
  END IF;
  IF h.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_polttoaineteho_mw');
  END IF;
  IF h.generaattori_yksikkoteho_mwe IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_yksikkoteho_mwe') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_yksikkoteho_mwe');
  END IF;
  IF h.diesel_vuosikulutus_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'diesel_vuosikulutus_maara') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_maara');
  END IF;
  IF h.diesel_vuosikulutus_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'diesel_vuosikulutus_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_yksikko');
  END IF;
  IF h.varavoima_paastot_t_co2e IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'varavoima_paastot_t_co2e') THEN
    puuttuvat := array_append(puuttuvat, 'varavoima_paastot_t_co2e');
  END IF;
  IF h.toimija_organisaatio_id IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'toimija_organisaatio_id') THEN
    puuttuvat := array_append(puuttuvat, 'toimija_organisaatio_id');
  END IF;
  IF h.yva_diaarinumero IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'yva_diaarinumero') THEN
    puuttuvat := array_append(puuttuvat, 'yva_diaarinumero');
  END IF;
  IF h.kaavatunnus IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaavatunnus') THEN
    puuttuvat := array_append(puuttuvat, 'kaavatunnus');
  END IF;
  IF h.kortteli IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kortteli') THEN
    puuttuvat := array_append(puuttuvat, 'kortteli');
  END IF;
  IF h.huomautus IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'huomautus') THEN
    puuttuvat := array_append(puuttuvat, 'huomautus');
  END IF;
  RETURN puuttuvat;
END;
$function$;

CREATE OR REPLACE FUNCTION public.julkaise_ehdotetut_tiedot(p_tyyppi text, p_hanke_id uuid, p_hanke jsonb, p_lahteet jsonb, p_ehdotus_id uuid, p_kasittelija text, p_vaihtoehdot jsonb DEFAULT '[]'::jsonb, p_paivita_ehdotus boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.kentta_tyhjennys_sallittu(p_kentta text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_kentta IN (
    'maakunta',
    'sijainti',
    'sijainti_lat',
    'sijainti_lon',
    'sijainti_alue_tyyppi',
    'teho_mw',
    'it_teho_mw',
    'pinta_ala_ha',
    'kaava_ala_ha',
    'sahkonkaytto_twh_a',
    'generaattorit_lkm',
    'generaattorit_kaytossa_max_lkm',
    'generaattori_polttoaineteho_mw',
    'toimija_organisaatio_id',
    'toimija_nimi',
    'yva_diaarinumero',
    'kaavatunnus',
    'kortteli'
  );
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.hanke_kentta_arvo(p_hanke hankkeet, p_kentta text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    WHEN 'kaava_ala_ha' THEN p_hanke.kaava_ala_ha::text
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
$function$;

CREATE OR REPLACE FUNCTION public.hanke_kentta_on_tyhja(p_hanke hankkeet, p_kentta text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN CASE p_kentta
    WHEN 'maakunta' THEN p_hanke.maakunta IS NULL
    WHEN 'sijainti' THEN
      p_hanke.sijainti_lat IS NULL
      AND p_hanke.sijainti_lon IS NULL
      AND p_hanke.sijainti_alue IS NULL
    WHEN 'teho_mw' THEN p_hanke.teho_mw IS NULL
    WHEN 'it_teho_mw' THEN p_hanke.it_teho_mw IS NULL
    WHEN 'pinta_ala_ha' THEN p_hanke.pinta_ala_ha IS NULL
    WHEN 'kaava_ala_ha' THEN p_hanke.kaava_ala_ha IS NULL
    WHEN 'sahkonkaytto_twh_a' THEN p_hanke.sahkonkaytto_twh_a IS NULL
    WHEN 'generaattorit_lkm' THEN p_hanke.generaattorit_lkm IS NULL
    WHEN 'generaattorit_kaytossa_max_lkm' THEN p_hanke.generaattorit_kaytossa_max_lkm IS NULL
    WHEN 'generaattori_polttoaineteho_mw' THEN p_hanke.generaattori_polttoaineteho_mw IS NULL
    WHEN 'toimija_organisaatio_id' THEN p_hanke.toimija_organisaatio_id IS NULL
    WHEN 'yva_diaarinumero' THEN p_hanke.yva_diaarinumero IS NULL
    WHEN 'kaavatunnus' THEN p_hanke.kaavatunnus IS NULL
    WHEN 'kortteli' THEN p_hanke.kortteli IS NULL
    ELSE NULL
  END;
END;
$function$;
