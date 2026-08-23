-- Voimalinjat ja maakaapelit. Geometria vain lähteistettynä LineStringina.
-- Tyhjä reitti on sallittu; arvattua viivaa ei tallenneta.

CREATE TABLE hanke_johdot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  menettely_id uuid REFERENCES hanke_menettelyt (id) ON DELETE RESTRICT,
  tyyppi text NOT NULL,
  jannite_kv numeric(8, 3),
  pituus_km numeric(8, 3),
  vaihtoehto text,
  liittymispiste text,
  reitti jsonb,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_johdot_tyyppi_tarkistus CHECK (
    tyyppi IN ('ilmajohto', 'maakaapeli')
  ),
  CONSTRAINT hanke_johdot_jannite_positiivinen CHECK (
    jannite_kv IS NULL OR jannite_kv > 0
  ),
  CONSTRAINT hanke_johdot_pituus_positiivinen CHECK (
    pituus_km IS NULL OR pituus_km > 0
  ),
  CONSTRAINT hanke_johdot_vaihtoehto_ei_tyhja CHECK (
    vaihtoehto IS NULL OR char_length(trim(vaihtoehto)) > 0
  ),
  CONSTRAINT hanke_johdot_liittymispiste_ei_tyhja CHECK (
    liittymispiste IS NULL OR char_length(trim(liittymispiste)) > 0
  ),
  CONSTRAINT hanke_johdot_reitti_geojson CHECK (
    reitti IS NULL
    OR (
      jsonb_typeof(reitti) = 'object'
      AND reitti ->> 'type' IN ('LineString', 'MultiLineString')
      AND jsonb_typeof(reitti -> 'coordinates') = 'array'
    )
  )
);

CREATE TRIGGER trg_hanke_johdot_paivitetty
BEFORE UPDATE ON hanke_johdot
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_johdot_hanke_id_idx ON hanke_johdot (hanke_id);

COMMENT ON TABLE hanke_johdot IS
  'Hankkeen sähkönsiirtoreitit. YVA-vaihtoehdot ovat eri rivejä. Reitti vain jos lähde antaa koordinaatit.';

ALTER TABLE kentta_lahteet
  DROP CONSTRAINT kentta_lahteet_taulu_tarkistus;

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_taulu_tarkistus CHECK (
    taulu IN (
      'hankkeet',
      'maaraajat',
      'organisaatiot',
      'yhteyshenkilot',
      'hanke_kunnat',
      'hanke_menettelyt',
      'hanke_organisaatiot',
      'dokumentit',
      'hanke_johdot'
    )
  );

