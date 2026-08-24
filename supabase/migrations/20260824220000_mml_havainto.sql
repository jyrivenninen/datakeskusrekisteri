-- MML-geokoodaushavainto jonoon. Ei julkaise hanketietoa.

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'uusi_hanke',
      'taydennys',
      'korjaus',
      'kuva',
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto'
    )
  );

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_uusi_ilman_hanketta;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_uusi_ilman_hanketta CHECK (
    (
      tyyppi = 'uusi_hanke'
      AND (
        (tila = 'odottaa' AND hanke_id IS NULL)
        OR (tila = 'hyvaksytty' AND hanke_id IS NOT NULL)
        OR (tila = 'hylatty' AND hanke_id IS NULL)
      )
    )
    OR (tyyppi IN ('taydennys', 'korjaus', 'kuva') AND hanke_id IS NOT NULL)
    OR tyyppi IN (
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto'
    )
  );
