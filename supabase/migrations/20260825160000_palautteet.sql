-- Julkinen yhteydenotto- ja palautelomake. Ei sähköpostia. Rivejä ei poisteta.

CREATE TABLE palautteet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aihe text NOT NULL DEFAULT 'palaute',
  nimi text,
  sahkoposti text,
  viesti text NOT NULL,
  tila text NOT NULL DEFAULT 'odottaa',
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  kasitelty_pvm timestamptz,
  kasittelija text,
  huomautus text,
  CONSTRAINT palautteet_aihe_tarkistus CHECK (
    aihe IN ('palaute', 'kysymys', 'muu')
  ),
  CONSTRAINT palautteet_tila_tarkistus CHECK (
    tila IN ('odottaa', 'kasitelty')
  ),
  CONSTRAINT palautteet_viesti_pituus CHECK (
    char_length(trim(viesti)) >= 12
    AND char_length(viesti) <= 8000
  ),
  CONSTRAINT palautteet_nimi_pituus CHECK (
    nimi IS NULL OR (
      char_length(trim(nimi)) > 0
      AND char_length(nimi) <= 200
    )
  ),
  CONSTRAINT palautteet_sahkoposti_muoto CHECK (
    sahkoposti IS NULL OR sahkoposti ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT palautteet_tila_kasittely CHECK (
    (
      tila = 'odottaa'
      AND kasitelty_pvm IS NULL
      AND kasittelija IS NULL
    )
    OR (
      tila = 'kasitelty'
      AND kasitelty_pvm IS NOT NULL
      AND kasittelija IS NOT NULL
    )
  )
);

CREATE INDEX palautteet_tila_luotu_idx ON palautteet (tila, luotu_pvm DESC);

COMMENT ON TABLE palautteet IS
  'Lomakkeella jätetyt viestit ylläpidolle. Ei julkaista. Ei poistoa.';

ALTER TABLE palautteet ENABLE ROW LEVEL SECURITY;

CREATE POLICY palautteet_lomake_lisays
ON palautteet
FOR INSERT
TO anon, authenticated
WITH CHECK (
  tila = 'odottaa'
  AND kasitelty_pvm IS NULL
  AND kasittelija IS NULL
  AND huomautus IS NULL
);

CREATE POLICY palautteet_yllapito_luku
ON palautteet
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY palautteet_yllapito_paivitys
ON palautteet
FOR UPDATE
TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

REVOKE ALL ON TABLE palautteet FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE palautteet TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE palautteet TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE palautteet TO service_role;
