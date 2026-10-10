-- Lomakeviestit poistetaan automaattisesti yli 12 kk vanhoilta. Ajo: agents/tarkistukset/palautteet-poisto.ts

COMMENT ON TABLE palautteet IS
  'Lomakkeella jätetyt viestit ylläpidolle. Ei julkaista. Yli 12 kk vanhat rivit poistetaan ajastetusti.';

CREATE OR REPLACE FUNCTION poista_vanhat_palautteet(p_kuukautta integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  poistettu integer;
BEGIN
  IF p_kuukautta IS NULL OR p_kuukautta < 1 THEN
    RAISE EXCEPTION 'p_kuukautta oltava vähintään 1';
  END IF;

  DELETE FROM palautteet
  WHERE luotu_pvm < now() - make_interval(months => p_kuukautta);

  GET DIAGNOSTICS poistettu = ROW_COUNT;
  RETURN poistettu;
END;
$$;

COMMENT ON FUNCTION poista_vanhat_palautteet(integer) IS
  'Poistaa palautteet-taulun rivit, joiden luotu_pvm on yli p_kuukautta vanha. Vain service_role RPC.';

REVOKE ALL ON FUNCTION poista_vanhat_palautteet(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION poista_vanhat_palautteet(integer) TO service_role;
