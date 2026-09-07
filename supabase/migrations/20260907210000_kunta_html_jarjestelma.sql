-- 7A.6: HTML-pohjainen esityslistasovitin (esim. paatokset.hel.fi)

ALTER TABLE kunta_esityslista_lahteet
  DROP CONSTRAINT kunta_esityslista_jarjestelma_tarkistus;

ALTER TABLE kunta_esityslista_lahteet
  ADD CONSTRAINT kunta_esityslista_jarjestelma_tarkistus CHECK (
    jarjestelma IN (
      'casem',
      'dynasty',
      'tweb',
      'rss',
      'ical',
      'avoindata',
      'html',
      'muu'
    )
  );
