-- Vaihe 2 täydennys: koodistot, lokitaulut, lähteen laji, havaintoehdotukset.
-- Luottamus viranomaisrajapinnalle jää hyväksyntälogiikkaan, ei CHECK-ehtoon.
-- service_role ei saa kirjoittaa julkaistuihin sisältötauluihin suoraan;
-- julkaisu kulkee SECURITY DEFINER -funktioiden kautta.

-- ---------------------------------------------------------------------------
-- kentta_lahteet.lahde_laji
-- ---------------------------------------------------------------------------

ALTER TABLE kentta_lahteet
  ADD COLUMN lahde_laji text NOT NULL DEFAULT 'html';

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_lahde_laji_tarkistus CHECK (
    lahde_laji IN ('dokumentti', 'rajapinta', 'rss', 'html')
  );

UPDATE kentta_lahteet
SET lahde_laji = 'dokumentti'
WHERE dokumentti_id IS NOT NULL;

COMMENT ON COLUMN kentta_lahteet.lahde_laji IS
  'Lähteen muoto. Rajapintahaku on lähde siinä missä dokumentti; lahde_url osoittaa tietueeseen, ei juureen.';

-- ---------------------------------------------------------------------------
-- Ehdotustyypit: Ryhti- ja kuntahavainto. Eivät julkaise hanketta.
-- ---------------------------------------------------------------------------

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'uusi_hanke',
      'taydennys',
      'korjaus',
      'kuva',
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto'
    )
  );

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_uusi_ilman_hanketta;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_uusi_ilman_hanketta CHECK (
    (
      tyyppi = 'uusi_hanke'
      AND (
        (tila = 'odottaa' AND hanke_id IS NULL)
        OR (tila = 'hyvaksytty' AND hanke_id IS NOT NULL)
        OR (tila = 'hylatty' AND hanke_id IS NULL)
      )
    )
    OR (tyyppi IN ('taydennys', 'korjaus', 'kuva') AND hanke_id IS NOT NULL)
    OR tyyppi IN ('linkki_rikki', 'ryhti_havainto', 'kunta_havainto')
  );

COMMENT ON TABLE muutosehdotukset IS
  'Sisääntuleva sisältö. Agentti kirjoittaa tänne ehdotukset; tekniset ajolokit ovat eri tauluissa. Julkaisu vaatii ihmisen hyväksynnän.';

-- ---------------------------------------------------------------------------
-- kunnat (Syken hakemiston koodisto; ei käsin tiedostoon)
-- ---------------------------------------------------------------------------

CREATE TABLE kunnat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  koodi text NOT NULL,
  nimi text NOT NULL,
  nimi_sv text,
  maakunta text,
  ely text,
  voimassa boolean NOT NULL DEFAULT true,
  lahde_url text,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kunnat_koodi_ei_tyhja CHECK (char_length(trim(koodi)) > 0),
  CONSTRAINT kunnat_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0),
  CONSTRAINT kunnat_koodi_yksilollinen UNIQUE (koodi),
  CONSTRAINT kunnat_url_muoto CHECK (
    lahde_url IS NULL OR lahde_url ~ '^https?://'
  )
);

CREATE TRIGGER trg_kunnat_paivitetty
BEFORE UPDATE ON kunnat
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX kunnat_nimi_idx ON kunnat (nimi);

COMMENT ON TABLE kunnat IS
  'Kuntakoodisto Syken hakemistosta. Hankkeet.kunta säilyy tekstinä kunnes kytketään erikseen.';
COMMENT ON COLUMN kunnat.koodi IS
  'Pysyvä kuntakoodi hakemistossa. Ei arvata muistista.';
COMMENT ON COLUMN kunnat.lahde_url IS
  'Pysyvä viittaus hakemiston tietueeseen, ei rajapinnan juureen.';

-- ---------------------------------------------------------------------------
-- kunta_esityslista_lahteet (ylläpito selaimesta, ei gitistä)
-- ---------------------------------------------------------------------------

CREATE TABLE kunta_esityslista_lahteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunta_id uuid NOT NULL REFERENCES kunnat (id) ON DELETE RESTRICT,
  jarjestelma text NOT NULL,
  perus_url text NOT NULL,
  seurannassa boolean NOT NULL DEFAULT true,
  huomautus text,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kunta_esityslista_jarjestelma_tarkistus CHECK (
    jarjestelma IN (
      'casem',
      'dynasty',
      'tweb',
      'rss',
      'ical',
      'avoindata',
      'muu'
    )
  ),
  CONSTRAINT kunta_esityslista_url_muoto CHECK (perus_url ~ '^https?://'),
  CONSTRAINT kunta_esityslista_kunta_jarjestelma UNIQUE (kunta_id, jarjestelma)
);

CREATE TRIGGER trg_kunta_esityslista_lahteet_paivitetty
BEFORE UPDATE ON kunta_esityslista_lahteet
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX kunta_esityslista_kunta_idx ON kunta_esityslista_lahteet (kunta_id);
CREATE INDEX kunta_esityslista_seuranta_idx ON kunta_esityslista_lahteet (seurannassa);

