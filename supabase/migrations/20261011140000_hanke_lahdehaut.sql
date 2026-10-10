-- Hankekohtainen viranomais-/asiakirjahakuloki (tyhjät ja osuvat haut).

CREATE TABLE hanke_lahdehaut (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  jarjestelma text NOT NULL,
  hakusanat text NOT NULL,
  ajankohta date NOT NULL,
  osumia integer NOT NULL DEFAULT 0,
  yhteenveto text NOT NULL,
  suorittaja text NOT NULL,
  hakijan_tyyppi text NOT NULL,
  tila text NOT NULL DEFAULT 'odottaa',
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_lahdehaut_jarjestelma_ei_tyhja CHECK (char_length(trim(jarjestelma)) > 0),
  CONSTRAINT hanke_lahdehaut_hakusanat_ei_tyhja CHECK (char_length(trim(hakusanat)) > 0),
  CONSTRAINT hanke_lahdehaut_yhteenveto_ei_tyhja CHECK (char_length(trim(yhteenveto)) > 0),
  CONSTRAINT hanke_lahdehaut_suorittaja_ei_tyhja CHECK (char_length(trim(suorittaja)) > 0),
  CONSTRAINT hanke_lahdehaut_osumia_ei_negatiivinen CHECK (osumia >= 0),
  CONSTRAINT hanke_lahdehaut_hakijan_tyyppi_tarkistus CHECK (
    hakijan_tyyppi IN ('kasin', 'agentti', 'ulkopuolinen_selvitys')
  ),
  CONSTRAINT hanke_lahdehaut_tila_tarkistus CHECK (
    tila IN ('odottaa', 'hyvaksytty', 'hylatty')
  )
);

CREATE INDEX hanke_lahdehaut_hanke_idx ON hanke_lahdehaut (hanke_id, ajankohta DESC);

COMMENT ON TABLE hanke_lahdehaut IS
  'Hankkeelle tehdyt viranomaisjärjestelmähaut. Tyhjä tulos on tieto, ei epäonnistuminen.';
COMMENT ON COLUMN hanke_lahdehaut.hakijan_tyyppi IS
  'kasin | agentti | ulkopuolinen_selvitys — eri luotettavuusluokat.';

ALTER TABLE hanke_lahdehaut ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_lahdehaut_yllapito_luku
ON hanke_lahdehaut
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY hanke_lahdehaut_yllapito_kirjoitus
ON hanke_lahdehaut
FOR INSERT
TO authenticated
WITH CHECK (onko_yllapitaja());

CREATE POLICY hanke_lahdehaut_yllapito_paivitys
ON hanke_lahdehaut
FOR UPDATE
TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

REVOKE ALL ON TABLE hanke_lahdehaut FROM PUBLIC, anon, agentti;
GRANT SELECT, INSERT, UPDATE ON TABLE hanke_lahdehaut TO authenticated;
GRANT ALL ON TABLE hanke_lahdehaut TO service_role;
