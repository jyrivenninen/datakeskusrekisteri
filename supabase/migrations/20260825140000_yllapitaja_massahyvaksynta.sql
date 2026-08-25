-- Massahyväksyntä vain merkittyyn ylläpitäjään. Oletus pois päältä.
-- Lippu asetetaan SQL Editorissa, ei käyttöliittymästä.

ALTER TABLE yllapitajat
  ADD COLUMN massahyvaksynta boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN yllapitajat.massahyvaksynta IS
  'Jos tosi, ylläpitäjä näkee ja voi käyttää odottavien ehdotusten massakäsittelyä. Muut ylläpitäjät käsittelevät rivit yksitellen.';
