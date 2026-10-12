-- Kuittaus millä tahansa taululla: merkitty = ihmisen_vahvistama valituille lähderiveille.

CREATE OR REPLACE FUNCTION kuitaa_kentta_lahteet(
  p_lahde_idt uuid[],
  p_kasittelija text,
  p_luottamus text DEFAULT 'vahvistettu'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
BEGIN
  IF p_luottamus NOT IN ('vahvistettu', 'epavarma') THEN
    RAISE EXCEPTION 'Kuittauksen luottamus ei ole sallittu';
  END IF;
  IF p_lahde_idt IS NULL OR cardinality(p_lahde_idt) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE kentta_lahteet
  SET
    merkitty = 'ihmisen_vahvistama',
    luottamus = p_luottamus,
    merkitty_pvm = now()
  WHERE id = ANY (p_lahde_idt)
    AND merkitty = 'koneen_ehdottama'
    AND tila IS DISTINCT FROM 'korvattu';

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION kuitaa_kentta_lahteet(uuid[], text, text) IS
  'Ylläpitäjä kuittaa valitut kentta_lahteet-rivit: merkitty=ihmisen_vahvistama.';

REVOKE ALL ON FUNCTION kuitaa_kentta_lahteet(uuid[], text, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION kuitaa_kentta_lahteet(uuid[], text, text)
  TO service_role;
