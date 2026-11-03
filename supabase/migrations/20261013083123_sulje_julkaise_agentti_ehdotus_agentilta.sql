-- Suppea sulku: vain automaattijulkaisu. Rooli, jäsenyys ja INSERT-policy ennallaan.
-- Ennen ajoa: proacl = {postgres=X/postgres,agentti=X/postgres}

REVOKE ALL ON FUNCTION public.julkaise_agentti_ehdotus(uuid)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION public.julkaise_agentti_ehdotus(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF has_function_privilege('agentti', 'public.julkaise_agentti_ehdotus(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'agentti EXECUTE yhä true';
  END IF;
  IF has_function_privilege('anon', 'public.julkaise_agentti_ehdotus(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon EXECUTE true';
  END IF;
  IF has_function_privilege('authenticated', 'public.julkaise_agentti_ehdotus(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated EXECUTE true';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.julkaise_agentti_ehdotus(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role EXECUTE false';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.muutosehdotukset'::regclass
      AND polname = 'muutosehdotukset_agentti_lisays'
  ) THEN
    RAISE EXCEPTION 'agentti INSERT-policy katosi';
  END IF;
END $$;
