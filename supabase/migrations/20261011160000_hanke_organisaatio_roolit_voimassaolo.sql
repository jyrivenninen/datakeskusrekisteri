-- Hanke–organisaatio-roolit datana (ei CHECK-enumia). Voimassaolo ja lähde riville.

CREATE TABLE hanke_organisaatio_roolit (
  tunnus text PRIMARY KEY,
  nimi text NOT NULL,
  jarjestys integer NOT NULL DEFAULT 0,
  kaytossa boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE hanke_organisaatio_roolit IS
  'Sallitut hanke_organisaatiot.rooli-arvot. Uusi rooli = INSERT, ei skeemamuutosta.';

INSERT INTO hanke_organisaatio_roolit (tunnus, nimi, jarjestys) VALUES
  ('hankeyhtio', 'Hankeyhtiö', 10),
  ('emoyhtio', 'Emoyhtiö', 20),
  ('operaattori', 'Operaattori', 30),
  ('kiinteistonomistaja', 'Kiinteistön omistaja', 40),
  ('maanomistaja', 'Maanomistaja', 50),
  ('konsultti', 'Konsultti', 60),
  ('hallinnoija', 'Hallinnoija', 70),
  ('toimija', 'Hankkeesta vastaava (legacy)', 80),
  ('yva_konsultti', 'YVA-konsultti (legacy)', 90),
  ('yhteysviranomainen', 'Yhteysviranomainen', 100),
  ('kaavoittaja', 'Kaavoittaja', 110),
  ('muu', 'Muu', 120);

ALTER TABLE hanke_organisaatiot
  DROP CONSTRAINT IF EXISTS hanke_organisaatiot_rooli_tarkistus;

ALTER TABLE hanke_organisaatiot
  ADD CONSTRAINT hanke_organisaatiot_rooli_fk
  FOREIGN KEY (rooli) REFERENCES hanke_organisaatio_roolit (tunnus)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE hanke_organisaatiot
  DROP CONSTRAINT IF EXISTS hanke_organisaatiot_hanke_org_rooli;

ALTER TABLE hanke_organisaatiot
  ADD COLUMN IF NOT EXISTS voimassa_alkaen date,
  ADD COLUMN IF NOT EXISTS voimassa_paattyen date,
  ADD COLUMN IF NOT EXISTS lahde_dokumentti_id uuid REFERENCES dokumentit (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lahde_url text,
  ADD COLUMN IF NOT EXISTS lahde_kohta text;

ALTER TABLE hanke_organisaatiot
  ADD CONSTRAINT hanke_organisaatiot_voimassa_jarjestys CHECK (
    voimassa_paattyen IS NULL
    OR voimassa_alkaen IS NULL
    OR voimassa_paattyen >= voimassa_alkaen
  );

ALTER TABLE hanke_organisaatiot
  ADD CONSTRAINT hanke_organisaatiot_lahde_viite CHECK (
    lahde_dokumentti_id IS NOT NULL
    OR NULLIF(btrim(COALESCE(lahde_url, '')), '') IS NOT NULL
    OR (
      voimassa_alkaen IS NULL
      AND voimassa_paattyen IS NULL
      AND lahde_kohta IS NULL
    )
  );

COMMENT ON COLUMN hanke_organisaatiot.voimassa_alkaen IS
  'Roolin voimassaolon alkupäivä (nullable = ei päivitetty).';
COMMENT ON COLUMN hanke_organisaatiot.voimassa_paattyen IS
  'Roolin voimassaolon päättymispäivä (nullable = yhä voimassa tai tuntematon).';
COMMENT ON COLUMN hanke_organisaatiot.lahde_dokumentti_id IS
  'Asiakirjalähde roolille (vaihtoehto lahde_url:lle).';
COMMENT ON COLUMN hanke_organisaatiot.lahde_url IS
  'Ulkoinen lähde-URL, jos asiakirjaa ei ole dokumentit-taulussa.';
COMMENT ON COLUMN hanke_organisaatiot.lahde_kohta IS
  'Kohta asiakirjassa (esim. § 260).';

CREATE INDEX IF NOT EXISTS hanke_organisaatiot_voimassa_idx
ON hanke_organisaatiot (hanke_id, voimassa_alkaen, voimassa_paattyen);

-- ---------------------------------------------------------------------------
-- Organisaatioiden väliset suhteet (omistus ym.) — vain asiakirjaperusteisesti.
-- ---------------------------------------------------------------------------

CREATE TABLE organisaatio_suhde_tyypit (
  tunnus text PRIMARY KEY,
  nimi text NOT NULL,
  jarjestys integer NOT NULL DEFAULT 0,
  kaytossa boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE organisaatio_suhde_tyypit IS
  'Sallitut organisaatio_suhteet.suhde_tunnus-arvot.';

INSERT INTO organisaatio_suhde_tyypit (tunnus, nimi, jarjestys) VALUES
  ('omistus', 'Omistus', 10),
  ('emoyhtio', 'Emoyhtiö (konserni)', 20);

CREATE TABLE organisaatio_suhteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lahde_organisaatio_id uuid NOT NULL REFERENCES organisaatiot (id) ON DELETE RESTRICT,
  kohde_organisaatio_id uuid NOT NULL REFERENCES organisaatiot (id) ON DELETE RESTRICT,
  suhde_tunnus text NOT NULL REFERENCES organisaatio_suhde_tyypit (tunnus)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  voimassa_alkaen date,
  voimassa_paattyen date,
  lahde_dokumentti_id uuid REFERENCES dokumentit (id) ON DELETE SET NULL,
  lahde_url text,
  lahde_kohta text,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisaatio_suhteet_ei_itselleen CHECK (
    lahde_organisaatio_id <> kohde_organisaatio_id
  ),
  CONSTRAINT organisaatio_suhteet_voimassa_jarjestys CHECK (
    voimassa_paattyen IS NULL
    OR voimassa_alkaen IS NULL
    OR voimassa_paattyen >= voimassa_alkaen
  ),
  CONSTRAINT organisaatio_suhteet_lahde_pakko CHECK (
    lahde_dokumentti_id IS NOT NULL
    OR NULLIF(btrim(COALESCE(lahde_url, '')), '') IS NOT NULL
  )
);

CREATE TRIGGER trg_organisaatio_suhteet_paivitetty
BEFORE UPDATE ON organisaatio_suhteet
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX organisaatio_suhteet_kohde_idx ON organisaatio_suhteet (kohde_organisaatio_id);
CREATE INDEX organisaatio_suhteet_lahde_idx ON organisaatio_suhteet (lahde_organisaatio_id);

COMMENT ON TABLE organisaatio_suhteet IS
  'Omistus- ja konsernisuhteet vain nimetystä asiakirjasta. Älä täytä YTJ-metatiedoilla.';

ALTER TABLE hanke_organisaatio_roolit ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisaatio_suhde_tyypit ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisaatio_suhteet ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_organisaatio_roolit_julkinen_luku
ON hanke_organisaatio_roolit FOR SELECT TO anon, authenticated USING (kaytossa);

CREATE POLICY organisaatio_suhde_tyypit_julkinen_luku
ON organisaatio_suhde_tyypit FOR SELECT TO anon, authenticated USING (kaytossa);

CREATE POLICY organisaatio_suhteet_julkinen_luku
ON organisaatio_suhteet FOR SELECT TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = organisaatio_suhteet.lahde_organisaatio_id AND o.julkaistu
  )
  AND EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = organisaatio_suhteet.kohde_organisaatio_id AND o.julkaistu
  )
);

REVOKE ALL ON hanke_organisaatio_roolit FROM anon, authenticated;
REVOKE ALL ON organisaatio_suhde_tyypit FROM anon, authenticated;
REVOKE ALL ON organisaatio_suhteet FROM anon, authenticated;

GRANT SELECT ON hanke_organisaatio_roolit TO anon, authenticated;
GRANT SELECT ON organisaatio_suhde_tyypit TO anon, authenticated;
GRANT SELECT ON organisaatio_suhteet TO anon, authenticated;
