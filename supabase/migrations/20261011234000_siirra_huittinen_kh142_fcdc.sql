-- Kh 5.10.2026 §142 FCDC Corp Oy:n asemakaava kirjattiin erässä 1
-- Greensky Huittinen Korvenkylälle, vaikka huomautus sanoi "eri hanke (FCDC)".
-- Siirretään FCDC Huittinen, Raumantie -hankkeelle.

DO $$
DECLARE
  v_greensky uuid := '950b05fd-7562-448c-8973-c83ac2a985ca';
  v_fcdc uuid := '65af4efe-b435-46de-9ef0-90b52ac109ca';
  v_url text := 'https://huittinen-julkaisu.triplancloud.fi/ktwebscr/fileshow?doctype=7&docid=94636';
  n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_fcdc AND nimi = 'FCDC Huittinen, Raumantie' AND julkaistu
  ) THEN
    RAISE EXCEPTION 'FCDC Huittinen, Raumantie puuttuu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dokumentit WHERE url = v_url AND hanke_id = v_fcdc
  ) THEN
    RAISE NOTICE 'Kh §142 on jo FCDC Huittinen Raumantiellä.';
    RETURN;
  END IF;

  UPDATE dokumentit
  SET hanke_id = v_fcdc
  WHERE url = v_url
    AND hanke_id = v_greensky;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Siirto epäonnistui (päivittyi %).', n;
  END IF;
END;
$$;
