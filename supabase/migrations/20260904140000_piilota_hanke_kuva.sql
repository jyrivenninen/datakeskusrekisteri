-- Ylläpitäjä piilottaa julkaistun hankkeen kuvan (julkaistu = false). Ei rivin poistoa.

CREATE FUNCTION piilota_hanke_kuva(
  p_kuva_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kuva hanke_kuvat%ROWTYPE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_kuva
  FROM hanke_kuvat
  WHERE id = p_kuva_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kuvaa ei löytynyt';
  END IF;

  IF NOT v_kuva.julkaistu THEN
    RAISE EXCEPTION 'Kuva on jo piilotettu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_kuva.hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  UPDATE hanke_kuvat
  SET julkaistu = false
  WHERE id = p_kuva_id
    AND julkaistu = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kuvaa ei voitu piilottaa';
  END IF;
END;
$$;

COMMENT ON FUNCTION piilota_hanke_kuva(uuid, text) IS
  'Yllapitaja piilottaa julkaistun kuvan julkiselta sivulta. Rivi ja lahteet sailyvat.';

REVOKE ALL ON FUNCTION piilota_hanke_kuva(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION piilota_hanke_kuva(uuid, text) TO service_role;
