-- Alkuskeema: julkaistu tieto ja ehdotukset pidetään erillään.
-- Faktakenttä ilman lähdettä ei sitoudu. Tarkistus on CONSTRAINT TRIGGER,
-- jotta hanke ja lähteet voi lisätä samassa transaktiossa.

CREATE OR REPLACE FUNCTION paivita_paivitetty_pvm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.paivitetty_pvm := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- organisaatiot
-- ---------------------------------------------------------------------------

CREATE TABLE organisaatiot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nimi text NOT NULL,
  y_tunnus text,
  tyyppi text NOT NULL,
  verkko_osoite text,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisaatiot_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0),
  CONSTRAINT organisaatiot_tyyppi_tarkistus CHECK (
    tyyppi IN ('yritys', 'kunta', 'ely', 'avi', 'ministerio', 'jarjesto', 'muu')
  ),
  CONSTRAINT organisaatiot_y_tunnus_muoto CHECK (
    y_tunnus IS NULL OR y_tunnus ~ '^[0-9]{7}-[0-9]$'
  ),
  CONSTRAINT organisaatiot_verkko_osoite_muoto CHECK (
    verkko_osoite IS NULL OR verkko_osoite ~ '^https?://'
  ),
  CONSTRAINT organisaatiot_y_tunnus_yksilollinen UNIQUE (y_tunnus)
);

CREATE TRIGGER trg_organisaatiot_paivitetty
BEFORE UPDATE ON organisaatiot
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

COMMENT ON TABLE organisaatiot IS
  'Yritykset, kunnat, viranomaiset ja järjestöt. Ei hankekohtaisia faktaväitteitä.';

-- ---------------------------------------------------------------------------
-- hankkeet (vain julkaistu, ihmisen vahvistama tieto)
-- ---------------------------------------------------------------------------

CREATE TABLE hankkeet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nimi text NOT NULL,
  kunta text NOT NULL,
  maakunta text,
  sijainti_lat numeric(9, 6),
  sijainti_lon numeric(9, 6),
  vaihe text NOT NULL,
  teho_mw numeric(12, 3),
  generaattorit_lkm integer,
  toimija_organisaatio_id uuid REFERENCES organisaatiot (id) ON DELETE RESTRICT,
  yva_diaarinumero text,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hankkeet_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0),
  CONSTRAINT hankkeet_kunta_ei_tyhja CHECK (char_length(trim(kunta)) > 0),
  CONSTRAINT hankkeet_vaihe_tarkistus CHECK (
    vaihe IN (
      'esiselvitys',
      'yva_vireilla',
      'yva_paattynyt',
      'kaavoitus',
      'lupamenettely',
      'rakenteilla',
      'toiminnassa',
      'peruttu'
    )
  ),
  CONSTRAINT hankkeet_teho_mw_positiivinen CHECK (teho_mw IS NULL OR teho_mw > 0),
  CONSTRAINT hankkeet_generaattorit_lkm_ei_neg CHECK (
    generaattorit_lkm IS NULL OR generaattorit_lkm >= 0
  ),
  CONSTRAINT hankkeet_sijainti_pari CHECK (
    (sijainti_lat IS NULL AND sijainti_lon IS NULL)
    OR (
      sijainti_lat IS NOT NULL
      AND sijainti_lon IS NOT NULL
      AND sijainti_lat BETWEEN -90 AND 90
      AND sijainti_lon BETWEEN -180 AND 180
    )
  )
);

CREATE TRIGGER trg_hankkeet_paivitetty
BEFORE UPDATE ON hankkeet
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hankkeet_kunta_idx ON hankkeet (kunta);
CREATE INDEX hankkeet_vaihe_idx ON hankkeet (vaihe);
CREATE INDEX hankkeet_julkaistu_idx ON hankkeet (julkaistu);

COMMENT ON TABLE hankkeet IS
  'Julkaistu hanketieto. Tyhjä faktakenttä on sallittu; arvattu arvo ei.';
COMMENT ON COLUMN hankkeet.teho_mw IS
  'Sähköteho megawatteina. Epävarmuus kirjataan kentta_lahteet.luottamus-kenttään.';
COMMENT ON COLUMN hankkeet.generaattorit_lkm IS
  'Varavoimageneraattorien lukumäärä. Tuntematon jätetään NULL-arvoksi.';

-- ---------------------------------------------------------------------------
-- maaraajat
-- ---------------------------------------------------------------------------

