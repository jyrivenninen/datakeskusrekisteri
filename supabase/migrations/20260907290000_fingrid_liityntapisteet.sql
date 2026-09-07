-- Fingridin liityntäpisteet kartalle (OSM Overpass, ei Fingridin virallista sijaintidataa).

CREATE TABLE fingrid_liityntapisteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id bigint NOT NULL,
  osm_tyyppi text NOT NULL CHECK (osm_tyyppi IN ('node', 'way')),
  nimi text NOT NULL,
  lat numeric(9, 6) NOT NULL,
  lon numeric(9, 6) NOT NULL,
  jannite text,
  lahde_url text NOT NULL,
  luottamus text NOT NULL DEFAULT 'epavarma'
    CHECK (luottamus IN ('vahvistettu', 'epavarma', 'ristiriitainen')),
  vahvistettu_pvm date NOT NULL DEFAULT CURRENT_DATE,
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fingrid_liityntapisteet_osm_yksilollinen UNIQUE (osm_id, osm_tyyppi),
  CONSTRAINT fingrid_liityntapisteet_koordinaatit CHECK (
    lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
  )
);

CREATE INDEX fingrid_liityntapisteet_paivitetty_idx
  ON fingrid_liityntapisteet (paivitetty_pvm DESC);

COMMENT ON TABLE fingrid_liityntapisteet IS
  'Sähköasemien sijainnit karttakerrosta varten. Lähde OpenStreetMap (Overpass), ei Fingridin API:ta.';
COMMENT ON COLUMN fingrid_liityntapisteet.lahde_url IS
  'Pysyvä viite OSM-tietueeseen, ei Overpass-juuri-URL:ää.';

ALTER TABLE fingrid_liityntapisteet ENABLE ROW LEVEL SECURITY;

CREATE POLICY fingrid_liityntapisteet_julkinen_luku
ON fingrid_liityntapisteet
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE ALL ON TABLE fingrid_liityntapisteet FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE fingrid_liityntapisteet TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE fingrid_liityntapisteet TO service_role;
