-- Julkinen hankkeen huomautus (esim. monitoiminen alue: DC + akku/aurinko).
-- Lähde pakollinen kuten muillakin faktakentillä.

ALTER TABLE hankkeet
  ADD COLUMN huomautus text;

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_huomautus_ei_tyhja CHECK (
    huomautus IS NULL OR char_length(btrim(huomautus)) > 0
  );

COMMENT ON COLUMN hankkeet.huomautus IS
  'Julkinen huomautus hankesivulla. Esim. asiakirjoissa mainittu akkuvarasto tai aurinkovoima samalla alueella. Vaatii lähteen.';

