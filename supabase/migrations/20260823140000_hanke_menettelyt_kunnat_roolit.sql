-- Rinnakkaiset menettelyt, kunnat ja organisaatioroolit.
-- Olemassa olevia sarakkeita ei poisteta eikä nimetä uudelleen.

-- ---------------------------------------------------------------------------
-- hankkeet: alueen tyyppi, kaavatunnus, kortteli
-- ---------------------------------------------------------------------------

ALTER TABLE hankkeet
  ADD COLUMN sijainti_alue_tyyppi text,
  ADD COLUMN kaavatunnus text,
  ADD COLUMN kortteli text;

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_sijainti_alue_tyyppi_tarkistus CHECK (
    sijainti_alue_tyyppi IS NULL
    OR sijainti_alue_tyyppi IN ('kaava_alue', 'tontti', 'arvio')
  ),
  ADD CONSTRAINT hankkeet_kaavatunnus_ei_tyhja CHECK (
    kaavatunnus IS NULL OR char_length(trim(kaavatunnus)) > 0
  ),
  ADD CONSTRAINT hankkeet_kortteli_ei_tyhja CHECK (
    kortteli IS NULL OR char_length(trim(kortteli)) > 0
  );

COMMENT ON COLUMN hankkeet.sijainti_alue_tyyppi IS
  'Mitä polygoni kuvaa. Lähdekenttä on sijainti.';
COMMENT ON COLUMN hankkeet.kaavatunnus IS
  'Asemakaavan tunnus, jos merkitty. Ei arvata.';
COMMENT ON COLUMN hankkeet.kortteli IS
  'Kortteli kaavassa, jos merkitty.';

-- ---------------------------------------------------------------------------
-- organisaatiotyyppi: lvv nykyisen ely-arvon rinnalle
-- ---------------------------------------------------------------------------

ALTER TABLE organisaatiot
  DROP CONSTRAINT organisaatiot_tyyppi_tarkistus;

ALTER TABLE organisaatiot
  ADD CONSTRAINT organisaatiot_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'yritys',
      'kunta',
      'ely',
      'lvv',
      'avi',
      'ministerio',
      'jarjesto',
      'muu'
    )
  );

-- ---------------------------------------------------------------------------
-- määräajan tyypit ja kytkentä menettelyyn
-- ---------------------------------------------------------------------------

ALTER TABLE maaraajat
  DROP CONSTRAINT maaraajat_tyyppi_tarkistus;

ALTER TABLE maaraajat
  ADD CONSTRAINT maaraajat_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'yva_mielipide',
      'yva_ohjelma',
      'yva_selostus',
      'kaavamuistutus',
      'valitusaika',
      'kuulutus',
      'muu'
    )
  );

-- ---------------------------------------------------------------------------
-- hanke_kunnat
-- ---------------------------------------------------------------------------

CREATE TABLE hanke_kunnat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  kunta text NOT NULL,
  rooli text NOT NULL,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_kunnat_kunta_ei_tyhja CHECK (char_length(trim(kunta)) > 0),
  CONSTRAINT hanke_kunnat_rooli_tarkistus CHECK (
    rooli IN ('sijaintikunta', 'vaikutusalue', 'sahkonsiirto')
  ),
  CONSTRAINT hanke_kunnat_hanke_kunta_rooli UNIQUE (hanke_id, kunta, rooli)
);

CREATE TRIGGER trg_hanke_kunnat_paivitetty
BEFORE UPDATE ON hanke_kunnat
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_kunnat_hanke_id_idx ON hanke_kunnat (hanke_id);

COMMENT ON TABLE hanke_kunnat IS
  'Hankkeen kunnat rooleittain. Pääkunta suodatusta varten jää hankkeet.kunta-kenttään.';

-- ---------------------------------------------------------------------------
-- hanke_menettelyt
-- ---------------------------------------------------------------------------

CREATE TABLE hanke_menettelyt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  laji text NOT NULL,
  tila text NOT NULL,
  tunnus text,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_menettelyt_laji_tarkistus CHECK (
    laji IN ('yva', 'kaavoitus', 'lupamenettely', 'muu')
  ),
  CONSTRAINT hanke_menettelyt_tila_tarkistus CHECK (
    tila IN ('ei_alkanut', 'vireilla', 'paattynyt')
  ),
  CONSTRAINT hanke_menettelyt_tunnus_ei_tyhja CHECK (
    tunnus IS NULL OR char_length(trim(tunnus)) > 0
  ),
  CONSTRAINT hanke_menettelyt_hanke_laji UNIQUE (hanke_id, laji)
);

