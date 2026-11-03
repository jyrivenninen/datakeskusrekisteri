-- PALAUTUS — sivukatselut_paiva (20261014110000 / MCP sivukatselut_paiva).
-- Palauttaa kirjaa_sivukatselu- ja yhteenvetofunktiot raakatauluun.
-- EI poista sivukatselut-raakadataa. Poistaa sivukatselut_paiva.

CREATE OR REPLACE FUNCTION kirjaa_sivukatselu(p_polku text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polku text;
BEGIN
  v_polku := lower(trim(p_polku));
  IF v_polku = '' OR char_length(v_polku) > 512 THEN
    RETURN;
  END IF;
  IF v_polku !~ '^/[a-z0-9/_-]*$' THEN
    RETURN;
  END IF;
  IF v_polku LIKE '/yllapito%' OR v_polku LIKE '/kirjaudu%' OR v_polku LIKE '/api/%' THEN
    RETURN;
  END IF;
  IF v_polku LIKE '/data/%' OR v_polku LIKE '/_next/%' THEN
    RETURN;
  END IF;
  INSERT INTO sivukatselut (polku) VALUES (v_polku);
END;
$$;

COMMENT ON FUNCTION kirjaa_sivukatselu(text) IS
  'Tallentaa yhden sivulatauksen. Ei tallenna IP:tä. Ohittaa ylläpidon ja API-polut.';

REVOKE ALL ON FUNCTION kirjaa_sivukatselu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kirjaa_sivukatselu(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sivukatselut_paivittain(p_paivia integer DEFAULT 30)
RETURNS TABLE (paiva date, lkm bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (luotu_pvm AT TIME ZONE 'Europe/Helsinki')::date AS paiva,
    count(*)::bigint AS lkm
  FROM sivukatselut
  WHERE onko_yllapitaja()
    AND luotu_pvm >= now() - make_interval(days => greatest(1, least(p_paivia, 366)))
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION sivukatselut_suosituimmat(
  p_paivia integer DEFAULT 30,
  p_rajat integer DEFAULT 20
)
RETURNS TABLE (polku text, lkm bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.polku,
    count(*)::bigint AS lkm
  FROM sivukatselut s
  WHERE onko_yllapitaja()
    AND s.luotu_pvm >= now() - make_interval(days => greatest(1, least(p_paivia, 366)))
  GROUP BY s.polku
  ORDER BY lkm DESC, s.polku
  LIMIT greatest(1, least(p_rajat, 100));
$$;

REVOKE ALL ON FUNCTION sivukatselut_paivittain(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION sivukatselut_suosituimmat(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sivukatselut_paivittain(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION sivukatselut_suosituimmat(integer, integer) TO authenticated;

DROP POLICY IF EXISTS sivukatselut_paiva_yllapito_luku ON sivukatselut_paiva;
DROP TABLE IF EXISTS sivukatselut_paiva;
DROP INDEX IF EXISTS hankkeet_id_julkaistu_idx;

NOTIFY pgrst, 'reload schema';
