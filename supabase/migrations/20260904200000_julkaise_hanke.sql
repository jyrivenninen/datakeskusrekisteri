-- Ylläpitäjä julkaisee piilotetun hankkeen julkiselle sivustolle.

CREATE FUNCTION julkaise_hanke(
  p_hanke_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hanke hankkeet%ROWTYPE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_hanke
  FROM hankkeet
  WHERE id = p_hanke_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei löytynyt';
  END IF;

  IF v_hanke.julkaistu THEN
    RAISE EXCEPTION 'Hanke on jo julkaistu';
  END IF;

  IF char_length(trim(v_hanke.nimi)) = 0
    OR char_length(trim(v_hanke.kunta)) = 0
    OR char_length(trim(v_hanke.vaihe)) = 0 THEN
    RAISE EXCEPTION 'Hankkeelta puuttuu nimi, kunta tai vaihe';
  END IF;

  IF v_hanke.toimija_organisaatio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM organisaatiot o
    WHERE o.id = v_hanke.toimija_organisaatio_id
      AND o.julkaistu
  ) THEN
    RAISE EXCEPTION 'Toimija-organisaatio ei ole julkaistu';
  END IF;

  UPDATE hankkeet
  SET julkaistu = true
  WHERE id = p_hanke_id
    AND NOT julkaistu;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei voitu julkaista';
  END IF;
END;
$$;

COMMENT ON FUNCTION julkaise_hanke(uuid, text) IS
  'Yllapitaja julkaisee piilotetun hankkeen julkiselle sivustolle. Agentti ei kutsu.';

REVOKE ALL ON FUNCTION julkaise_hanke(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_hanke(uuid, text) TO service_role;
