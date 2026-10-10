-- Varavoiman yksikköteho, dieselin vuosikulutus ja päästöt.
-- Lähderivin tila voimassa tai korvattu.
-- Espoon, Kirkkonummen ja Vihdin luvut jonoon.
-- Viiden perustellun päätelmän otsikko ja julkaisija.

ALTER TABLE hankkeet
  ADD COLUMN generaattori_yksikkoteho_mwe numeric(8, 3),
  ADD COLUMN diesel_vuosikulutus_maara numeric(14, 3),
  ADD COLUMN diesel_vuosikulutus_yksikko text,
  ADD COLUMN varavoima_paastot_t_co2e numeric(14, 3);

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_diesel_vuosikulutus_tarkistus CHECK (
    (
      diesel_vuosikulutus_maara IS NULL
      AND diesel_vuosikulutus_yksikko IS NULL
    )
    OR (
      diesel_vuosikulutus_maara > 0
      AND diesel_vuosikulutus_yksikko IN ('litra', 'm3')
    )
  );

COMMENT ON COLUMN hankkeet.generaattori_yksikkoteho_mwe IS
  'Yhden varavoimageneraattorin sähköteho megawatteina (MWe). Ei ole sama kuin generaattori_polttoaineteho_mw, joka on generaattoreiden yhteenlaskettu polttoaineteho.';
COMMENT ON COLUMN hankkeet.generaattori_polttoaineteho_mw IS
  'Varavoimageneraattoreiden yhteenlaskettu polttoaineteho. Ei ole yhden generaattorin sähköteho; se on generaattori_yksikkoteho_mwe.';
COMMENT ON COLUMN hankkeet.diesel_vuosikulutus_maara IS
  'Dieselin vuosikulutus. Yksikkö on diesel_vuosikulutus_yksikko, aikayksikkö on vuosi.';
COMMENT ON COLUMN hankkeet.diesel_vuosikulutus_yksikko IS
  'litra tai m3. Pakollinen, kun vuosikulutus on merkitty.';
COMMENT ON COLUMN hankkeet.varavoima_paastot_t_co2e IS
  'Varavoiman käytön kasvihuonekaasupäästöt tonneina hiilidioksidiekvivalenttia vuodessa. Voimassa olevan lähteen lainaus on pakollinen, koska siitä pitää ilmetä, kuka luvun on laskenut.';

ALTER TABLE hanke_vaihtoehdot
  ADD COLUMN generaattori_yksikkoteho_mwe numeric(8, 3),
  ADD COLUMN diesel_vuosikulutus_maara numeric(14, 3),
  ADD COLUMN diesel_vuosikulutus_yksikko text,
  ADD COLUMN varavoima_paastot_t_co2e numeric(14, 3);

ALTER TABLE hanke_vaihtoehdot
  ADD CONSTRAINT hanke_vaihtoehdot_diesel_vuosikulutus_tarkistus CHECK (
    (
      diesel_vuosikulutus_maara IS NULL
      AND diesel_vuosikulutus_yksikko IS NULL
    )
    OR (
      diesel_vuosikulutus_maara > 0
      AND diesel_vuosikulutus_yksikko IN ('litra', 'm3')
    )
  );

COMMENT ON COLUMN hanke_vaihtoehdot.generaattori_yksikkoteho_mwe IS
  'Yhden varavoimageneraattorin sähköteho megawatteina (MWe). Ei ole sama kuin generaattori_polttoaineteho_mw, joka on generaattoreiden yhteenlaskettu polttoaineteho.';
COMMENT ON COLUMN hanke_vaihtoehdot.generaattori_polttoaineteho_mw IS
  'Varavoimageneraattoreiden yhteenlaskettu polttoaineteho. Ei ole yhden generaattorin sähköteho; se on generaattori_yksikkoteho_mwe.';
