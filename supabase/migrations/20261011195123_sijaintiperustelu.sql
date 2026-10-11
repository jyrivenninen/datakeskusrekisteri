-- Sijaintiperustelu YVA-asiakirjoista (teksti + muiden sijaintien tarkastelu).

ALTER TABLE hankkeet
  ADD COLUMN IF NOT EXISTS sijaintiperustelu text,
  ADD COLUMN IF NOT EXISTS muut_sijainnit text;

ALTER TABLE hankkeet
  DROP CONSTRAINT IF EXISTS hankkeet_sijaintiperustelu_ei_tyhja;
ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_sijaintiperustelu_ei_tyhja CHECK (
    sijaintiperustelu IS NULL OR char_length(btrim(sijaintiperustelu)) > 0
  );

ALTER TABLE hankkeet
  DROP CONSTRAINT IF EXISTS hankkeet_muut_sijainnit_tarkistus;
ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_muut_sijainnit_tarkistus CHECK (
    muut_sijainnit IS NULL
    OR muut_sijainnit IN (
      'tarkasteltu_ja_nimetty',
      'tarkasteltu_nimeamatta',
      'ei_kasitelty'
    )
  );

COMMENT ON COLUMN hankkeet.sijaintiperustelu IS
  'Miksi hanke sijoittuu valittuun paikkaan. Lainaus pakollinen (sitaatti, ei mittaluku). '
  'Ilman YVA-menettelyä kenttä jää tyhjäksi.';

COMMENT ON COLUMN hankkeet.muut_sijainnit IS
  'Muiden sijaintien tarkastelu YVA-asiakirjoissa: '
  'tarkasteltu_ja_nimetty | tarkasteltu_nimeamatta | ei_kasitelty. Lainaus pakollinen.';

INSERT INTO faktakentta_sitovuus (taulu, kentta, luokka)
SELECT v.taulu, v.kentta, v.luokka
FROM (VALUES
  ('hankkeet', 'sijaintiperustelu', 'sitovuus_ei_merkittava'),
  ('hankkeet', 'muut_sijainnit', 'sitovuus_ei_merkittava')
) AS v(taulu, kentta, luokka)
WHERE NOT EXISTS (
  SELECT 1 FROM faktakentta_sitovuus f
  WHERE f.taulu = v.taulu AND f.kentta = v.kentta
);