CREATE TRIGGER trg_hanke_menettelyt_paivitetty
BEFORE UPDATE ON hanke_menettelyt
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_menettelyt_hanke_id_idx ON hanke_menettelyt (hanke_id);

COMMENT ON TABLE hanke_menettelyt IS
  'Rinnakkaiset menettelyt omine tiloineen ja lähteineen. Ei korvaa hankkeet.vaihe-kenttää.';

ALTER TABLE maaraajat
  ADD COLUMN menettely_id uuid REFERENCES hanke_menettelyt (id) ON DELETE RESTRICT;

CREATE INDEX maaraajat_menettely_id_idx ON maaraajat (menettely_id);

COMMENT ON COLUMN maaraajat.menettely_id IS
  'Valinnainen kytkentä hanke_menettelyt-riviin. Vanhoja rivejä ei muuteta.';

-- ---------------------------------------------------------------------------
-- hanke_organisaatiot
-- ---------------------------------------------------------------------------

CREATE TABLE hanke_organisaatiot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  organisaatio_id uuid NOT NULL REFERENCES organisaatiot (id) ON DELETE RESTRICT,
  rooli text NOT NULL,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_organisaatiot_rooli_tarkistus CHECK (
    rooli IN (
      'toimija',
      'yva_konsultti',
      'yhteysviranomainen',
      'kaavoittaja',
      'muu'
    )
  ),
  CONSTRAINT hanke_organisaatiot_hanke_org_rooli UNIQUE (hanke_id, organisaatio_id, rooli)
);

CREATE TRIGGER trg_hanke_organisaatiot_paivitetty
BEFORE UPDATE ON hanke_organisaatiot
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_organisaatiot_hanke_id_idx ON hanke_organisaatiot (hanke_id);
CREATE INDEX hanke_organisaatiot_organisaatio_id_idx ON hanke_organisaatiot (organisaatio_id);

COMMENT ON TABLE hanke_organisaatiot IS
  'Hankkeen organisaatiot rooleittain. toimija_organisaatio_id jää hankkeet-tauluun.';

-- ---------------------------------------------------------------------------
-- kentta_lahteet.taulu
-- ---------------------------------------------------------------------------

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
      'hanke_organisaatiot'
    )
  );

-- ---------------------------------------------------------------------------
-- lähdepakko
-- ---------------------------------------------------------------------------

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
  IF h.kaavatunnus IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaavatunnus') THEN
    puuttuvat := puuttuvat || 'kaavatunnus';
  END IF;
  IF h.kortteli IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kortteli') THEN
    puuttuvat := puuttuvat || 'kortteli';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION organisaatio_puuttuvat_lahteet(o organisaatiot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT o.julkaistu THEN
    RETURN puuttuvat;
  END IF;
  IF NOT lahde_on_olemassa('organisaatiot', o.id, 'nimi') THEN
    puuttuvat := puuttuvat || 'nimi';
  END IF;
  IF o.y_tunnus IS NOT NULL AND NOT lahde_on_olemassa('organisaatiot', o.id, 'y_tunnus') THEN
    puuttuvat := puuttuvat || 'y_tunnus';
  END IF;
  IF o.verkko_osoite IS NOT NULL
    AND NOT lahde_on_olemassa('organisaatiot', o.id, 'verkko_osoite') THEN
    puuttuvat := puuttuvat || 'verkko_osoite';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION hanke_kunta_puuttuvat_lahteet(r hanke_kunnat)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_kunnat', r.id, 'kunta') THEN
    puuttuvat := puuttuvat || 'kunta';
  END IF;
  IF NOT lahde_on_olemassa('hanke_kunnat', r.id, 'rooli') THEN
    puuttuvat := puuttuvat || 'rooli';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION hanke_menettely_puuttuvat_lahteet(r hanke_menettelyt)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_menettelyt', r.id, 'laji') THEN
    puuttuvat := puuttuvat || 'laji';
  END IF;
  IF NOT lahde_on_olemassa('hanke_menettelyt', r.id, 'tila') THEN
    puuttuvat := puuttuvat || 'tila';
  END IF;
  IF r.tunnus IS NOT NULL AND NOT lahde_on_olemassa('hanke_menettelyt', r.id, 'tunnus') THEN
    puuttuvat := puuttuvat || 'tunnus';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION hanke_organisaatio_puuttuvat_lahteet(r hanke_organisaatiot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_organisaatiot', r.id, 'organisaatio_id') THEN
    puuttuvat := puuttuvat || 'organisaatio_id';
  END IF;
  IF NOT lahde_on_olemassa('hanke_organisaatiot', r.id, 'rooli') THEN
    puuttuvat := puuttuvat || 'rooli';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_organisaation_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := organisaatio_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Organisaation faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_organisaatiot_lahteet
AFTER INSERT OR UPDATE ON organisaatiot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_organisaation_lahteet();

CREATE OR REPLACE FUNCTION tarkista_hanke_kunnan_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_kunta_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_kunnat-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_kunnat_lahteet
AFTER INSERT OR UPDATE ON hanke_kunnat
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_kunnan_lahteet();

CREATE OR REPLACE FUNCTION tarkista_hanke_menettelyn_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_menettely_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_menettelyt-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_menettelyt_lahteet
AFTER INSERT OR UPDATE ON hanke_menettelyt
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_menettelyn_lahteet();

CREATE OR REPLACE FUNCTION tarkista_hanke_organisaation_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_organisaatio_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_organisaatiot-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_organisaatiot_lahteet
AFTER INSERT OR UPDATE ON hanke_organisaatiot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_organisaation_lahteet();

CREATE OR REPLACE FUNCTION tarkista_hanke_organisaatio_julkaistu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM organisaatiot o
    WHERE o.id = NEW.organisaatio_id
      AND o.julkaistu
  ) THEN
    RAISE EXCEPTION 'hanke_organisaatiot viittaa julkaisemattomaan organisaatioon'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hanke_organisaatiot_org_julkaistu
BEFORE INSERT OR UPDATE OF organisaatio_id ON hanke_organisaatiot
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_organisaatio_julkaistu();

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
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_hanke_kunnat_poista_lahteet
BEFORE DELETE ON hanke_kunnat
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE TRIGGER trg_hanke_menettelyt_poista_lahteet
BEFORE DELETE ON hanke_menettelyt
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE TRIGGER trg_hanke_organisaatiot_poista_lahteet
BEFORE DELETE ON hanke_organisaatiot
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE hanke_kunnat ENABLE ROW LEVEL SECURITY;
ALTER TABLE hanke_menettelyt ENABLE ROW LEVEL SECURITY;
ALTER TABLE hanke_organisaatiot ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_kunnat_julkinen_luku
ON hanke_kunnat
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_kunnat.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_menettelyt_julkinen_luku
ON hanke_menettelyt
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_menettelyt.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_organisaatiot_julkinen_luku
ON hanke_organisaatiot
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_organisaatiot.hanke_id
      AND h.julkaistu
  )
  AND EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = hanke_organisaatiot.organisaatio_id
      AND o.julkaistu
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
);

