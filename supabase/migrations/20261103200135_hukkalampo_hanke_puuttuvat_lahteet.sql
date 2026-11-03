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
  IF h.polttoainevarasto_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'polttoainevarasto_maara') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_maara');
  END IF;
  IF h.polttoainevarasto_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'polttoainevarasto_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_yksikko');
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
  IF h.hukkalampo_tila IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'hukkalampo_tila') THEN
    puuttuvat := array_append(puuttuvat, 'hukkalampo_tila');
  END IF;
  IF h.hukkalampo_vastaanottaja_id IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'hukkalampo_vastaanottaja_id') THEN
    puuttuvat := array_append(puuttuvat, 'hukkalampo_vastaanottaja_id');
  END IF;
  IF h.hukkalampo_gwh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'hukkalampo_gwh_a') THEN
    puuttuvat := array_append(puuttuvat, 'hukkalampo_gwh_a');
  END IF;
  IF h.hukkalampo_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'hukkalampo_mw') THEN
    puuttuvat := array_append(puuttuvat, 'hukkalampo_mw');
  END IF;
  RETURN puuttuvat;
END;
$function$;