CREATE OR REPLACE FUNCTION hanke_johto_puuttuvat_lahteet(r hanke_johdot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_johdot', r.id, 'tyyppi') THEN
    puuttuvat := puuttuvat || 'tyyppi';
  END IF;
  IF r.jannite_kv IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_johdot', r.id, 'jannite_kv') THEN
    puuttuvat := puuttuvat || 'jannite_kv';
  END IF;
  IF r.pituus_km IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_johdot', r.id, 'pituus_km') THEN
    puuttuvat := puuttuvat || 'pituus_km';
  END IF;
  IF r.vaihtoehto IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_johdot', r.id, 'vaihtoehto') THEN
    puuttuvat := puuttuvat || 'vaihtoehto';
  END IF;
  IF r.liittymispiste IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_johdot', r.id, 'liittymispiste') THEN
    puuttuvat := puuttuvat || 'liittymispiste';
  END IF;
  IF r.reitti IS NOT NULL AND NOT lahde_on_olemassa('hanke_johdot', r.id, 'reitti') THEN
    puuttuvat := puuttuvat || 'reitti';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_hanke_johdon_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_johto_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_johdot-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_johdot_lahteet
AFTER INSERT OR UPDATE ON hanke_johdot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_johdon_lahteet();

CREATE TRIGGER trg_hanke_johdot_poista_lahteet
BEFORE DELETE ON hanke_johdot
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE OR REPLACE FUNCTION tarkista_kentta_lahteen_rivi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hanke hankkeet;
  maaraika maaraajat;
  organisaatio organisaatiot;
  kunta_rivi hanke_kunnat;
  menettely hanke_menettelyt;
  hanke_org hanke_organisaatiot;
  dokumentti dokumentit;
  johto hanke_johdot;
  puuttuvat text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.taulu = 'hankkeet' THEN
      SELECT * INTO hanke FROM hankkeet WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_puuttuvat_lahteet(hanke);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hankkeen faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'maaraajat' THEN
      SELECT * INTO maaraika FROM maaraajat WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := maaraaja_puuttuvat_lahteet(maaraika);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Maaraajan faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'organisaatiot' THEN
      SELECT * INTO organisaatio FROM organisaatiot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := organisaatio_puuttuvat_lahteet(organisaatio);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Organisaation faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_kunnat' THEN
      SELECT * INTO kunta_rivi FROM hanke_kunnat WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_kunta_puuttuvat_lahteet(kunta_rivi);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_kunnat-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_menettelyt' THEN
      SELECT * INTO menettely FROM hanke_menettelyt WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_menettely_puuttuvat_lahteet(menettely);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_menettelyt-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_organisaatiot' THEN
      SELECT * INTO hanke_org FROM hanke_organisaatiot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_organisaatio_puuttuvat_lahteet(hanke_org);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_organisaatiot-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'dokumentit' THEN
      SELECT * INTO dokumentti FROM dokumentit WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := dokumentti_puuttuvat_lahteet(dokumentti);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Dokumentin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_johdot' THEN
      SELECT * INTO johto FROM hanke_johdot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_johto_puuttuvat_lahteet(johto);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_johdot-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.taulu = 'hankkeet' AND NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanketta % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'maaraajat' AND NOT EXISTS (
    SELECT 1 FROM maaraajat WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: maaraikaa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'organisaatiot' AND NOT EXISTS (
    SELECT 1 FROM organisaatiot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: organisaatiota % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'yhteyshenkilot' AND NOT EXISTS (
    SELECT 1 FROM yhteyshenkilot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: yhteyshenkiloa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_kunnat' AND NOT EXISTS (
    SELECT 1 FROM hanke_kunnat WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_kuntaa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_menettelyt' AND NOT EXISTS (
    SELECT 1 FROM hanke_menettelyt WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_menettelya % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_organisaatiot' AND NOT EXISTS (
    SELECT 1 FROM hanke_organisaatiot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_organisaatiota % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'dokumentit' AND NOT EXISTS (
    SELECT 1 FROM dokumentit WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: dokumenttia % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_johdot' AND NOT EXISTS (
    SELECT 1 FROM hanke_johdot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_johtoa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NULL;
END;
$$;

ALTER TABLE hanke_johdot ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_johdot_julkinen_luku
ON hanke_johdot
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_johdot.hanke_id
      AND h.julkaistu
  )
);

DROP POLICY kentta_lahteet_julkinen_luku ON kentta_lahteet;

CREATE POLICY kentta_lahteet_julkinen_luku
ON kentta_lahteet
FOR SELECT
TO anon, authenticated
USING (
  (taulu = 'hankkeet' AND EXISTS (
    SELECT 1 FROM hankkeet h WHERE h.id = rivi_id AND h.julkaistu
  ))
  OR (taulu = 'maaraajat' AND EXISTS (
    SELECT 1 FROM maaraajat m
    JOIN hankkeet h ON h.id = m.hanke_id
    WHERE m.id = rivi_id AND m.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'organisaatiot' AND EXISTS (
    SELECT 1 FROM organisaatiot o WHERE o.id = rivi_id AND o.julkaistu
  ))
  OR (taulu = 'yhteyshenkilot' AND EXISTS (
    SELECT 1 FROM yhteyshenkilot y WHERE y.id = rivi_id AND y.julkaistu
  ))
  OR (taulu = 'hanke_kunnat' AND EXISTS (
    SELECT 1 FROM hanke_kunnat k
    JOIN hankkeet h ON h.id = k.hanke_id
    WHERE k.id = rivi_id AND k.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_menettelyt' AND EXISTS (
    SELECT 1 FROM hanke_menettelyt m
    JOIN hankkeet h ON h.id = m.hanke_id
    WHERE m.id = rivi_id AND m.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_organisaatiot' AND EXISTS (
    SELECT 1 FROM hanke_organisaatiot r
    JOIN hankkeet h ON h.id = r.hanke_id
    JOIN organisaatiot o ON o.id = r.organisaatio_id
    WHERE r.id = rivi_id AND r.julkaistu AND h.julkaistu AND o.julkaistu
  ))
  OR (taulu = 'dokumentit' AND EXISTS (
    SELECT 1 FROM dokumentit d
    WHERE d.id = rivi_id AND d.julkaistu
  ))
  OR (taulu = 'hanke_johdot' AND EXISTS (
    SELECT 1 FROM hanke_johdot j
    JOIN hankkeet h ON h.id = j.hanke_id
    WHERE j.id = rivi_id AND j.julkaistu AND h.julkaistu
  ))
);

REVOKE ALL ON hanke_johdot FROM anon, authenticated;
GRANT SELECT ON hanke_johdot TO anon, authenticated;
