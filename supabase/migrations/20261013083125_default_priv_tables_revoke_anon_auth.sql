-- Vaikuttaa vain tuleviin postgresin luomiin tauluihin/sekvensseihin public-skeemassa.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;

DO $$
DECLARE
  v_anon_ins boolean;
  v_auth_ins boolean;
  v_svc_ins boolean;
BEGIN
  CREATE TABLE public.tmp_defpriv_verify_20261013 (id bigserial PRIMARY KEY, x int);
  v_anon_ins := has_table_privilege('anon', 'public.tmp_defpriv_verify_20261013', 'INSERT');
  v_auth_ins := has_table_privilege('authenticated', 'public.tmp_defpriv_verify_20261013', 'INSERT');
  v_svc_ins := has_table_privilege('service_role', 'public.tmp_defpriv_verify_20261013', 'INSERT');
  DROP TABLE public.tmp_defpriv_verify_20261013;
  IF v_anon_ins OR v_auth_ins THEN
    RAISE EXCEPTION 'default privileges eivät poistaneet INSERT: anon=% auth=%', v_anon_ins, v_auth_ins;
  END IF;
  IF NOT v_svc_ins THEN
    RAISE EXCEPTION 'service_role menetti INSERT tmp-tauluun';
  END IF;
END $$;
