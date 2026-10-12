-- Polttoainevarasto myös hanketasolle (Kouvola-Voikkaa VE1 oli vain tätä varten).

ALTER TABLE hankkeet
  ADD COLUMN IF NOT EXISTS polttoainevarasto_maara numeric(14, 3),
  ADD COLUMN IF NOT EXISTS polttoainevarasto_yksikko text;

ALTER TABLE hankkeet
  DROP CONSTRAINT IF EXISTS hankkeet_polttoainevarasto_tarkistus;

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_polttoainevarasto_tarkistus CHECK (
    (
      polttoainevarasto_maara IS NULL
      AND polttoainevarasto_yksikko IS NULL
    )
    OR (
      polttoainevarasto_maara > 0
      AND polttoainevarasto_yksikko IN ('m3', 'litra', 'mw')
    )
  );

COMMENT ON COLUMN hankkeet.polttoainevarasto_maara IS
  'Varastoitavan polttoaineen määrä hanketasolla. Yksikkö on polttoainevarasto_yksikko.';
COMMENT ON COLUMN hankkeet.polttoainevarasto_yksikko IS
  'm3, litra tai mw. Pakollinen, kun määrä on merkitty.';

-- Lähdepakko
CREATE OR REPLACE FUNCTION public.hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF h.nimi IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'nimi') THEN
    puuttuvat := array_append(puuttuvat, 'nimi');
  END IF;
  IF h.kunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kunta') THEN
    puuttuvat := array_append(puuttuvat, 'kunta');
  END IF;
  IF h.vaihe IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'vaihe') THEN
    puuttuvat := array_append(puuttuvat, 'vaihe');
  END IF;
  IF (h.sijainti_lat IS NOT NULL OR h.sijainti_alue IS NOT NULL)
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
    puuttuvat := array_append(puuttuvat, 'sijainti');
  END IF;
  IF h.teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'teho_mw');
  END IF;
  IF h.it_teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'it_teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'it_teho_mw');
  END IF;
  IF h.pinta_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'pinta_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'pinta_ala_ha');
  END IF;
  IF h.kaava_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaava_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'kaava_ala_ha');
  END IF;
  IF h.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := array_append(puuttuvat, 'sahkonkaytto_twh_a');
  END IF;
  IF h.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_lkm');
  END IF;
  IF h.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_kaytossa_max_lkm');
  END IF;
  IF h.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_polttoaineteho_mw');
  END IF;
  IF h.generaattori_yksikkoteho_mwe IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_yksikkoteho_mwe') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_yksikkoteho_mwe');
  END IF;
  IF h.diesel_vuosikulutus_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'diesel_vuosikulutus_maara') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_maara');
  END IF;
  IF h.diesel_vuosikulutus_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'diesel_vuosikulutus_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_yksikko');
  END IF;
  IF h.varavoima_paastot_t_co2e IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'varavoima_paastot_t_co2e') THEN
    puuttuvat := array_append(puuttuvat, 'varavoima_paastot_t_co2e');
  END IF;
  IF h.polttoainevarasto_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'polttoainevarasto_maara') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_maara');
  END IF;
  IF h.polttoainevarasto_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'polttoainevarasto_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_yksikko');
  END IF;
  IF h.toimija_organisaatio_id IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'toimija_organisaatio_id') THEN
    puuttuvat := array_append(puuttuvat, 'toimija_organisaatio_id');
  END IF;
  IF h.yva_diaarinumero IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'yva_diaarinumero') THEN
    puuttuvat := array_append(puuttuvat, 'yva_diaarinumero');
  END IF;
  IF h.kaavatunnus IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaavatunnus') THEN
    puuttuvat := array_append(puuttuvat, 'kaavatunnus');
  END IF;
  IF h.kortteli IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kortteli') THEN
    puuttuvat := array_append(puuttuvat, 'kortteli');
  END IF;
  IF h.huomautus IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'huomautus') THEN
    puuttuvat := array_append(puuttuvat, 'huomautus');
  END IF;
  RETURN puuttuvat;
END;
$function$;

-- Kouvola-Voikkaa: siirrä VE1-polttoaine hankkeelle ja piilota VE1
DO $$
DECLARE
  v_hanke_id uuid := 'd92e39ef-2054-4ecb-9e5c-24eea5a3e9ed';
  v_ve_id uuid := '0d8c450c-0331-449b-9e84-2484f0693b49';
  v_maara numeric;
  v_yksikko text;
  v_url text := 'https://ep10.kouvola.fi/kokous/20261369-7-158386.PDF';
  v_lainaus text := '600 m³ polttoainevarasto; 40 varavoimamoduulia, kussakin 15 m³';
BEGIN
  SELECT polttoainevarasto_maara, polttoainevarasto_yksikko
  INTO v_maara, v_yksikko
  FROM hanke_vaihtoehdot
  WHERE id = v_ve_id AND hanke_id = v_hanke_id;

  IF v_maara IS NULL THEN
    RAISE NOTICE 'Kouvola VE1: ei polttoainetta siirrettäväksi';
    RETURN;
  END IF;

  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_hanke_id, 'polttoainevarasto_maara',
    v_url, 1, CURRENT_DATE, 'epavarma', v_lainaus,
    'ihmisen_vahvistama', 'dokumentti'
  );
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_hanke_id, 'polttoainevarasto_yksikko',
    v_url, 1, CURRENT_DATE, 'epavarma', v_lainaus,
    'ihmisen_vahvistama', 'dokumentti'
  );

  UPDATE hankkeet
  SET
    polttoainevarasto_maara = v_maara,
    polttoainevarasto_yksikko = v_yksikko
  WHERE id = v_hanke_id;

  -- VE1:llä ei muita lukuja → piilotetaan (ei poisteta, lähteet säilyvät)
  UPDATE hanke_vaihtoehdot
  SET julkaistu = false
  WHERE id = v_ve_id AND hanke_id = v_hanke_id;

  RAISE NOTICE 'Kouvola: polttoaine % % hankkeelle, VE1 piilotettu', v_maara, v_yksikko;
END;
$$;
