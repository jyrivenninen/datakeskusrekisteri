-- service_rolella ei ole UPDATE-oikeutta dokumentit-tauluun.
-- Sisältötiiviste kirjoitetaan SECURITY DEFINER -RPC:llä.

CREATE OR REPLACE FUNCTION aseta_dokumentti_sisalto_tiiviste(
  p_dokumentti_id uuid,
  p_sisalto_tiiviste text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tiiviste text;
  v_kanoninen_id uuid;
BEGIN
  v_tiiviste := NULLIF(btrim(COALESCE(p_sisalto_tiiviste, '')), '');
  IF v_tiiviste IS NULL OR v_tiiviste !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sisalto_tiiviste ei ole kelvollinen SHA-256.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dokumentit WHERE id = p_dokumentti_id) THEN
    RAISE EXCEPTION 'Dokumenttia ei löytynyt.';
  END IF;

  v_kanoninen_id := hae_kanoninen_dokumentti_sisalolla(v_tiiviste);
  IF v_kanoninen_id = p_dokumentti_id THEN
    v_kanoninen_id := NULL;
  END IF;

  UPDATE dokumentit
  SET
    sisalto_tiiviste = v_tiiviste,
    kanoninen_dokumentti_id = COALESCE(kanoninen_dokumentti_id, v_kanoninen_id)
  WHERE id = p_dokumentti_id;
END;
$$;

COMMENT ON FUNCTION aseta_dokumentti_sisalto_tiiviste(uuid, text) IS
  'Asettaa dokumentin sisalto_tiivisteen (raaka-tavujen SHA-256). '
  'Käytä service_role-kutsusta; suora dokumentit.UPDATE ei ole sallittu.';

REVOKE ALL ON FUNCTION aseta_dokumentti_sisalto_tiiviste(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION aseta_dokumentti_sisalto_tiiviste(uuid, text) TO service_role;
