-- PALAUTUS — §1 REVOKE (merkitse_ls13_era_kuittaukset, taydenna_organisaatio_maa_ytunnuksellisille).
-- Aja vain jos REVOKE pitää perua. Ei datamuutoksia.

GRANT EXECUTE ON FUNCTION public.merkitse_ls13_era_kuittaukset(boolean)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.taydenna_organisaatio_maa_ytunnuksellisille(boolean)
  TO anon, authenticated;
