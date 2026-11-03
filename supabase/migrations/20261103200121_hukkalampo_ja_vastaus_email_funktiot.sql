CREATE OR REPLACE FUNCTION public.agentti_lahde_kentta(p_kentta text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_kentta = 'toimija_nimi' THEN 'toimija_organisaatio_id'
    WHEN p_kentta = 'hukkalampo_vastaanottaja_nimi' THEN 'hukkalampo_vastaanottaja_id'
    WHEN p_kentta IN (
      'sijainti_lat',
      'sijainti_lon',
      'sijainti_alue_tyyppi',
      'sijainti_alue'
    ) THEN 'sijainti'
    ELSE p_kentta
  END;
$$;

CREATE OR REPLACE FUNCTION public.agentti_saako_julkaista_kentan(
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

  IF v_lahde_kentta IN (
    'hukkalampo_tila',
    'hukkalampo_vastaanottaja_id',
    'hukkalampo_gwh_a',
    'hukkalampo_mw'
  ) OR p_kentta IN (
    'hukkalampo_tila',
    'hukkalampo_vastaanottaja_id',
    'hukkalampo_vastaanottaja_nimi',
    'hukkalampo_gwh_a',
    'hukkalampo_mw'
  ) THEN
    RETURN false;
  END IF;

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

COMMENT ON FUNCTION public.agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean) IS
  'TRUE jos agentti saa julkaista kentän automaattisesti. Hukkalämpökentät ovat aina FALSE. Varmennettu kenttä on aina FALSE.';

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
    WHEN 'hukkalampo_tila' THEN p_hanke.hukkalampo_tila
    WHEN 'hukkalampo_gwh_a' THEN p_hanke.hukkalampo_gwh_a::text
    WHEN 'hukkalampo_mw' THEN p_hanke.hukkalampo_mw::text
    WHEN 'hukkalampo_vastaanottaja_id' THEN p_hanke.hukkalampo_vastaanottaja_id::text
    WHEN 'hukkalampo_vastaanottaja_nimi' THEN p_hanke.hukkalampo_vastaanottaja_id::text
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
    WHEN 'hukkalampo_tila' THEN p_hanke.hukkalampo_tila IS NULL
    WHEN 'hukkalampo_gwh_a' THEN p_hanke.hukkalampo_gwh_a IS NULL
    WHEN 'hukkalampo_mw' THEN p_hanke.hukkalampo_mw IS NULL
    WHEN 'hukkalampo_vastaanottaja_id' THEN p_hanke.hukkalampo_vastaanottaja_id IS NULL
    WHEN 'hukkalampo_vastaanottaja_nimi' THEN p_hanke.hukkalampo_vastaanottaja_id IS NULL
    ELSE NULL
  END;
END;
$function$;