REVOKE ALL ON hanke_kunnat FROM anon, authenticated;
REVOKE ALL ON hanke_menettelyt FROM anon, authenticated;
REVOKE ALL ON hanke_organisaatiot FROM anon, authenticated;

GRANT SELECT ON hanke_kunnat TO anon, authenticated;
GRANT SELECT ON hanke_menettelyt TO anon, authenticated;
GRANT SELECT ON hanke_organisaatiot TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hyväksyntä: organisaatio ja sen lähde samassa transaktiossa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION julkaise_ehdotetut_tiedot(
  p_tyyppi text,
  p_hanke_id uuid,
  p_hanke jsonb,
  p_lahteet jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hanke_id uuid;
  v_lahde jsonb;
  v_toimija_id uuid;
  v_org_lahde jsonb;
BEGIN
  v_toimija_id := NULLIF(p_hanke ->> 'toimija_organisaatio_id', '')::uuid;

  IF v_toimija_id IS NULL AND NULLIF(p_hanke ->> 'toimija_nimi', '') IS NOT NULL THEN
    INSERT INTO organisaatiot (nimi, tyyppi, julkaistu)
    VALUES (p_hanke ->> 'toimija_nimi', 'yritys', true)
    RETURNING id INTO v_toimija_id;

    SELECT value INTO v_org_lahde
    FROM jsonb_array_elements(p_lahteet) AS t(value)
    WHERE t.value ->> 'kentta' IN ('toimija_organisaatio_id', 'toimija_nimi')
    LIMIT 1;

    IF v_org_lahde IS NULL THEN
      RAISE EXCEPTION 'Toimijan nimelta puuttuu lahde';
    END IF;

    INSERT INTO kentta_lahteet (
      taulu,
      rivi_id,
      kentta,
      lahde_url,
      lahde_sivu,
      vahvistettu_pvm,
      luottamus,
      lainaus,
      merkitty
    )
    VALUES (
      'organisaatiot',
      v_toimija_id,
      'nimi',
      v_org_lahde ->> 'lahde_url',
      NULLIF(v_org_lahde ->> 'lahde_sivu', '')::integer,
      (v_org_lahde ->> 'vahvistettu_pvm')::date,
      v_org_lahde ->> 'luottamus',
      NULLIF(v_org_lahde ->> 'lainaus', ''),
      v_org_lahde ->> 'merkitty'
    );
  END IF;

  IF p_tyyppi = 'uusi_hanke' THEN
    INSERT INTO hankkeet (
      nimi,
      kunta,
      maakunta,
      vaihe,
      yva_diaarinumero,
      it_teho_mw,
      pinta_ala_ha,
      sahkonkaytto_twh_a,
      generaattorit_lkm,
      generaattorit_kaytossa_max_lkm,
      generaattori_polttoaineteho_mw,
      toimija_organisaatio_id,
      kaavatunnus,
      kortteli,
      julkaistu
    )
    VALUES (
      p_hanke ->> 'nimi',
      p_hanke ->> 'kunta',
      NULLIF(p_hanke ->> 'maakunta', ''),
      p_hanke ->> 'vaihe',
      NULLIF(p_hanke ->> 'yva_diaarinumero', ''),
      NULLIF(p_hanke ->> 'it_teho_mw', '')::numeric,
      NULLIF(p_hanke ->> 'pinta_ala_ha', '')::numeric,
      NULLIF(p_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
      NULLIF(p_hanke ->> 'generaattorit_lkm', '')::integer,
      NULLIF(p_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
      NULLIF(p_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
      v_toimija_id,
      NULLIF(p_hanke ->> 'kaavatunnus', ''),
      NULLIF(p_hanke ->> 'kortteli', ''),
      true
    )
    RETURNING id INTO v_hanke_id;
  ELSE
    IF p_hanke_id IS NULL THEN
      RAISE EXCEPTION 'Taydennykselta puuttuu hanke';
    END IF;
    v_hanke_id := p_hanke_id;
    UPDATE hankkeet
    SET
      nimi = COALESCE(NULLIF(p_hanke ->> 'nimi', ''), nimi),
      kunta = COALESCE(NULLIF(p_hanke ->> 'kunta', ''), kunta),
      maakunta = COALESCE(NULLIF(p_hanke ->> 'maakunta', ''), maakunta),
      vaihe = COALESCE(NULLIF(p_hanke ->> 'vaihe', ''), vaihe),
      yva_diaarinumero = COALESCE(NULLIF(p_hanke ->> 'yva_diaarinumero', ''), yva_diaarinumero),
      it_teho_mw = COALESCE(NULLIF(p_hanke ->> 'it_teho_mw', '')::numeric, it_teho_mw),
      pinta_ala_ha = COALESCE(NULLIF(p_hanke ->> 'pinta_ala_ha', '')::numeric, pinta_ala_ha),
      sahkonkaytto_twh_a = COALESCE(
        NULLIF(p_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
        sahkonkaytto_twh_a
      ),
      generaattorit_lkm = COALESCE(
        NULLIF(p_hanke ->> 'generaattorit_lkm', '')::integer,
        generaattorit_lkm
      ),
      generaattorit_kaytossa_max_lkm = COALESCE(
        NULLIF(p_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
        generaattorit_kaytossa_max_lkm
      ),
      generaattori_polttoaineteho_mw = COALESCE(
        NULLIF(p_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
        generaattori_polttoaineteho_mw
      ),
      toimija_organisaatio_id = COALESCE(v_toimija_id, toimija_organisaatio_id),
      kaavatunnus = COALESCE(NULLIF(p_hanke ->> 'kaavatunnus', ''), kaavatunnus),
      kortteli = COALESCE(NULLIF(p_hanke ->> 'kortteli', ''), kortteli)
    WHERE id = v_hanke_id;
  END IF;

  FOR v_lahde IN SELECT value FROM jsonb_array_elements(p_lahteet)
  LOOP
    IF v_lahde ->> 'kentta' = 'toimija_nimi' THEN
      INSERT INTO kentta_lahteet (
        taulu,
        rivi_id,
        kentta,
        lahde_url,
        lahde_sivu,
        vahvistettu_pvm,
        luottamus,
        lainaus,
        merkitty
      )
      VALUES (
        'hankkeet',
        v_hanke_id,
        'toimija_organisaatio_id',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty'
      );
    ELSE
      INSERT INTO kentta_lahteet (
        taulu,
        rivi_id,
        kentta,
        lahde_url,
        lahde_sivu,
        vahvistettu_pvm,
        luottamus,
        lainaus,
        merkitty
      )
      VALUES (
        'hankkeet',
        v_hanke_id,
        v_lahde ->> 'kentta',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty'
      );
    END IF;
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    hanke_id = v_hanke_id
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;

  RETURN v_hanke_id;
END;
$$;
