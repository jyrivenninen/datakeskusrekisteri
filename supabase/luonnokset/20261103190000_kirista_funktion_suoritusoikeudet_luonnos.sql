-- LUONNOS, EI AJETA.
-- Ei kuulu supabase/migrations/-kansioon: supabase db push ajaisi sen.
-- Kiristää yhdeksän olemassa olevan funktion suoritusoikeudet vain service_rolelle.
-- Tuotannon nykytila (2026-11-03), jonka hukkalämpömigraatio jättää ennalleen,
-- koska CREATE OR REPLACE FUNCTION ei muuta omistajaa eikä oikeuksia:
--   agentti_lahde_kentta, agentti_saako_julkaista_kentan, hanke_kentta_arvo,
--   kentta_tyhjennys_sallittu: EXECUTE anon, authenticated, agentti, service_role
--   hanke_kentta_on_tyhja, julkaise_ehdotetut_tiedot, julkaise_kentta_tyhjennys,
--   kirjaa_julkaistu_muutos: EXECUTE vain service_role
--   hanke_puuttuvat_lahteet: ei EXECUTE-oikeutta näille rooleille

REVOKE ALL ON FUNCTION public.agentti_lahde_kentta(text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.agentti_lahde_kentta(text) TO service_role;

REVOKE ALL ON FUNCTION public.agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.hanke_kentta_arvo(hankkeet, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.hanke_kentta_arvo(hankkeet, text) TO service_role;

REVOKE ALL ON FUNCTION public.hanke_kentta_on_tyhja(hankkeet, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.hanke_kentta_on_tyhja(hankkeet, text) TO service_role;

REVOKE ALL ON FUNCTION public.hanke_puuttuvat_lahteet(hankkeet)
  FROM PUBLIC, anon, authenticated, agentti, service_role;

REVOKE ALL ON FUNCTION public.julkaise_ehdotetut_tiedot(text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_ehdotetut_tiedot(text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.kirjaa_julkaistu_muutos()
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.kirjaa_julkaistu_muutos() TO service_role;

REVOKE ALL ON FUNCTION public.kentta_tyhjennys_sallittu(text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.kentta_tyhjennys_sallittu(text) TO service_role;

REVOKE ALL ON FUNCTION public.julkaise_kentta_tyhjennys(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_kentta_tyhjennys(uuid, text) TO service_role;