COMMENT ON TABLE kunta_esityslista_lahteet IS
  'Kunta → asianhallintajärjestelmä. Automaattiseurannan kattavuus; seurannassa = false tai puuttuva rivi = ei automaatiota.';
COMMENT ON COLUMN kunta_esityslista_lahteet.seurannassa IS
  'true = ajo hakee tätä lähdettä. Julkinen näkymä erottaa katvealueen.';

-- ---------------------------------------------------------------------------
-- Lokitaulut (palvelinajo kirjoittaa, kukaan ei poista)
-- ---------------------------------------------------------------------------

CREATE TABLE lahdeajot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sovitin text NOT NULL,
  tila text NOT NULL,
  alkoi_pvm timestamptz NOT NULL DEFAULT now(),
  paattyi_pvm timestamptz,
  http_tila integer,
  osumia integer NOT NULL DEFAULT 0,
  virhe text,
  kysely_url text,
  CONSTRAINT lahdeajot_sovitin_ei_tyhja CHECK (char_length(trim(sovitin)) > 0),
  CONSTRAINT lahdeajot_tila_tarkistus CHECK (
    tila IN ('kaynnissa', 'valmis', 'epaonnistui')
  ),
  CONSTRAINT lahdeajot_tila_ajat CHECK (
    (
      tila = 'kaynnissa'
      AND paattyi_pvm IS NULL
    )
    OR (
      tila IN ('valmis', 'epaonnistui')
      AND paattyi_pvm IS NOT NULL
    )
  ),
  CONSTRAINT lahdeajot_osumia_ei_negatiivinen CHECK (osumia >= 0),
  CONSTRAINT lahdeajot_http_tila CHECK (
    http_tila IS NULL OR (http_tila >= 100 AND http_tila < 600)
  ),
  CONSTRAINT lahdeajot_url_muoto CHECK (
    kysely_url IS NULL OR kysely_url ~ '^https?://'
  )
);

CREATE INDEX lahdeajot_sovitin_alkoi_idx ON lahdeajot (sovitin, alkoi_pvm DESC);

COMMENT ON TABLE lahdeajot IS
  'Rajapinta- ja kuntasovittimien ajoloki. Ylläpito näkee hajonneen sovittimen.';

CREATE TABLE dokumentti_tiivisteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dokumentti_id uuid NOT NULL REFERENCES dokumentit (id) ON DELETE RESTRICT,
  tiiviste text NOT NULL,
  merkkimaara integer,
  tarkistettu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dokumentti_tiivisteet_sha256 CHECK (tiiviste ~ '^[0-9a-f]{64}$'),
  CONSTRAINT dokumentti_tiivisteet_merkkimaara CHECK (
    merkkimaara IS NULL OR merkkimaara >= 0
  )
);

CREATE INDEX dokumentti_tiivisteet_dokumentti_pvm_idx
ON dokumentti_tiivisteet (dokumentti_id, tarkistettu_pvm DESC);

COMMENT ON TABLE dokumentti_tiivisteet IS
  'Historia: jokainen 7A.2-tarkistus lisää rivin. Viimeisin = MAX(tarkistettu_pvm) dokumentille.';

CREATE TABLE rajapinta_tiivisteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sovitin text NOT NULL,
  tietue_url text NOT NULL,
  tiiviste text NOT NULL,
  tarkistettu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rajapinta_tiivisteet_sovitin_ei_tyhja CHECK (
    char_length(trim(sovitin)) > 0
  ),
  CONSTRAINT rajapinta_tiivisteet_sha256 CHECK (tiiviste ~ '^[0-9a-f]{64}$'),
  CONSTRAINT rajapinta_tiivisteet_url_muoto CHECK (tietue_url ~ '^https?://'),
  CONSTRAINT rajapinta_tiivisteet_sovitin_tietue UNIQUE (sovitin, tietue_url)
);

COMMENT ON TABLE rajapinta_tiivisteet IS
  'SHA-256 rakenteisen rajapintatietueen sisällöstä. Erotettu dokumenttitiivisteistä.';

