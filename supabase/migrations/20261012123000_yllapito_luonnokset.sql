-- Ylläpidon tilapäiset luonnokset (esim. Uusi hanke -esikatselu).
-- Eväste ei riitä suurelle JSON:lle (~4 kt raja).

CREATE TABLE yllapito_luonnokset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kayttaja_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  avain text NOT NULL,
  sisalto jsonb NOT NULL,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  vanhenee_pvm timestamptz NOT NULL,
  CONSTRAINT yllapito_luonnokset_avain_ei_tyhja CHECK (char_length(trim(avain)) > 0),
  CONSTRAINT yllapito_luonnokset_kayttaja_avain UNIQUE (kayttaja_id, avain)
);

CREATE INDEX yllapito_luonnokset_vanhenee_idx
  ON yllapito_luonnokset (vanhenee_pvm);

COMMENT ON TABLE yllapito_luonnokset IS
  'Ylläpitäjän tilapäinen UI-tila (esikatselu). Ei julkaistua hankedataa.';

ALTER TABLE yllapito_luonnokset ENABLE ROW LEVEL SECURITY;

CREATE POLICY yllapito_luonnokset_oma
ON yllapito_luonnokset
FOR ALL
TO authenticated
USING (kayttaja_id = auth.uid())
WITH CHECK (kayttaja_id = auth.uid());

REVOKE ALL ON yllapito_luonnokset FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON yllapito_luonnokset TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON yllapito_luonnokset TO service_role;