COMMENT ON COLUMN hanke_vaihtoehdot.diesel_vuosikulutus_maara IS
  'Dieselin vuosikulutus. Yksikkö on diesel_vuosikulutus_yksikko, aikayksikkö on vuosi.';
COMMENT ON COLUMN hanke_vaihtoehdot.diesel_vuosikulutus_yksikko IS
  'litra tai m3. Pakollinen, kun vuosikulutus on merkitty.';
COMMENT ON COLUMN hanke_vaihtoehdot.varavoima_paastot_t_co2e IS
  'Varavoiman käytön kasvihuonekaasupäästöt tonneina hiilidioksidiekvivalenttia vuodessa. Voimassa olevan lähteen lainaus on pakollinen, koska siitä pitää ilmetä, kuka luvun on laskenut.';

ALTER TABLE kentta_lahteet
  ADD COLUMN tila text NOT NULL DEFAULT 'voimassa',
  ADD COLUMN korvaava_dokumentti_id uuid REFERENCES dokumentit (id);

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_tila_tarkistus CHECK (tila IN ('voimassa', 'korvattu')),
  ADD CONSTRAINT kentta_lahteet_korvaava_tarkistus CHECK (
    (tila = 'voimassa' AND korvaava_dokumentti_id IS NULL)
    OR (tila = 'korvattu' AND korvaava_dokumentti_id IS NOT NULL)
  );

COMMENT ON COLUMN kentta_lahteet.tila IS
  'voimassa täyttää kentän lähdevaatimuksen. korvattu jää näkyviin mutta ei vaikuta kentän arvoon, varmistusmerkintään eikä laskureihin.';
COMMENT ON COLUMN kentta_lahteet.korvaava_dokumentti_id IS
  'Dokumentti, joka korvasi tämän lähteen. Pakollinen, kun tila on korvattu.';

CREATE OR REPLACE FUNCTION lahde_on_olemassa(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kentta_lahteet
    WHERE taulu = p_taulu
      AND rivi_id = p_rivi_id
      AND kentta = p_kentta
      AND tila = 'voimassa'
  );
$$;

CREATE OR REPLACE FUNCTION hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  RETURN puuttuvat;
END;
$$;

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
    puuttuvat := array_append(puuttuvat, 'tunnus');
  END IF;
  IF r.teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'teho_mw');
  END IF;
  IF r.it_teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'it_teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'it_teho_mw');
  END IF;
  IF r.pinta_ala_ha IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'pinta_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'pinta_ala_ha');
  END IF;
  IF r.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := array_append(puuttuvat, 'sahkonkaytto_twh_a');
  END IF;
  IF r.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattorit_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_lkm');
  END IF;
  IF r.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_kaytossa_max_lkm');
  END IF;
  IF r.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_polttoaineteho_mw');
  END IF;
  IF r.generaattori_yksikkoteho_mwe IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattori_yksikkoteho_mwe') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_yksikkoteho_mwe');
  END IF;
  IF r.diesel_vuosikulutus_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'diesel_vuosikulutus_maara') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_maara');
  END IF;
  IF r.diesel_vuosikulutus_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'diesel_vuosikulutus_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_yksikko');
  END IF;
  IF r.varavoima_paastot_t_co2e IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'varavoima_paastot_t_co2e') THEN
    puuttuvat := array_append(puuttuvat, 'varavoima_paastot_t_co2e');
  END IF;
  IF r.polttoainevarasto_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'polttoainevarasto_maara') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_maara');
  END IF;
  IF r.polttoainevarasto_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'polttoainevarasto_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_yksikko');
  END IF;
  IF r.sijainti_alue IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'sijainti') THEN
    puuttuvat := array_append(puuttuvat, 'sijainti');
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_varavoima_paasto_lainaus()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kentta = 'varavoima_paastot_t_co2e'
    AND NEW.tila = 'voimassa'
    AND NULLIF(btrim(NEW.lainaus), '') IS NULL THEN
    RAISE EXCEPTION 'Varavoiman paastoluvun lahde vaatii lainauksen, josta ilmenee luvun laskija';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kentta_lahteet_varavoima_paasto_lainaus
