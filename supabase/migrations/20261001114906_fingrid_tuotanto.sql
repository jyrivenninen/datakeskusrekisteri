-- Fingridin valtakunnallinen tuotanto kartan vertailua varten.
-- Sivulataus lukee tämän taulun. Rajapintaa kutsutaan vain tasatunnin ajossa.

CREATE TABLE fingrid_tuotanto (
  dataset_id integer PRIMARY KEY,
  nimi text NOT NULL,
  mw numeric(12, 3) NOT NULL,
  mittaus_pvm timestamptz NOT NULL,
  lahde_url text NOT NULL,
  haettu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fingrid_tuotanto_dataset_tarkistus CHECK (
    dataset_id IN (192, 188, 245, 191)
  ),
  CONSTRAINT fingrid_tuotanto_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0),
  CONSTRAINT fingrid_tuotanto_lahde_url CHECK (lahde_url ~ '^https://')
);

COMMENT ON TABLE fingrid_tuotanto IS
  'Viimeisin Fingrid-tuotantomittaus datasettiä kohden. Päivitetään tasatunnin ajossa, ei sivulatauksessa.';
COMMENT ON COLUMN fingrid_tuotanto.lahde_url IS
  'Pysyvä viite Fingridin datasettiin, ei rajapinnan juuriosoitetta.';
COMMENT ON COLUMN fingrid_tuotanto.mittaus_pvm IS
  'Fingridin ilmoittama mittaushetki, ei haun ajankohta.';

ALTER TABLE fingrid_tuotanto ENABLE ROW LEVEL SECURITY;

CREATE POLICY fingrid_tuotanto_julkinen_luku
ON fingrid_tuotanto
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE ALL ON TABLE fingrid_tuotanto FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE fingrid_tuotanto TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE fingrid_tuotanto TO service_role;
