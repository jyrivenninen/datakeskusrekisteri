-- PALAUTUS — hanke_teho_julkinen-näkymä (20261013070631).
-- Aja vain jos näkymä pitää poistaa tuotannosta.

DROP VIEW IF EXISTS public.hanke_teho_julkinen;
NOTIFY pgrst, 'reload schema';
