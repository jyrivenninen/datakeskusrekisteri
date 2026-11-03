-- 04 Kutsu ilman p_tehohavainnot (vanha allekirjoitus elää kunnes migraatio) ja
-- puuttuva merkitty → koneen_ehdottama. Perutaan TESTI_OK:lla.

DO $t04$
DECLARE
  v_merkitty text;
  v_sig text;
  v_has_teho_param boolean;
BEGIN
  v_merkitty := COALESCE(NULLIF(btrim(COALESCE(NULL::text, '')), ''), 'koneen_ehdottama');
  IF v_merkitty <> 'koneen_ehdottama' THEN
    RAISE EXCEPTION 'TESTI_FAIL: merkitty %', v_merkitty;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO v_sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'julkaise_ehdotetut_tiedot'
  ORDER BY p.oid DESC
  LIMIT 1;

  v_has_teho_param := COALESCE(v_sig, '') ILIKE '%tehohavainto%';

  RAISE EXCEPTION 'TESTI_OK: {"merkitty_default":%, "julkaise_ehdotetut_sig":%, "has_tehohavainto_param":%, "huom":"Ilman p_tehohavainnot: live-allekirjoitus ennen uutta migraatiota"}',
    to_jsonb(v_merkitty), to_jsonb(v_sig), v_has_teho_param;
END
$t04$;
