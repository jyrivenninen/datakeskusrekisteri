-- Rollback: agentti lukee kaikki rivit (vanha USING (true)).
-- Ajettu ennen: muutosehdotukset_agentti_luku_omat
DROP POLICY IF EXISTS muutosehdotukset_agentti_luku ON public.muutosehdotukset;
CREATE POLICY muutosehdotukset_agentti_luku
ON public.muutosehdotukset
FOR SELECT
TO agentti
USING (true);

NOTIFY pgrst, 'reload schema';
