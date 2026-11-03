-- 05 has_function_privilege: anon ja authenticated false, service_role true
-- kaikille viidelle julkaise_*-funktiolle (jos olemassa). Käytä oid-muotoa.

DO $t05$
DECLARE
  v jsonb := '{}'::jsonb;
  r record;
  v_anon boolean;
  v_auth boolean;
  v_svc boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'julkaise_agentti_ehdotus',
        'julkaise_ehdotetut_tiedot',
        'julkaise_kentta_tyhjennys',
        'julkaise_hanketason_tyhjennykset',
        'kirjaa_julkaistu_muutos'
      )
  LOOP
    v_anon := has_function_privilege('anon', r.oid, 'EXECUTE');
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_svc := has_function_privilege('service_role', r.oid, 'EXECUTE');
    v := v || jsonb_build_object(
      r.proname,
      jsonb_build_object(
        'anon', v_anon,
        'authenticated', v_auth,
        'service_role', v_svc,
        'args', r.args
      )
    );
    IF v_anon OR v_auth OR NOT v_svc THEN
      RAISE EXCEPTION 'TESTI_FAIL: % anon=% auth=% svc=%', r.proname, v_anon, v_auth, v_svc;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'TESTI_OK: %', v;
END
$t05$;
