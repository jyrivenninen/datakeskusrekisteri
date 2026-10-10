-- Missä faktakentissä lähteen sitovuudella on merkitystä varmistusmerkinnälle.
-- Muokattavissa ilman sovelluskoodin muutosta.

CREATE TABLE faktakentta_sitovuus (
  taulu text NOT NULL,
  kentta text NOT NULL,
  luokka text NOT NULL,
  CONSTRAINT faktakentta_sitovuus_luokka_tarkistus CHECK (
    luokka IN ('sitovuus_merkittaa', 'sitovuus_ei_merkittava')
  ),
  PRIMARY KEY (taulu, kentta)
);

COMMENT ON TABLE faktakentta_sitovuus IS
  'sitovuus_merkittaa = varmistussääntö koskee; sitovuus_ei_merkittava = ei koske. kentta * = kaikki kentät taulussa.';

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
  ('paatokset', '*', 'sitovuus_merkittaa');

ALTER TABLE faktakentta_sitovuus ENABLE ROW LEVEL SECURITY;

CREATE POLICY faktakentta_sitovuus_julkinen_luku
ON faktakentta_sitovuus
FOR SELECT
TO anon, authenticated
USING (true);

COMMENT ON POLICY faktakentta_sitovuus_julkinen_luku ON faktakentta_sitovuus IS
  'Luokittelu on julkinen metatieto.';

GRANT SELECT ON faktakentta_sitovuus TO anon, authenticated;