CREATE TABLE maaraajat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  tyyppi text NOT NULL,
  alkaa_pvm date,
  paattyy_pvm date NOT NULL,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maaraajat_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'yva_mielipide',
      'kaavamuistutus',
      'valitusaika',
      'kuulutus',
      'muu'
    )
  ),
  CONSTRAINT maaraajat_vali CHECK (alkaa_pvm IS NULL OR alkaa_pvm <= paattyy_pvm)
);

CREATE TRIGGER trg_maaraajat_paivitetty
BEFORE UPDATE ON maaraajat
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX maaraajat_hanke_id_idx ON maaraajat (hanke_id);
CREATE INDEX maaraajat_paattyy_pvm_idx ON maaraajat (paattyy_pvm)
  WHERE julkaistu;

COMMENT ON TABLE maaraajat IS
  'Vaikuttamisen määräajat. Julkaistu vain, jos sekä määräaika että hanke ovat julkaistuja.';

-- ---------------------------------------------------------------------------
-- yhteyshenkilot
-- ---------------------------------------------------------------------------

CREATE TABLE yhteyshenkilot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nimi text NOT NULL,
  rooli text NOT NULL,
  organisaatio_id uuid REFERENCES organisaatiot (id) ON DELETE RESTRICT,
  hanke_id uuid REFERENCES hankkeet (id) ON DELETE RESTRICT,
  sahkoposti text,
  puhelin text,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT yhteyshenkilot_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0),
  CONSTRAINT yhteyshenkilot_rooli_ei_tyhja CHECK (char_length(trim(rooli)) > 0),
  CONSTRAINT yhteyshenkilot_sahkoposti_muoto CHECK (
    sahkoposti IS NULL OR sahkoposti ~* '^[^@[:space:]]+@[^@[:space:]]+$'
  )
);

CREATE TRIGGER trg_yhteyshenkilot_paivitetty
BEFORE UPDATE ON yhteyshenkilot
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX yhteyshenkilot_hanke_id_idx ON yhteyshenkilot (hanke_id);
CREATE INDEX yhteyshenkilot_organisaatio_id_idx ON yhteyshenkilot (organisaatio_id);

COMMENT ON TABLE yhteyshenkilot IS
  'Julkisen viranomaistoiminnan ja hankkeiden yhteyshenkilöt. Ei henkilöarvioita.';

-- ---------------------------------------------------------------------------
-- kentta_lahteet
-- ---------------------------------------------------------------------------

CREATE TABLE kentta_lahteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taulu text NOT NULL,
  rivi_id uuid NOT NULL,
  kentta text NOT NULL,
  lahde_url text NOT NULL,
  lahde_sivu integer,
  vahvistettu_pvm date NOT NULL,
  luottamus text NOT NULL,
  lainaus text,
  merkitty text NOT NULL,
  merkitty_pvm timestamptz NOT NULL DEFAULT now(),
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kentta_lahteet_taulu_tarkistus CHECK (
    taulu IN ('hankkeet', 'maaraajat', 'organisaatiot', 'yhteyshenkilot')
  ),
  CONSTRAINT kentta_lahteet_kentta_ei_tyhja CHECK (char_length(trim(kentta)) > 0),
  CONSTRAINT kentta_lahteet_url_muoto CHECK (lahde_url ~ '^https?://'),
  CONSTRAINT kentta_lahteet_sivu_positiivinen CHECK (
    lahde_sivu IS NULL OR lahde_sivu > 0
  ),
  CONSTRAINT kentta_lahteet_luottamus_tarkistus CHECK (
    luottamus IN ('vahvistettu', 'epavarma', 'ristiriitainen')
  ),
  CONSTRAINT kentta_lahteet_merkitty_tarkistus CHECK (
    merkitty IN ('koneen_ehdottama', 'ihmisen_vahvistama')
  ),
  CONSTRAINT kentta_lahteet_sama_lahde_kerran UNIQUE (taulu, rivi_id, kentta, lahde_url)
);

CREATE INDEX kentta_lahteet_kohde_idx ON kentta_lahteet (taulu, rivi_id, kentta);

COMMENT ON TABLE kentta_lahteet IS
  'Jokaisen faktaväitteen lähde. Useita lähteitä samaan kenttään saa olla; ristiriita merkitään luottamukseen.';
COMMENT ON COLUMN kentta_lahteet.lahde_sivu IS
  'Pakollinen, jos lähde on monisivuinen asiakirja. Verkkosivulle NULL.';
