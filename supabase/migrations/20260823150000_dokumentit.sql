-- Asiakirjarekisteri: bibliografiset metatiedot, jotta dokumenttia ei tarvitse
-- lukea läpi sen soveltuvuuden arvioimiseksi. Mitä dokumentti kattaa
-- johdetaan kentta_lahteet-riveistä (url + sivu + kenttä), ei tiivistelmästä.

CREATE TABLE dokumentit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid REFERENCES hankkeet (id) ON DELETE RESTRICT,
  url text NOT NULL,
  otsikko text NOT NULL,
  laji text NOT NULL,
  muoto text,
  kieli text,
  julkaisija text,
  julkaistu_pvm date,
  tunnus text,
  sivumaara integer,
  menettely_id uuid REFERENCES hanke_menettelyt (id) ON DELETE RESTRICT,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dokumentit_url_muoto CHECK (url ~ '^https?://'),
  CONSTRAINT dokumentit_otsikko_ei_tyhja CHECK (char_length(trim(otsikko)) > 0),
  CONSTRAINT dokumentit_url_yksilollinen UNIQUE (url),
  CONSTRAINT dokumentit_laji_tarkistus CHECK (
    laji IN (
      'verkkosivu',
      'kuulutus',
      'yva_ohjelma',
      'yva_selostus',
      'asemakaava',
      'kaavamaaraykset',
      'kartta_aineisto',
      'muu'
    )
  ),
  CONSTRAINT dokumentit_muoto_tarkistus CHECK (
    muoto IS NULL OR muoto IN ('html', 'pdf', 'wfs', 'muu')
  ),
  CONSTRAINT dokumentit_kieli_tarkistus CHECK (
    kieli IS NULL OR kieli IN ('fi', 'sv', 'en')
  ),
  CONSTRAINT dokumentit_julkaisija_ei_tyhja CHECK (
    julkaisija IS NULL OR char_length(trim(julkaisija)) > 0
  ),
  CONSTRAINT dokumentit_tunnus_ei_tyhja CHECK (
    tunnus IS NULL OR char_length(trim(tunnus)) > 0
  ),
  CONSTRAINT dokumentit_sivumaara_positiivinen CHECK (
    sivumaara IS NULL OR sivumaara > 0
  )
);

CREATE TRIGGER trg_dokumentit_paivitetty
BEFORE UPDATE ON dokumentit
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX dokumentit_hanke_id_idx ON dokumentit (hanke_id);
CREATE INDEX dokumentit_laji_idx ON dokumentit (laji);

COMMENT ON TABLE dokumentit IS
  'Julkaistujen lähdeasiakirjojen metatiedot. Ei sisällä dokumentin tekstiä eikä tekoälyn tiivistelmää.';
COMMENT ON COLUMN dokumentit.otsikko IS
  'Asiakirjan oma otsikko. Lähde on yleensä asiakirja itse.';
COMMENT ON COLUMN dokumentit.sivumaara IS
  'Sivumäärä vain jos se on merkitty asiakirjassa. Muuten NULL.';

ALTER TABLE kentta_lahteet
  ADD COLUMN dokumentti_id uuid REFERENCES dokumentit (id) ON DELETE RESTRICT;

CREATE INDEX kentta_lahteet_dokumentti_id_idx ON kentta_lahteet (dokumentti_id);
CREATE INDEX kentta_lahteet_url_idx ON kentta_lahteet (lahde_url);

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
      'dokumentit'
    )
  );

CREATE OR REPLACE FUNCTION dokumentti_puuttuvat_lahteet(d dokumentit)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('dokumentit', d.id, 'otsikko') THEN
    puuttuvat := puuttuvat || 'otsikko';
  END IF;
  IF NOT lahde_on_olemassa('dokumentit', d.id, 'laji') THEN
    puuttuvat := puuttuvat || 'laji';
  END IF;
  IF d.muoto IS NOT NULL AND NOT lahde_on_olemassa('dokumentit', d.id, 'muoto') THEN
    puuttuvat := puuttuvat || 'muoto';
  END IF;
  IF d.kieli IS NOT NULL AND NOT lahde_on_olemassa('dokumentit', d.id, 'kieli') THEN
    puuttuvat := puuttuvat || 'kieli';
  END IF;
  IF d.julkaisija IS NOT NULL
    AND NOT lahde_on_olemassa('dokumentit', d.id, 'julkaisija') THEN
    puuttuvat := puuttuvat || 'julkaisija';
  END IF;
  IF d.julkaistu_pvm IS NOT NULL
    AND NOT lahde_on_olemassa('dokumentit', d.id, 'julkaistu_pvm') THEN
    puuttuvat := puuttuvat || 'julkaistu_pvm';
  END IF;
  IF d.tunnus IS NOT NULL AND NOT lahde_on_olemassa('dokumentit', d.id, 'tunnus') THEN
    puuttuvat := puuttuvat || 'tunnus';
  END IF;
  IF d.sivumaara IS NOT NULL
    AND NOT lahde_on_olemassa('dokumentit', d.id, 'sivumaara') THEN
    puuttuvat := puuttuvat || 'sivumaara';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_dokumentin_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := dokumentti_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Dokumentin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_dokumentit_lahteet
AFTER INSERT OR UPDATE ON dokumentit
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_dokumentin_lahteet();

CREATE OR REPLACE FUNCTION kytke_kentta_lahde_dokumenttiin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dokumentti_id IS NULL THEN
    SELECT id INTO NEW.dokumentti_id
    FROM dokumentit
    WHERE url = NEW.lahde_url;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kentta_lahteet_dokumentti
BEFORE INSERT OR UPDATE OF lahde_url, dokumentti_id ON kentta_lahteet
FOR EACH ROW
EXECUTE FUNCTION kytke_kentta_lahde_dokumenttiin();

CREATE TRIGGER trg_dokumentit_poista_lahteet
BEFORE DELETE ON dokumentit
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
  END IF;

  RETURN NULL;
END;
$$;

ALTER TABLE dokumentit ENABLE ROW LEVEL SECURITY;

CREATE POLICY dokumentit_julkinen_luku
ON dokumentit
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND (
    hanke_id IS NULL OR EXISTS (
      SELECT 1 FROM hankkeet h
      WHERE h.id = dokumentit.hanke_id
        AND h.julkaistu
    )
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
);

REVOKE ALL ON dokumentit FROM anon, authenticated;
GRANT SELECT ON dokumentit TO anon, authenticated;
