-- faktakentta_sitovuus (jos ei vielä tuotannossa)
CREATE TABLE IF NOT EXISTS faktakentta_sitovuus (
  taulu text NOT NULL,
  kentta text NOT NULL,
  luokka text NOT NULL,
  CONSTRAINT faktakentta_sitovuus_luokka_tarkistus CHECK (
    luokka IN ('sitovuus_merkittaa', 'sitovuus_ei_merkittava')
  ),
  PRIMARY KEY (taulu, kentta)
);

INSERT INTO faktakentta_sitovuus (taulu, kentta, luokka) VALUES
  ('hankkeet', 'teho_mw', 'sitovuus_merkittaa'),
  ('hankkeet', 'it_teho_mw', 'sitovuus_merkittaa'),
  ('hankkeet', 'pinta_ala_ha', 'sitovuus_merkittaa'),
  ('hankkeet', 'generaattorit_lkm', 'sitovuus_merkittaa'),
  ('hankkeet', 'sahkonkaytto_twh_a', 'sitovuus_merkittaa'),
  ('hankkeet', 'vaihe', 'sitovuus_merkittaa'),
  ('hankkeet', 'kaavatunnus', 'sitovuus_merkittaa'),
  ('hankkeet', 'kortteli', 'sitovuus_merkittaa'),
  ('hankkeet', 'nimi', 'sitovuus_ei_merkittava'),
  ('hankkeet', 'kunta', 'sitovuus_ei_merkittava'),
  ('hankkeet', 'maakunta', 'sitovuus_ei_merkittava'),
  ('hankkeet', 'sijainti', 'sitovuus_ei_merkittava'),
  ('hankkeet', 'toimija_organisaatio_id', 'sitovuus_ei_merkittava'),
  ('maaraajat', '*', 'sitovuus_merkittaa'),
  ('paatokset', '*', 'sitovuus_merkittaa')
ON CONFLICT (taulu, kentta) DO NOTHING;

ALTER TABLE faktakentta_sitovuus ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'faktakentta_sitovuus_julkinen_luku'
  ) THEN
    CREATE POLICY faktakentta_sitovuus_julkinen_luku
    ON faktakentta_sitovuus FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

GRANT SELECT ON faktakentta_sitovuus TO anon, authenticated;

-- Organisaation verkkotunnus (host), erillinen verkko_osoite-URL:sta
ALTER TABLE organisaatiot
  ADD COLUMN IF NOT EXISTS verkkotunnus text;

ALTER TABLE organisaatiot
  DROP CONSTRAINT IF EXISTS organisaatiot_verkkotunnus_muoto;

ALTER TABLE organisaatiot
  ADD CONSTRAINT organisaatiot_verkkotunnus_muoto CHECK (
    verkkotunnus IS NULL
    OR (
      char_length(trim(verkkotunnus)) > 0
      AND verkkotunnus = lower(verkkotunnus)
      AND verkkotunnus !~ '[/:]'
    )
  );

COMMENT ON COLUMN organisaatiot.verkkotunnus IS
  'Verkkotunnus (host), esim. ytj PRH website-kentästä. Ei polkua eikä skhemata.';

-- Geokoodaus / menetelmälähde
ALTER TABLE dokumentit
  DROP CONSTRAINT IF EXISTS dokumentit_lahde_tyyppi_tarkistus;

ALTER TABLE dokumentit
  ADD CONSTRAINT dokumentit_lahde_tyyppi_tarkistus CHECK (
    lahde_tyyppi IN (
      'paatos',
      'viranomaisasiakirja',
      'rekisteri',
      'hankkeen_oma',
      'media',
      'menetelma',
      'muu'
    )
  );

COMMENT ON COLUMN dokumentit.lahde_tyyppi IS
  'menetelma = geokoodaus tai muu laskentamenetelmä, ei faktaväitteen lähde.';
