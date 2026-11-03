-- PALAUTUS — §1 REVOKE (aseta_lahde_kuittaustapa, kirjaa_julkaistu_muutos, 4 taulua).
-- Aja vain jos REVOKE pitää perua. Ei datamuutoksia.

GRANT EXECUTE ON FUNCTION public.aseta_lahde_kuittaustapa(text, uuid, text, text, text, text)
  TO anon, authenticated;
-- PUBLIC-oletus: älä palauta PUBLIC-EXECUTE:a ellei tarkoituksella.

GRANT EXECUTE ON FUNCTION public.kirjaa_julkaistu_muutos()
  TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.tehohavainnot,
  public.yllapitajat,
  public.faktakentta_sitovuus,
  public.hanke_ohjaukset
  TO anon, authenticated;
