-- Rajaa agentin SELECT-policy omiin ehdotuksiin (ehdottaja_tyyppi = 'agentti').
-- INSERT-policy (muutosehdotukset_agentti_lisays), anon-lomake ja ylläpito ennallaan.
DROP POLICY IF EXISTS muutosehdotukset_agentti_luku ON public.muutosehdotukset;
CREATE POLICY muutosehdotukset_agentti_luku
ON public.muutosehdotukset
FOR SELECT
TO agentti
USING (ehdottaja_tyyppi = 'agentti');

NOTIFY pgrst, 'reload schema';