COMMENT ON COLUMN kentta_lahteet.merkitty IS
  'koneen_ehdottama = agentin ehdottama, ihmisen_vahvistama = ylläpitäjän vahvistama.';
COMMENT ON COLUMN kentta_lahteet.lainaus IS
  'Sanatarkka kohta lähteestä. Tyhjä vain jos kohta ei ole poimittavissa.';

-- ---------------------------------------------------------------------------
-- muutosehdotukset (ainoa taulu, johon agentti saa kirjoittaa)
-- ---------------------------------------------------------------------------

CREATE TABLE muutosehdotukset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tyyppi text NOT NULL,
  hanke_id uuid REFERENCES hankkeet (id) ON DELETE RESTRICT,
  ehdottaja_tyyppi text NOT NULL,
  ehdottaja_tunniste text NOT NULL,
  sisalto jsonb NOT NULL,
  tila text NOT NULL DEFAULT 'odottaa',
  perustelu text,
  huomautus text,
  lahde_url text,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  kasitelty_pvm timestamptz,
  kasittelija text,
  CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN ('uusi_hanke', 'taydennys', 'korjaus')
  ),
  CONSTRAINT muutosehdotukset_ehdottaja_tarkistus CHECK (
    ehdottaja_tyyppi IN ('lomake', 'agentti', 'yllapitaja')
  ),
  CONSTRAINT muutosehdotukset_tila_tarkistus CHECK (
    tila IN ('odottaa', 'hyvaksytty', 'hylatty')
  ),
  CONSTRAINT muutosehdotukset_sisalto_objekti CHECK (jsonb_typeof(sisalto) = 'object'),
  CONSTRAINT muutosehdotukset_url_muoto CHECK (
    lahde_url IS NULL OR lahde_url ~ '^https?://'
  ),
  CONSTRAINT muutosehdotukset_uusi_ilman_hanketta CHECK (
    (tyyppi = 'uusi_hanke' AND hanke_id IS NULL)
    OR (tyyppi IN ('taydennys', 'korjaus') AND hanke_id IS NOT NULL)
  ),
  CONSTRAINT muutosehdotukset_kasittely CHECK (
    (tila = 'odottaa' AND kasitelty_pvm IS NULL AND kasittelija IS NULL)
    OR (
      tila IN ('hyvaksytty', 'hylatty')
      AND kasitelty_pvm IS NOT NULL
      AND kasittelija IS NOT NULL
    )
  )
);

CREATE INDEX muutosehdotukset_tila_idx ON muutosehdotukset (tila);
CREATE INDEX muutosehdotukset_hanke_id_idx ON muutosehdotukset (hanke_id);

COMMENT ON TABLE muutosehdotukset IS
  'Kaikki sisääntuleva tieto. Agentilla on kirjoitusoikeus vain tähän tauluun. Julkaisu vaatii ihmisen hyväksynnän.';
COMMENT ON COLUMN muutosehdotukset.huomautus IS
  'Tähän kirjataan mm. noudetusta sivusta löytynyt agentille suunnattu teksti. Sitä ei noudateta.';
COMMENT ON COLUMN muutosehdotukset.sisalto IS
  'Ehdotetut kentät lähteineen JSON-oliona. Ei siirry hankkeet-tauluun ilman hyväksyntää.';

-- ---------------------------------------------------------------------------
-- Lähdepakko
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lahde_on_olemassa(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kentta_lahteet
    WHERE taulu = p_taulu
      AND rivi_id = p_rivi_id
      AND kentta = p_kentta
  );
$$;

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
  IF h.sijainti_lat IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
    puuttuvat := puuttuvat || 'sijainti';
  END IF;
  IF h.teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_mw') THEN
    puuttuvat := puuttuvat || 'teho_mw';
  END IF;
  IF h.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_lkm';
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

CREATE OR REPLACE FUNCTION maaraaja_puuttuvat_lahteet(m maaraajat)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('maaraajat', m.id, 'tyyppi') THEN
    puuttuvat := puuttuvat || 'tyyppi';
  END IF;
  IF NOT lahde_on_olemassa('maaraajat', m.id, 'paattyy_pvm') THEN
    puuttuvat := puuttuvat || 'paattyy_pvm';
  END IF;
  IF m.alkaa_pvm IS NOT NULL AND NOT lahde_on_olemassa('maaraajat', m.id, 'alkaa_pvm') THEN
    puuttuvat := puuttuvat || 'alkaa_pvm';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_hankkeen_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hankkeen faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hankkeet_lahteet
AFTER INSERT OR UPDATE ON hankkeet
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hankkeen_lahteet();

