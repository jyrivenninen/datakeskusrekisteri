-- Rollback: palauta agentti EXECUTE julkaise_agentti_ehdotus (tila ennen 2026-10-13 sulkua)
REVOKE ALL ON FUNCTION public.julkaise_agentti_ehdotus(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.julkaise_agentti_ehdotus(uuid) TO agentti;
-- postgres omistaa funktion; EXECUTE postgres säilyy.
NOTIFY pgrst, 'reload schema';