BEFORE INSERT OR UPDATE OF kentta, tila, lainaus ON kentta_lahteet
FOR EACH ROW
EXECUTE FUNCTION tarkista_varavoima_paasto_lainaus();


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
      teho_mw, it_teho_mw, pinta_ala_ha, sahkonkaytto_twh_a,
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
$$;


CREATE OR REPLACE FUNCTION tallenna_kentta_lahde(
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
  IF lahde_url_on_kielletty(p_lahde_url) THEN
    RAISE EXCEPTION 'Lähde-URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
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
    merkitty = EXCLUDED.merkitty,
    tila = 'voimassa',
    korvaava_dokumentti_id = NULL;
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
$$;

COMMENT ON FUNCTION julkaise_hanketason_tyhjennykset(uuid, text) IS
  'Tyhjentää hanketason kentät yhdellä päivityksellä, kun sama luku on julkaistulla vaihtoehdolla. Vain ihmisen hyväksyntä.';

-- Espoo, Kirkkonummi ja Vihti: yksi luku hankkeelle, koska päätelmä ei nimeä vaihtoehtoa.

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES
(
  'taydennys',
  '1eb7d215-b2ab-4b2e-8ec9-50b5bddb5955',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'huomio', 'paatelma-luvut',
    'kentat', jsonb_build_object(
      'generaattori_yksikkoteho_mwe', jsonb_build_object(
        'arvo', '3.3',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
        'lahde_sivu', 10,
        'lainaus', 'Oikea yksittäisten generaattoreiden sähköteho/-kapasiteetti on enintään noin 3,3 MWel.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'diesel_vuosikulutus_maara', jsonb_build_object(
        'arvo', '5990000',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
        'lahde_sivu', 23,
        'lainaus', 'Hankkeen ilmoitetulla dieselin kulutuksella 5 990 000 litraa vuodessa kertoimen tuottama päästöero on hyvin suuri.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'diesel_vuosikulutus_yksikko', jsonb_build_object(
        'arvo', 'litra',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
        'lahde_sivu', 23,
        'lainaus', 'Hankkeen ilmoitetulla dieselin kulutuksella 5 990 000 litraa vuodessa kertoimen tuottama päästöero on hyvin suuri.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'varavoima_paastot_t_co2e', jsonb_build_object(
        'arvo', '19706',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
        'lahde_sivu', 23,
        'lainaus', 'Varavoiman käytöstä aiheutuvat päästöt ovat Syken kansallisia kertoimia käyttäen 19 706 t CO2 ekv. vuodessa.',
        'luottamus', 'vahvistettu',
        'lahde_laji', 'dokumentti'
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
  'Perusteltu päätelmä 4.6.2024. Yksikköteho 3,3 MWe on epävarma (enintään noin). Dieselin 5 990 000 l/a on hankkeesta vastaavan ilmoittama. Päästön 19 706 t CO2e/a on laskenut yhteysviranomainen Syken kertoimilla. Lukuja ei ole nimetty vaihtoehdolle.'
),
(
  'taydennys',
  '59a16b0a-5e06-408e-89eb-60af7bbdfdf4',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'huomio', 'paatelma-luvut',
    'kentat', jsonb_build_object(
      'generaattori_yksikkoteho_mwe', jsonb_build_object(
        'arvo', '3.3',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
        'lahde_sivu', 10,
        'lainaus', 'Oikea yksittäisten generaattoreiden sähköteho/-kapasiteetti on enintään noin 3,3 MWel.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'diesel_vuosikulutus_maara', jsonb_build_object(
        'arvo', '4983300',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
        'lahde_sivu', 25,
        'lainaus', 'Hankkeen ilmoitetulla dieselin kulutuksella 4 983 300 litraa vuodessa kertoimen tuottama päästöero on hyvin suuri.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'diesel_vuosikulutus_yksikko', jsonb_build_object(
        'arvo', 'litra',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
        'lahde_sivu', 25,
        'lainaus', 'Hankkeen ilmoitetulla dieselin kulutuksella 4 983 300 litraa vuodessa kertoimen tuottama päästöero on hyvin suuri.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'varavoima_paastot_t_co2e', jsonb_build_object(
        'arvo', '16644',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
        'lahde_sivu', 25,
        'lainaus', 'Varavoiman käytöstä aiheutuvat päästöt ovat Syken kansallisia kertoimia käyttäen 16 644 t CO2 ekv. vuodessa.',
        'luottamus', 'vahvistettu',
        'lahde_laji', 'dokumentti'
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
  'Perusteltu päätelmä 9.7.2024. Yksikköteho 3,3 MWe on epävarma (enintään noin). Dieselin 4 983 300 l/a on hankkeesta vastaavan ilmoittama. Päästön 16 644 t CO2e/a on laskenut yhteysviranomainen Syken kertoimilla. Lukuja ei ole nimetty vaihtoehdolle.'
),
(
  'taydennys',
  'eb8a2276-96f7-4bbe-91c1-c66b45a7b6f5',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'huomio', 'paatelma-luvut',
    'kentat', jsonb_build_object(
      'generaattori_yksikkoteho_mwe', jsonb_build_object(
        'arvo', '3.3',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
        'lahde_sivu', 7,
        'lainaus', 'Oikea yksittäisten generaattoreiden sähköteho/-kapasiteetti on enintään noin 3,3 MWel.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'diesel_vuosikulutus_maara', jsonb_build_object(
        'arvo', '6644400',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
        'lahde_sivu', 10,
        'lainaus', 'Ilmoitetulla 6 644 400 litran vuosikulutuksella ero on erittäin suuri.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'diesel_vuosikulutus_yksikko', jsonb_build_object(
        'arvo', 'litra',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
        'lahde_sivu', 10,
        'lainaus', 'Ilmoitetulla 6 644 400 litran vuosikulutuksella ero on erittäin suuri.',
        'luottamus', 'epavarma',
        'lahde_laji', 'dokumentti'
      ),
      'varavoima_paastot_t_co2e', jsonb_build_object(
        'arvo', '22192',
        'lahde_url', 'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
        'lahde_sivu', 10,
        'lainaus', 'Varavoiman päästöt ovat Syken kansallisia kertoimia käyttäen 22 192 t CO2 ekv. vuodessa.',
        'luottamus', 'vahvistettu',
        'lahde_laji', 'dokumentti'
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
  'Perusteltu päätelmä 5.6.2024. Yksikköteho 3,3 MWe on epävarma (enintään noin). Dieselin 6 644 400 l/a on ilmoitettu luku. Päästön 22 192 t CO2e/a on laskenut yhteysviranomainen Syken kertoimilla. Lukuja ei ole nimetty vaihtoehdolle.'
);

UPDATE dokumentit
SET
  otsikko = 'Perusteltu päätelmä, Espoon datakeskusalue, 4.6.2024',
  julkaisija = 'Uudenmaan elinkeino-, liikenne- ja ympäristökeskus',
  otsikko_automaattinen = false
WHERE id = '9bc3724b-e17c-4a96-86e2-c53634b36154';

UPDATE dokumentit
SET
  otsikko = 'Perusteltu päätelmä, Kirkkonummen datakeskus, 9.7.2024',
  julkaisija = 'Uudenmaan elinkeino-, liikenne- ja ympäristökeskus',
  otsikko_automaattinen = false
WHERE id = 'e6c8a73e-a35e-4830-8084-c4ec6ef5c8f4';

UPDATE dokumentit
SET
  otsikko = 'Perusteltu päätelmä, Vihdin datakeskus, 5.6.2024',
  julkaisija = 'Uudenmaan elinkeino-, liikenne- ja ympäristökeskus',
  otsikko_automaattinen = false
WHERE id = 'fe04d497-5e2f-411d-81ee-d62abbd50882';

UPDATE dokumentit
SET
  otsikko = 'Perusteltu päätelmä, Lohjan palvelinkeskus, 14.8.2025',
  julkaisija = 'Uudenmaan elinkeino-, liikenne- ja ympäristökeskus',
  otsikko_automaattinen = false
WHERE id = '87087c1a-b3d2-4ffb-b1d6-dd588a7d86cd';

UPDATE dokumentit
SET
  otsikko = 'Perusteltu päätelmä, palvelinkeskusalueen laajennus, Hamina, 20.6.2024',
  julkaisija = 'Kaakkois-Suomen elinkeino-, liikenne- ja ympäristökeskus',
  otsikko_automaattinen = false
WHERE id = '17197632-9e1d-4c93-8921-64695fd919a6';

SELECT tallenna_kentta_lahde(
  'dokumentit', '9bc3724b-e17c-4a96-86e2-c53634b36154', 'otsikko',
  'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Perusteltu päätelmä on yhteysviranomaisen perusteltu johtopäätös hankkeen merkittävistä ympäristövaikutuksista.',
  'ihmisen_vahvistama', 'dokumentti'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', '9bc3724b-e17c-4a96-86e2-c53634b36154', 'julkaisija',
  'https://www.ymparisto.fi/sites/default/files/documents/Espoon%20datakeskus_Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_040624.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Hankkeen yhteysviranomaisena on toiminut Uudenmaan elinkeino-, liikenne- ja ympäristökeskus.',
  'ihmisen_vahvistama', 'dokumentti'
);

SELECT tallenna_kentta_lahde(
  'dokumentit', 'e6c8a73e-a35e-4830-8084-c4ec6ef5c8f4', 'otsikko',
  'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Perusteltu päätelmä on yhteysviranomaisen hankkeen merkittävistä ympäristövaikutuksista tekemä perusteltu johtopäätös, joka on tehty arviointiselostuksen, siitä annettujen mielipiteiden ja lausuntojen, sekä yhteysviranomaisen oman tarkastelun pohjalta ympäristövaikutusten arviointimenettelystä annetun lain nojalla (YVA-laki; 252/2017).',
  'ihmisen_vahvistama', 'dokumentti'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', 'e6c8a73e-a35e-4830-8084-c4ec6ef5c8f4', 'julkaisija',
  'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Kirkkonummen%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4_09072024.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Hankkeen yhteysviranomaisena on toiminut Uudenmaan elinkeino-, liikenne- ja ympäristökeskus.',
  'ihmisen_vahvistama', 'dokumentti'
);

SELECT tallenna_kentta_lahde(
  'dokumentit', 'fe04d497-5e2f-411d-81ee-d62abbd50882', 'otsikko',
  'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Perusteltu päätelmä on yhteysviranomaisen hankkeen merkittävistä ympäristövaikutuksista tekemä perusteltu johtopäätös, joka on tehty arviointiselostuksen, siitä annettujen mielipiteiden ja lausuntojen, sekä yhteysviranomaisen oman tarkastelun pohjalta ympäristövaikutusten arviointimenettelystä annetun lain nojalla (jäljempänä YVA-laki).',
  'ihmisen_vahvistama', 'dokumentti'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', 'fe04d497-5e2f-411d-81ee-d62abbd50882', 'julkaisija',
  'https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Vihdin%20datakeskus_perusteltu%20p%C3%A4%C3%A4telm%C3%A4.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Hankkeen yhteysviranomaisena on toiminut Uudenmaan elinkeino-, liikenne- ja ympäristökeskus.',
  'ihmisen_vahvistama', 'dokumentti'
);

SELECT tallenna_kentta_lahde(
  'dokumentit', '87087c1a-b3d2-4ffb-b1d6-dd588a7d86cd', 'otsikko',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20Lohja%20datakeskus%20UUDELY_10162_2024.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Perusteltu päätelmä on yhteysviranomaisen hankkeen merkittävistä ympäristövaikutuksista tekemä perusteltu johtopäätös, joka on tehty arviointiselostuksen, siitä annettujen mielipiteiden ja lausuntojen, sekä yhteysviranomaisen oman tarkastelun pohjalta ympäristövaikutusten arviointimenettelystä annetun lain nojalla (jäljempänä YVA-laki).',
  'ihmisen_vahvistama', 'dokumentti'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', '87087c1a-b3d2-4ffb-b1d6-dd588a7d86cd', 'julkaisija',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20Lohja%20datakeskus%20UUDELY_10162_2024.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Hankkeen yhteysviranomaisena on toiminut Uudenmaan elinkeino-, liikenne- ja ympäristökeskus.',
  'ihmisen_vahvistama', 'dokumentti'
);

SELECT tallenna_kentta_lahde(
  'dokumentit', '17197632-9e1d-4c93-8921-64695fd919a6', 'otsikko',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_Tuike_Finland.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Perusteltu päätelmä on yhteysviranomaisen hankkeen merkittävistä ympäristövaikutuksista tekemä perusteltu johtopäätös, joka on tehty arviointiselostuksen, siitä annettujen mielipiteiden ja lausuntojen, sekä yhteysviranomaisen oman tarkastelun pohjalta ympäristövaikutusten arviointimenettelystä annetun lain nojalla (jäljempänä YVA-laki).',
  'ihmisen_vahvistama', 'dokumentti'
);
SELECT tallenna_kentta_lahde(
  'dokumentit', '17197632-9e1d-4c93-8921-64695fd919a6', 'julkaisija',
  'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4_Tuike_Finland.pdf',
  1, CURRENT_DATE, 'vahvistettu',
  'Hankkeen yhteysviranomaisena on toiminut Kaakkois-Suomen elinkeino-, liikenne- ja ympäristökeskus.',
  'ihmisen_vahvistama', 'dokumentti'
);

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM muutosehdotukset
  WHERE tila = 'odottaa'
    AND sisalto ->> 'huomio' = 'paatelma-luvut'
    AND hanke_id IN (
      '1eb7d215-b2ab-4b2e-8ec9-50b5bddb5955',
      '59a16b0a-5e06-408e-89eb-60af7bbdfdf4',
      'eb8a2276-96f7-4bbe-91c1-c66b45a7b6f5'
    );
  IF n <> 3 THEN
    RAISE EXCEPTION 'Jonossa on % paatelma-luku ehdotusta, odotettiin 3', n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id IN (
      '1eb7d215-b2ab-4b2e-8ec9-50b5bddb5955',
      '59a16b0a-5e06-408e-89eb-60af7bbdfdf4',
      'eb8a2276-96f7-4bbe-91c1-c66b45a7b6f5'
    )
      AND (
        generaattori_yksikkoteho_mwe IS NOT NULL
        OR diesel_vuosikulutus_maara IS NOT NULL
        OR varavoima_paastot_t_co2e IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Luvut julkaistiin, vaikka niiden piti jäädä jonoon';
  END IF;

  IF (
    SELECT count(*) FROM dokumentit
    WHERE julkaisija IS NOT NULL
      AND otsikko LIKE 'Perusteltu päätelmä%'
      AND id IN (
        '9bc3724b-e17c-4a96-86e2-c53634b36154',
        'e6c8a73e-a35e-4830-8084-c4ec6ef5c8f4',
        'fe04d497-5e2f-411d-81ee-d62abbd50882',
        '87087c1a-b3d2-4ffb-b1d6-dd588a7d86cd',
        '17197632-9e1d-4c93-8921-64695fd919a6'
      )
  ) <> 5 THEN
    RAISE EXCEPTION 'Otsikko tai julkaisija jäi korjaamatta';
  END IF;
END $$;