CREATE TABLE mallikutsut (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjoaja text NOT NULL,
  malli_nimi text NOT NULL,
  kehotteen_tiiviste text NOT NULL,
  kaytetyt_tokenit integer NOT NULL DEFAULT 0,
  onnistui boolean NOT NULL,
  virhe text,
  dokumentti_url text,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mallikutsut_tarjoaja_ei_tyhja CHECK (char_length(trim(tarjoaja)) > 0),
  CONSTRAINT mallikutsut_malli_ei_tyhja CHECK (char_length(trim(malli_nimi)) > 0),
  CONSTRAINT mallikutsut_tiiviste_sha256 CHECK (
    kehotteen_tiiviste ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mallikutsut_tokenit CHECK (kaytetyt_tokenit >= 0),
  CONSTRAINT mallikutsut_url_muoto CHECK (
    dokumentti_url IS NULL OR dokumentti_url ~ '^https?://'
  )
);

CREATE INDEX mallikutsut_luotu_idx ON mallikutsut (luotu_pvm DESC);
CREATE INDEX mallikutsut_kehote_idx ON mallikutsut (kehotteen_tiiviste);

COMMENT ON TABLE mallikutsut IS
  'Kielimallikutsujen määrä ja tokenit. Päiväkatto on sovelluskonfiguraatiossa.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE kunnat ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunta_esityslista_lahteet ENABLE ROW LEVEL SECURITY;
ALTER TABLE lahdeajot ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumentti_tiivisteet ENABLE ROW LEVEL SECURITY;
ALTER TABLE rajapinta_tiivisteet ENABLE ROW LEVEL SECURITY;
ALTER TABLE mallikutsut ENABLE ROW LEVEL SECURITY;

CREATE POLICY kunnat_julkinen_luku
ON kunnat
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY kunta_esityslista_julkinen_luku
ON kunta_esityslista_lahteet
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY kunta_esityslista_yllapito_lisays
ON kunta_esityslista_lahteet
FOR INSERT
TO authenticated
WITH CHECK (onko_yllapitaja());

CREATE POLICY kunta_esityslista_yllapito_paivitys
ON kunta_esityslista_lahteet
FOR UPDATE
TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

CREATE POLICY kunnat_yllapito_lisays
ON kunnat
FOR INSERT
TO authenticated
WITH CHECK (onko_yllapitaja());

CREATE POLICY kunnat_yllapito_paivitys
ON kunnat
FOR UPDATE
TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

CREATE POLICY lahdeajot_yllapito_luku
ON lahdeajot
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY dokumentti_tiivisteet_yllapito_luku
ON dokumentti_tiivisteet
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY rajapinta_tiivisteet_yllapito_luku
ON rajapinta_tiivisteet
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY mallikutsut_yllapito_luku
ON mallikutsut
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

-- ---------------------------------------------------------------------------
-- Oikeudet: service_role ei kirjoita julkaistua sisältöä suoraan.
-- Lokit: INSERT/UPDATE/SELECT, ei DELETE.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE
  organisaatiot,
  hankkeet,
  maaraajat,
  yhteyshenkilot,
  kentta_lahteet,
  dokumentit,
  hanke_kunnat,
  hanke_menettelyt,
  hanke_organisaatiot,
  hanke_johdot,
  hanke_vaihtoehdot,
  hanke_kuvat
FROM service_role;

GRANT SELECT ON TABLE
  organisaatiot,
  hankkeet,
  maaraajat,
  yhteyshenkilot,
  kentta_lahteet,
  dokumentit,
  hanke_kunnat,
  hanke_menettelyt,
  hanke_organisaatiot,
  hanke_johdot,
  hanke_vaihtoehdot,
  hanke_kuvat
TO service_role;

REVOKE ALL ON TABLE muutosehdotukset FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE muutosehdotukset TO service_role;

REVOKE ALL ON TABLE
  kunnat,
  kunta_esityslista_lahteet,
  lahdeajot,
  dokumentti_tiivisteet,
  rajapinta_tiivisteet,
  mallikutsut
FROM anon, authenticated, service_role;

GRANT SELECT ON TABLE kunnat TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE kunnat TO service_role;
GRANT INSERT, UPDATE ON TABLE kunnat TO authenticated;

GRANT SELECT ON TABLE kunta_esityslista_lahteet TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE kunta_esityslista_lahteet TO service_role;
GRANT INSERT, UPDATE ON TABLE kunta_esityslista_lahteet TO authenticated;

GRANT SELECT ON TABLE
  lahdeajot,
  dokumentti_tiivisteet,
  rajapinta_tiivisteet,
  mallikutsut
TO authenticated, service_role;

GRANT INSERT, UPDATE ON TABLE
  lahdeajot,
  dokumentti_tiivisteet,
  rajapinta_tiivisteet,
  mallikutsut
TO service_role;

-- ---------------------------------------------------------------------------
-- hankkeet.kunta_id koodiston viitteeksi; teksti kunta säilyy
-- ---------------------------------------------------------------------------

ALTER TABLE hankkeet
  ADD COLUMN kunta_id uuid REFERENCES kunnat (id) ON DELETE RESTRICT;

CREATE INDEX hankkeet_kunta_id_idx ON hankkeet (kunta_id);

COMMENT ON COLUMN hankkeet.kunta_id IS
  'Viite kunnat-koodistoon. NULL kunnes hakemistosovitin täyttää. Tekstikenttä kunta jää.';

-- ---------------------------------------------------------------------------
-- search_path: public, pg_temp kaikissa SECURITY DEFINER -funktioissa
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS allekirjoitus
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_temp',
      r.allekirjoitus
    );
  END LOOP;
END;
$$;
