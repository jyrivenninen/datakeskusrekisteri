-- Lainauksen rooli asiakirjassa (päätösosa vs esitys vs valmisteluteksti).

ALTER TABLE kentta_lahteet
  ADD COLUMN IF NOT EXISTS lainauksen_luonne text;

ALTER TABLE kentta_lahteet
  DROP CONSTRAINT IF EXISTS kentta_lahteet_lainauksen_luonne_check;

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_lainauksen_luonne_check CHECK (
    lainauksen_luonne IS NULL
    OR lainauksen_luonne IN ('paatososa', 'esitys', 'valmisteluteksti', 'muu')
  );

COMMENT ON COLUMN kentta_lahteet.lainauksen_luonne IS
  'Lainauksen rooli lähdeasiakirjassa: paatososa | esitys | valmisteluteksti | muu. '
  'Ei vaikuta liikennevaloon eikä varmistusprosenttiin (toistaiseksi).';

CREATE OR REPLACE FUNCTION aseta_lahde_lainauksen_luonne(
  p_lahde_id uuid,
  p_luonne text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
BEGIN
  IF p_luonne IS NOT NULL
    AND p_luonne NOT IN ('paatososa', 'esitys', 'valmisteluteksti', 'muu') THEN
    RAISE EXCEPTION 'lainauksen_luonne ei ole sallittu';
  END IF;

  UPDATE kentta_lahteet
  SET lainauksen_luonne = p_luonne
  WHERE id = p_lahde_id
    AND tila IS DISTINCT FROM 'korvattu';

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION aseta_lahde_lainauksen_luonne(uuid, text) IS
  'Asettaa kentta_lahteet.lainauksen_luonne-arvon.';

REVOKE ALL ON FUNCTION aseta_lahde_lainauksen_luonne(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION aseta_lahde_lainauksen_luonne(uuid, text)
  TO service_role;
