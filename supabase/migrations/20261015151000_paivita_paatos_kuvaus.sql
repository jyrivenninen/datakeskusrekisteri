-- Ylläpito: korjaa päätöksen kuvauksen muotoilu (esitys vs hyväksyntä).

CREATE OR REPLACE FUNCTION paivita_paatos_kuvaus(
  p_paatos_id uuid,
  p_kuvaus text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
BEGIN
  UPDATE paatokset
  SET kuvaus = NULLIF(btrim(COALESCE(p_kuvaus, '')), '')
  WHERE id = p_paatos_id;

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION paivita_paatos_kuvaus(uuid, text) IS
  'Päivittää päätöksen kuvauksen (muotoilusääntö esitys/hyväksyntä).';

REVOKE ALL ON FUNCTION paivita_paatos_kuvaus(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION paivita_paatos_kuvaus(uuid, text) TO service_role;
