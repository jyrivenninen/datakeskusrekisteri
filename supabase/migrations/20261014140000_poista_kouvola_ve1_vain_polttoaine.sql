-- Kouvola-Voikkaa VE1 luotiin 2026-10-12 vain polttoainevarastoa varten
-- (luotu_pvm = lähteiden luotu_pvm; ei muita lukuja). Polttoaine on
-- hanketasolla; piilotettu VE1 poistetaan.

DO $$
DECLARE
  v_hanke_id uuid := 'd92e39ef-2054-4ecb-9e5c-24eea5a3e9ed';
  v_ve_id uuid := '0d8c450c-0331-449b-9e84-2484f0693b49';
  v_lkm int;
BEGIN
  SELECT count(*) INTO v_lkm
  FROM hanke_vaihtoehdot
  WHERE id = v_ve_id
    AND hanke_id = v_hanke_id
    AND tunnus = 'VE1'
    AND teho_mw IS NULL
    AND it_teho_mw IS NULL
    AND pinta_ala_ha IS NULL
    AND generaattorit_lkm IS NULL;

  IF v_lkm <> 1 THEN
    RAISE EXCEPTION 'VE1 ei täsmää odotettuun (vain polttoaine) riviin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = v_hanke_id
      AND polttoainevarasto_maara = 600
      AND polttoainevarasto_yksikko = 'm3'
  ) THEN
    RAISE EXCEPTION 'Hanketason polttoainevarasto puuttuu — ei poisteta VE1';
  END IF;

  DELETE FROM kentta_lahteet
  WHERE taulu = 'hanke_vaihtoehdot' AND rivi_id = v_ve_id;

  DELETE FROM hanke_vaihtoehdot
  WHERE id = v_ve_id AND hanke_id = v_hanke_id;

  RAISE NOTICE 'Kouvola VE1 poistettu';
END;
$$;
