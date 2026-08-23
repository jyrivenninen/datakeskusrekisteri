-- Hankealue kartalle (GeoJSON Polygon). Sama lähdekenttä kuin pisteellä: sijainti.

ALTER TABLE hankkeet
  ADD COLUMN sijainti_alue jsonb;

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_sijainti_alue_geojson CHECK (
    sijainti_alue IS NULL
    OR (
      jsonb_typeof(sijainti_alue) = 'object'
      AND sijainti_alue ->> 'type' = 'Polygon'
      AND jsonb_typeof(sijainti_alue -> 'coordinates') = 'array'
    )
  );

COMMENT ON COLUMN hankkeet.sijainti_alue IS
  'Hankealue WGS84-polygonina GeoJSON-muodossa. Lähde kentta_lahteet.kentta = sijainti.';

CREATE OR REPLACE FUNCTION hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF h.nimi IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'nimi') THEN
    puuttuvat := puuttuvat || 'nimi';
  END IF;
  IF h.kunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kunta') THEN
    puuttuvat := puuttuvat || 'kunta';
  END IF;
  IF h.vaihe IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'vaihe') THEN
    puuttuvat := puuttuvat || 'vaihe';
  END IF;
  IF h.maakunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'maakunta') THEN
    puuttuvat := puuttuvat || 'maakunta';
  END IF;
  IF (h.sijainti_lat IS NOT NULL OR h.sijainti_alue IS NOT NULL)
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
    puuttuvat := puuttuvat || 'sijainti';
  END IF;
  IF h.teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_mw') THEN
    puuttuvat := puuttuvat || 'teho_mw';
  END IF;
  IF h.it_teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'it_teho_mw') THEN
    puuttuvat := puuttuvat || 'it_teho_mw';
  END IF;
  IF h.pinta_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'pinta_ala_ha') THEN
    puuttuvat := puuttuvat || 'pinta_ala_ha';
  END IF;
  IF h.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := puuttuvat || 'sahkonkaytto_twh_a';
  END IF;
  IF h.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_lkm';
  END IF;
  IF h.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_kaytossa_max_lkm';
  END IF;
  IF h.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := puuttuvat || 'generaattori_polttoaineteho_mw';
  END IF;
  IF h.toimija_organisaatio_id IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'toimija_organisaatio_id') THEN
    puuttuvat := puuttuvat || 'toimija_organisaatio_id';
  END IF;
  IF h.yva_diaarinumero IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'yva_diaarinumero') THEN
    puuttuvat := puuttuvat || 'yva_diaarinumero';
  END IF;
  RETURN puuttuvat;
END;
$$;
