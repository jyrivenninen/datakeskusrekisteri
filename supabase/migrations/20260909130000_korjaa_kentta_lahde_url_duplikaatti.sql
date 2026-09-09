-- Jos uusi URL on jo samalla kentällä, poistetaan vanha rikkinäinen rivi (ei UPDATE-duplikaattia).

CREATE OR REPLACE FUNCTION korjaa_kentta_lahde_url(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text,
  p_vanha_url text,
  p_uusi_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uusi text := btrim(COALESCE(p_uusi_url, ''));
  v_vanha text := btrim(COALESCE(p_vanha_url, ''));
BEGIN
  IF v_uusi !~ '^https?://' THEN
    RAISE EXCEPTION 'Uusi lähde-URL puuttuu tai on virheellinen.';
  END IF;
  IF v_vanha = '' THEN
    RAISE EXCEPTION 'Vanha lähde-URL puuttuu.';
  END IF;
  IF v_vanha = v_uusi THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM kentta_lahteet
    WHERE taulu = p_taulu
      AND rivi_id = p_rivi_id
      AND kentta = p_kentta
      AND lahde_url = v_uusi
  ) THEN
    DELETE FROM kentta_lahteet
    WHERE taulu = p_taulu
      AND rivi_id = p_rivi_id
      AND kentta = p_kentta
      AND lahde_url = v_vanha;
    RETURN;
  END IF;

  UPDATE kentta_lahteet
  SET
    lahde_url = v_uusi,
    vahvistettu_pvm = CURRENT_DATE
  WHERE taulu = p_taulu
    AND rivi_id = p_rivi_id
    AND kentta = p_kentta
    AND lahde_url = v_vanha;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM kentta_lahteet
      WHERE taulu = p_taulu
        AND rivi_id = p_rivi_id
        AND kentta = p_kentta
        AND lahde_url = v_uusi
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Lähdettä ei löytynyt. Tarkista, ettei URL:ää ole jo korjattu.';
  END IF;
END;
$$;
