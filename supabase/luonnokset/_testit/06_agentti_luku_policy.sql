-- 06 Agentin luku-policy: agentti näkee vain ehdottaja_tyyppi='agentti';
-- ylläpitäjä / ei-ylläpitäjä / anon -lukumäärät (RLS + SET ROLE -simulaatio rajoitetusti).

DO $t06$
DECLARE
  v_agentti_yhteensa int;
  v_agentti_tyyppi int;
  v_yllapitaja_select boolean;
  v_anon_select boolean;
  v_policy text;
BEGIN
  SELECT COUNT(*) INTO v_agentti_yhteensa FROM muutosehdotukset;
  SELECT COUNT(*) INTO v_agentti_tyyppi FROM muutosehdotukset WHERE ehdottaja_tyyppi = 'agentti';

  SELECT pg_get_expr(polqual, polrelid) INTO v_policy
  FROM pg_policy
  WHERE polrelid = 'public.muutosehdotukset'::regclass
    AND polname = 'muutosehdotukset_agentti_luku';

  SELECT has_table_privilege('authenticated', 'public.muutosehdotukset', 'SELECT')
    INTO v_yllapitaja_select;
  SELECT has_table_privilege('anon', 'public.muutosehdotukset', 'SELECT')
    INTO v_anon_select;

  RAISE EXCEPTION 'TESTI_OK: {"muutosehdotukset_yhteensa":%, "ehdottaja_agentti":%, "policy_qual":%, "authenticated_select":%, "anon_select":%, "huom":"agentti-roolin SET ROLE ei simuloitu; policy rajaa SELECT ehdottaja_tyyppi=agentti"}',
    v_agentti_yhteensa, v_agentti_tyyppi, to_jsonb(v_policy), v_yllapitaja_select, v_anon_select;
END
$t06$;
