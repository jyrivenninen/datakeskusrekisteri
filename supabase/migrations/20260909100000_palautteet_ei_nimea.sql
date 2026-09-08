-- Ei kerätä eikä tallenneta lähettäjän nimeä yhteydenottolomakkeella.

ALTER TABLE palautteet DROP CONSTRAINT IF EXISTS palautteet_nimi_pituus;
ALTER TABLE palautteet DROP COLUMN IF EXISTS nimi;

COMMENT ON TABLE palautteet IS
  'Lomakkeella jätetyt viestit ylläpidolle. Ei nimi-kenttää. Ei julkaista. Ei poistoa.';
