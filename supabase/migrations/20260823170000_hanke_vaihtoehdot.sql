-- YVA- ja suunnitteluvaihtoehdot omina riveinä.
-- Hankkeen omat teho- ja pinta-alakentät jäävät; niitä ei poisteta.

CREATE TABLE hanke_vaihtoehdot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  menettely_id uuid REFERENCES hanke_menettelyt (id) ON DELETE RESTRICT,
  tunnus text NOT NULL,
  teho_mw numeric(12, 3),
  it_teho_mw numeric(12, 3),
  pinta_ala_ha numeric(12, 3),
  sahkonkaytto_twh_a numeric(12, 3),
  generaattorit_lkm integer,
  generaattorit_kaytossa_max_lkm integer,
  generaattori_polttoaineteho_mw numeric(12, 3),
  sijainti_alue jsonb,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_vaihtoehdot_tunnus_ei_tyhja CHECK (
    char_length(trim(tunnus)) > 0
  ),
  CONSTRAINT hanke_vaihtoehdot_tunnus_uniikki UNIQUE (hanke_id, tunnus),
  CONSTRAINT hanke_vaihtoehdot_teho_mw_positiivinen CHECK (
    teho_mw IS NULL OR teho_mw > 0
  ),
  CONSTRAINT hanke_vaihtoehdot_it_teho_mw_positiivinen CHECK (
    it_teho_mw IS NULL OR it_teho_mw > 0
  ),
  CONSTRAINT hanke_vaihtoehdot_pinta_ala_positiivinen CHECK (
    pinta_ala_ha IS NULL OR pinta_ala_ha > 0
  ),
  CONSTRAINT hanke_vaihtoehdot_sahkonkaytto_positiivinen CHECK (
    sahkonkaytto_twh_a IS NULL OR sahkonkaytto_twh_a > 0
  ),
  CONSTRAINT hanke_vaihtoehdot_generaattorit_lkm_ei_neg CHECK (
    generaattorit_lkm IS NULL OR generaattorit_lkm >= 0
  ),
  CONSTRAINT hanke_vaihtoehdot_generaattorit_kaytossa_max_lkm_ei_neg CHECK (
    generaattorit_kaytossa_max_lkm IS NULL
    OR generaattorit_kaytossa_max_lkm >= 0
  ),
  CONSTRAINT hanke_vaihtoehdot_generaattori_polttoaineteho_mw_positiivinen CHECK (
    generaattori_polttoaineteho_mw IS NULL
    OR generaattori_polttoaineteho_mw > 0
  ),
  CONSTRAINT hanke_vaihtoehdot_generaattorit_kaytossa_ei_yli_lkm CHECK (
    generaattorit_lkm IS NULL
    OR generaattorit_kaytossa_max_lkm IS NULL
    OR generaattorit_kaytossa_max_lkm <= generaattorit_lkm
  ),
  CONSTRAINT hanke_vaihtoehdot_sijainti_alue_geojson CHECK (
    sijainti_alue IS NULL
    OR (
      jsonb_typeof(sijainti_alue) = 'object'
      AND sijainti_alue ->> 'type' = 'Polygon'
      AND jsonb_typeof(sijainti_alue -> 'coordinates') = 'array'
    )
  )
);

CREATE TRIGGER trg_hanke_vaihtoehdot_paivitetty
BEFORE UPDATE ON hanke_vaihtoehdot
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_vaihtoehdot_hanke_id_idx ON hanke_vaihtoehdot (hanke_id);

COMMENT ON TABLE hanke_vaihtoehdot IS
  'Hankkeen arvioitavat vaihtoehdot (esim. VE0, VE1). Luvut vaihtoehtokohtaisesti; hankkeen omat kentät säilyvät.';

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
      'hanke_johdot',
      'hanke_vaihtoehdot'
    )
  );

CREATE OR REPLACE FUNCTION hanke_vaihtoehto_puuttuvat_lahteet(r hanke_vaihtoehdot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'tunnus') THEN
    puuttuvat := puuttuvat || 'tunnus';
  END IF;
  IF r.teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'teho_mw') THEN
    puuttuvat := puuttuvat || 'teho_mw';
  END IF;
  IF r.it_teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'it_teho_mw') THEN
    puuttuvat := puuttuvat || 'it_teho_mw';
  END IF;
  IF r.pinta_ala_ha IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'pinta_ala_ha') THEN
    puuttuvat := puuttuvat || 'pinta_ala_ha';
  END IF;
  IF r.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := puuttuvat || 'sahkonkaytto_twh_a';
  END IF;
  IF r.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattorit_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_lkm';
  END IF;
  IF r.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_kaytossa_max_lkm';
  END IF;
  IF r.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := puuttuvat || 'generaattori_polttoaineteho_mw';
  END IF;
  IF r.sijainti_alue IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_vaihtoehdot', r.id, 'sijainti') THEN
    puuttuvat := puuttuvat || 'sijainti';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_hanke_vaihtoehdon_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_vaihtoehto_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_vaihtoehdot-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_vaihtoehdot_lahteet
AFTER INSERT OR UPDATE ON hanke_vaihtoehdot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_vaihtoehdon_lahteet();

CREATE TRIGGER trg_hanke_vaihtoehdot_poista_lahteet
BEFORE DELETE ON hanke_vaihtoehdot
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
  vaihtoehto hanke_vaihtoehdot;
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
    ELSIF OLD.taulu = 'hanke_vaihtoehdot' THEN
      SELECT * INTO vaihtoehto FROM hanke_vaihtoehdot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_vaihtoehto_puuttuvat_lahteet(vaihtoehto);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_vaihtoehdot-rivin faktakentilta puuttuu lahde: %',
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
  ELSIF NEW.taulu = 'hanke_vaihtoehdot' AND NOT EXISTS (
    SELECT 1 FROM hanke_vaihtoehdot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_vaihtoehtoa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NULL;
END;
$$;

ALTER TABLE hanke_vaihtoehdot ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_vaihtoehdot_julkinen_luku
ON hanke_vaihtoehdot
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_vaihtoehdot.hanke_id
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
  OR (taulu = 'hanke_vaihtoehdot' AND EXISTS (
    SELECT 1 FROM hanke_vaihtoehdot v
    JOIN hankkeet h ON h.id = v.hanke_id
    WHERE v.id = rivi_id AND v.julkaistu AND h.julkaistu
  ))
);

REVOKE ALL ON hanke_vaihtoehdot FROM anon, authenticated;
GRANT SELECT ON hanke_vaihtoehdot TO anon, authenticated;
