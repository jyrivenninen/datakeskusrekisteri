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
  IF h.sijaintiperustelu IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijaintiperustelu') THEN
    puuttuvat := array_append(puuttuvat, 'sijaintiperustelu');
  END IF;
  IF h.muut_sijainnit IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'muut_sijainnit') THEN
    puuttuvat := array_append(puuttuvat, 'muut_sijainnit');
  END IF;
  RETURN puuttuvat;
END;
$function$;

CREATE OR REPLACE FUNCTION julkaise_sijaintiperustelu(
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
  v_perustelu jsonb;
  v_muut jsonb;
  v_teksti text;
  v_muut_arvo text;
  v_lahde_url text;
  v_lahde_sivu integer;
  v_lainaus text;
  v_luottamus text;
  v_lahde_laji text;
  v_vahvistettu_pvm date;
BEGIN
  IF p_kasittelija IS NULL OR btrim(p_kasittelija) = '' THEN
    RAISE EXCEPTION 'Käsittelijä puuttuu';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei löytynyt';
  END IF;
  IF v_ehdotus.tila IS DISTINCT FROM 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotus on jo käsitelty';
  END IF;
  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Ehdotukselta puuttuu hanke';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_ehdotus.hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  v_perustelu := v_ehdotus.sisalto -> 'kentat' -> 'sijaintiperustelu';
  v_muut := v_ehdotus.sisalto -> 'kentat' -> 'muut_sijainnit';
  IF (v_perustelu IS NULL OR jsonb_typeof(v_perustelu) <> 'object')
     AND (v_muut IS NULL OR jsonb_typeof(v_muut) <> 'object') THEN
    RAISE EXCEPTION 'Ehdotuksesta puuttuu sijaintiperustelu tai muut_sijainnit';
  END IF;

  IF v_perustelu IS NOT NULL AND jsonb_typeof(v_perustelu) = 'object' THEN
    v_teksti := NULLIF(btrim(COALESCE(v_perustelu ->> 'arvo', '')), '');
    v_lahde_url := NULLIF(btrim(COALESCE(v_perustelu ->> 'lahde_url', '')), '');
    v_lainaus := NULLIF(btrim(COALESCE(v_perustelu ->> 'lainaus', '')), '');
    v_luottamus := COALESCE(NULLIF(btrim(COALESCE(v_perustelu ->> 'luottamus', '')), ''), 'epavarma');
    v_lahde_laji := COALESCE(NULLIF(btrim(COALESCE(v_perustelu ->> 'lahde_laji', '')), ''), 'dokumentti');
    IF v_perustelu ? 'lahde_sivu' AND v_perustelu ->> 'lahde_sivu' ~ '^[0-9]+$' THEN
      v_lahde_sivu := (v_perustelu ->> 'lahde_sivu')::integer;
    ELSE
      v_lahde_sivu := NULL;
    END IF;
    IF v_perustelu ? 'vahvistettu_pvm' AND (v_perustelu ->> 'vahvistettu_pvm') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      v_vahvistettu_pvm := (v_perustelu ->> 'vahvistettu_pvm')::date;
    ELSE
      v_vahvistettu_pvm := CURRENT_DATE;
    END IF;
    IF v_teksti IS NULL OR v_lahde_url IS NULL OR v_lainaus IS NULL THEN
      RAISE EXCEPTION 'Sijaintiperustelulta puuttuu arvo, lähde tai lainaus';
    END IF;
    UPDATE hankkeet SET sijaintiperustelu = v_teksti WHERE id = v_ehdotus.hanke_id;
    PERFORM tallenna_kentta_lahde(
      'hankkeet', v_ehdotus.hanke_id, 'sijaintiperustelu',
      v_lahde_url, v_lahde_sivu, v_vahvistettu_pvm, v_luottamus, v_lainaus,
      'ihmisen_vahvistama', v_lahde_laji
    );
  END IF;

  IF v_muut IS NOT NULL AND jsonb_typeof(v_muut) = 'object' THEN
    v_muut_arvo := NULLIF(btrim(COALESCE(v_muut ->> 'arvo', '')), '');
    v_lahde_url := NULLIF(btrim(COALESCE(v_muut ->> 'lahde_url', '')), '');
    v_lainaus := NULLIF(btrim(COALESCE(v_muut ->> 'lainaus', '')), '');
    v_luottamus := COALESCE(NULLIF(btrim(COALESCE(v_muut ->> 'luottamus', '')), ''), 'epavarma');
    v_lahde_laji := COALESCE(NULLIF(btrim(COALESCE(v_muut ->> 'lahde_laji', '')), ''), 'dokumentti');
    IF v_muut ? 'lahde_sivu' AND v_muut ->> 'lahde_sivu' ~ '^[0-9]+$' THEN
      v_lahde_sivu := (v_muut ->> 'lahde_sivu')::integer;
    ELSE
      v_lahde_sivu := NULL;
    END IF;
    IF v_muut ? 'vahvistettu_pvm' AND (v_muut ->> 'vahvistettu_pvm') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      v_vahvistettu_pvm := (v_muut ->> 'vahvistettu_pvm')::date;
    ELSE
      v_vahvistettu_pvm := CURRENT_DATE;
    END IF;
    IF v_muut_arvo IS NULL OR v_lahde_url IS NULL OR v_lainaus IS NULL THEN
      RAISE EXCEPTION 'muut_sijainnit-kentältä puuttuu arvo, lähde tai lainaus';
    END IF;
    IF v_muut_arvo NOT IN (
      'tarkasteltu_ja_nimetty', 'tarkasteltu_nimeamatta', 'ei_kasitelty'
    ) THEN
      RAISE EXCEPTION 'muut_sijainnit-arvo ei ole sallittu';
    END IF;
    UPDATE hankkeet SET muut_sijainnit = v_muut_arvo WHERE id = v_ehdotus.hanke_id;
    PERFORM tallenna_kentta_lahde(
      'hankkeet', v_ehdotus.hanke_id, 'muut_sijainnit',
      v_lahde_url, v_lahde_sivu, v_vahvistettu_pvm, v_luottamus, v_lainaus,
      'ihmisen_vahvistama', v_lahde_laji
    );
  END IF;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id;
END;
$$;

COMMENT ON FUNCTION julkaise_sijaintiperustelu(uuid, text) IS
  'Hyväksyy sijaintiperustelun ja/tai muiden sijaintien tarkastelun lähteineen. Vain ihmisen hyväksyntä.';

REVOKE ALL ON FUNCTION julkaise_sijaintiperustelu(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_sijaintiperustelu(uuid, text) TO service_role;
