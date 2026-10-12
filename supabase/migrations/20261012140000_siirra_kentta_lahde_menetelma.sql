-- Siirrä yhden kentta_lahteet-rivin URL menetelmähakuun.
-- Vanhaa kunnan etusivu -dokumenttia ei poisteta; dokumentti_id irrotetaan.
-- (Uutta dokumenttia ei luoda: trg_dokumentit_lahteet vaatisi lähteet.)

CREATE OR REPLACE FUNCTION siirra_kentta_lahde_menetelma_hakuun(
  p_lahde_id uuid,
  p_uusi_url text,
  p_otsikko text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rivi kentta_lahteet%ROWTYPE;
  v_url text := btrim(COALESCE(p_uusi_url, ''));
BEGIN
  IF v_url !~ '^https?://' THEN
    RAISE EXCEPTION 'Uusi lähde-URL puuttuu tai on virheellinen.';
  END IF;

  SELECT * INTO v_rivi
  FROM kentta_lahteet
  WHERE id = p_lahde_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lähderivää ei löytynyt';
  END IF;

  UPDATE kentta_lahteet
  SET
    lahde_url = v_url,
    dokumentti_id = NULL,
    vahvistettu_pvm = CURRENT_DATE
  WHERE id = p_lahde_id;

  RETURN p_lahde_id;
END;
$$;

COMMENT ON FUNCTION siirra_kentta_lahde_menetelma_hakuun(uuid, text, text) IS
  'Päivittää yhden kentta_lahteet-rivin menetelmähaku-URL:ksi; irrottaa dokumentti_id:n, ei poista vanhaa dokumenttia.';

REVOKE ALL ON FUNCTION siirra_kentta_lahde_menetelma_hakuun(uuid, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION siirra_kentta_lahde_menetelma_hakuun(uuid, text, text)
  TO service_role;
