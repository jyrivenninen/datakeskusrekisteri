-- vahvistettu_pvm vain kun lainaus/URL muuttuu tai p_tarkistettu=true.
-- Allekirjoitus muuttuu: vanha 6-parametrinen funktio poistetaan.

DROP FUNCTION IF EXISTS paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text);

CREATE OR REPLACE FUNCTION paivita_kentta_lahde_sisalto(
  p_lahde_id uuid,
  p_uusi_url text DEFAULT NULL,
  p_lainaus text DEFAULT NULL,
  p_dokumentti_id uuid DEFAULT NULL,
  p_irrota_dokumentti boolean DEFAULT false,
  p_luottamus text DEFAULT NULL,
  p_tarkistettu boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rivi kentta_lahteet%ROWTYPE;
  v_url text;
  v_uusi_lainaus text;
  v_paivita_pvm boolean;
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

  v_uusi_lainaus := CASE
    WHEN p_lainaus IS NULL THEN v_rivi.lainaus
    ELSE p_lainaus
  END;

  v_paivita_pvm :=
    p_tarkistettu
    OR (v_uusi_lainaus IS DISTINCT FROM v_rivi.lainaus)
    OR (v_url IS DISTINCT FROM v_rivi.lahde_url);

  UPDATE kentta_lahteet
  SET
    lahde_url = v_url,
    lainaus = v_uusi_lainaus,
    dokumentti_id = CASE
      WHEN p_irrota_dokumentti THEN NULL
      WHEN p_dokumentti_id IS NOT NULL THEN p_dokumentti_id
      ELSE dokumentti_id
    END,
    luottamus = CASE WHEN p_luottamus IS NULL THEN luottamus ELSE p_luottamus END,
    vahvistettu_pvm = CASE
      WHEN v_paivita_pvm THEN CURRENT_DATE
      ELSE v_rivi.vahvistettu_pvm
    END
  WHERE id = p_lahde_id;

  RETURN p_lahde_id;
END;
$$;

COMMENT ON FUNCTION paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text, boolean) IS
  'Päivittää kentta_lahteet-rivin URL:n, lainauksen, dokumentti_id:n ja luottamuksen. '
  'vahvistettu_pvm vaihtuu vain kun lainaus tai URL muuttuu tai p_tarkistettu=true. '
  'Duplikaatti-URL poistaa vanhan rivin.';

REVOKE ALL ON FUNCTION paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION paivita_kentta_lahde_sisalto(uuid, text, text, uuid, boolean, text, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';
