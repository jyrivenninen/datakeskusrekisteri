-- Tekstikatkelma dokumenttitiivisteisiin 7B.3-tiivistäjää varten.

ALTER TABLE dokumentti_tiivisteet
  ADD COLUMN teksti_katkelma text;

COMMENT ON COLUMN dokumentti_tiivisteet.teksti_katkelma IS
  'Uutetun tekstin katkelma (7B.3). Ei julkinen; vanha versio haetaan tiivistäjälle.';
