-- Ei kerätä lähettäjän sähköpostia yhteydenottolomakkeella.

ALTER TABLE palautteet DROP CONSTRAINT IF EXISTS palautteet_sahkoposti_muoto;
ALTER TABLE palautteet DROP COLUMN IF EXISTS sahkoposti;

COMMENT ON TABLE palautteet IS
  'Lomakkeella jätetyt viestit ylläpidolle. Ei henkilötietoja. Ei julkaista. Ei poistoa.';
