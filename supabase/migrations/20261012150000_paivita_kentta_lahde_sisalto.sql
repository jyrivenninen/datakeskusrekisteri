-- Päivitä yhden kentta_lahteet-rivin URL, lainaus ja/tai dokumentti_id.
-- Jos uusi URL on jo samalla kentällä, vanha rivi poistetaan (ei duplikaattia).

CREATE OR REPLACE FUNCTION paivita_kentta_lahde_sisalto(
  p_lahde_id uuid,
  p_uusi_url text DEFAULT NULL,
  p_lainaus text DEFAULT NULL,
  p_dokumentti_id uuid DEFAULT NULL,
  p_irrota_dokumentti boolean DEFAULT false,
  p_luottamus text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rivi kentta_lahteet%ROWTYPE;
  v_url text;
BEGIN
  SELECT * INTO v_rivi
  FROM kentta_lahteet
  WHERE id = p_lahde_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lähderivää ei löytynyt';
  END IF;

  IF p_luottamus IS NOT NULL
     AND p_luottamus NOT IN ('vahvistettu', 'epavarma', 'ristiriitainen') THEN
    RAISE EXCEPTION 'luottamus ei ole sallittu: %', p_luottamus;
  END IF;

  v_url := CASE
    WHEN p_uusi_url IS NULL THEN v_rivi.lahde_url
    ELSE btrim(p_uusi_url)
  END;

  IF v_url !~ '^https?://' THEN
    RAISE EXCEPTION 'Lähde-URL puuttuu tai on virheellinen.';
  END IF;

  -- Uusi URL jo olemassa samalla kentällä → poista tämä rivi.
  IF v_url <> v_rivi.lahde_url AND EXISTS (
    SELECT 1
    FROM kentta_lahteet
    WHERE taulu = v_rivi.taulu
      AND rivi_id = v_rivi.rivi_id
      AND kentta = v_rivi.kentta
      AND lahde_url = v_url
      AND id <> p_lahde_id
  ) THEN
    DELETE FROM kentta_lahteet WHERE id = p_lahde_id;
    RETURN p_lahde_id;
  END IF;

  UPDATE kentta_lahteet
  SET
    lahde_url = v_url,
    lainaus = CASE
      WHEN p_lainaus IS NULL THEN lainaus
      ELSE p_lainaus
    END,
    dokumentti_id = CASE
      WHEN p_irrota_dokumentti THEN NULL
      WHEN p_dokumentti_id IS NOT NULL THEN p_dokumentti_id
      ELSE dokumentti_id
    END,
    luottamus = CASE
      WHEN p_luottamus IS NULL THEN luottamus
      ELSE p_luottamus
    END,
    vahvistettu_pvm = CURRENT_DATE
  WHERE id = p_lahde_id;

  RETURN p_lahde_id;
END;
$$;

COMMENT ON FUNCTION paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text) IS
  'Päivittää kentta_lahteet-rivin URL:n, lainauksen, dokumentti_id:n ja luottamuksen; duplikaatti-URL poistaa vanhan rivin.';

REVOKE ALL ON FUNCTION paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text)
  TO service_role;

-- Vanha 5-parametrinen allekirjoitus (jos jo asennettu) → sama funktio.
DROP FUNCTION IF EXISTS paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean);