CREATE OR REPLACE FUNCTION tarkista_maaraajan_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := maaraaja_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Maaraajan faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_maaraajat_lahteet
AFTER INSERT OR UPDATE ON maaraajat
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_maaraajan_lahteet();

CREATE OR REPLACE FUNCTION tarkista_toimija_julkaistu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.toimija_organisaatio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM organisaatiot o
    WHERE o.id = NEW.toimija_organisaatio_id
      AND o.julkaistu
  ) THEN
    RAISE EXCEPTION 'toimija_organisaatio_id viittaa julkaisemattomaan organisaatioon'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hankkeet_toimija_julkaistu
BEFORE INSERT OR UPDATE OF toimija_organisaatio_id ON hankkeet
FOR EACH ROW
EXECUTE FUNCTION tarkista_toimija_julkaistu();

CREATE OR REPLACE FUNCTION tarkista_kentta_lahteen_rivi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hanke hankkeet;
  maaraika maaraajat;
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
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_kentta_lahteet_rivi
AFTER INSERT OR UPDATE OR DELETE ON kentta_lahteet
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_kentta_lahteen_rivi();

CREATE OR REPLACE FUNCTION poista_rivin_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM kentta_lahteet WHERE taulu = TG_TABLE_NAME AND rivi_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_hankkeet_poista_lahteet
BEFORE DELETE ON hankkeet
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE TRIGGER trg_maaraajat_poista_lahteet
BEFORE DELETE ON maaraajat
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE TRIGGER trg_organisaatiot_poista_lahteet
BEFORE DELETE ON organisaatiot
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE TRIGGER trg_yhteyshenkilot_poista_lahteet
BEFORE DELETE ON yhteyshenkilot
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

-- ---------------------------------------------------------------------------
-- Row Level Security: julkinen luku vain julkaistuun.
-- Kirjoituspolitiikkoja ei anneta anon- tai authenticated-rooleille.
-- Table owner ja service_role ohittavat RLS:n ylläpidossa.
-- ---------------------------------------------------------------------------

ALTER TABLE organisaatiot ENABLE ROW LEVEL SECURITY;
ALTER TABLE hankkeet ENABLE ROW LEVEL SECURITY;
ALTER TABLE maaraajat ENABLE ROW LEVEL SECURITY;
ALTER TABLE yhteyshenkilot ENABLE ROW LEVEL SECURITY;
ALTER TABLE kentta_lahteet ENABLE ROW LEVEL SECURITY;
ALTER TABLE muutosehdotukset ENABLE ROW LEVEL SECURITY;

CREATE POLICY organisaatiot_julkinen_luku
ON organisaatiot
FOR SELECT
TO anon, authenticated
USING (julkaistu);

CREATE POLICY hankkeet_julkinen_luku
ON hankkeet
FOR SELECT
TO anon, authenticated
USING (julkaistu);

CREATE POLICY maaraajat_julkinen_luku
ON maaraajat
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = maaraajat.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY yhteyshenkilot_julkinen_luku
ON yhteyshenkilot
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND (
    hanke_id IS NULL OR EXISTS (
      SELECT 1 FROM hankkeet h
      WHERE h.id = yhteyshenkilot.hanke_id
        AND h.julkaistu
    )
  )
  AND (
    organisaatio_id IS NULL OR EXISTS (
      SELECT 1 FROM organisaatiot o
      WHERE o.id = yhteyshenkilot.organisaatio_id
        AND o.julkaistu
    )
  )
);

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
);

-- muutosehdotukset: ei julkista lukua eikä kirjoitusta.
-- Vaihe 5 lisää lomakkeen INSERT-politiikan. Vaihe 7 lisää agentin INSERT-politiikan.

REVOKE ALL ON organisaatiot FROM anon, authenticated;
REVOKE ALL ON hankkeet FROM anon, authenticated;
REVOKE ALL ON maaraajat FROM anon, authenticated;
REVOKE ALL ON yhteyshenkilot FROM anon, authenticated;
REVOKE ALL ON kentta_lahteet FROM anon, authenticated;
REVOKE ALL ON muutosehdotukset FROM anon, authenticated;

GRANT SELECT ON organisaatiot TO anon, authenticated;
GRANT SELECT ON hankkeet TO anon, authenticated;
GRANT SELECT ON maaraajat TO anon, authenticated;
GRANT SELECT ON yhteyshenkilot TO anon, authenticated;
GRANT SELECT ON kentta_lahteet TO anon, authenticated;
