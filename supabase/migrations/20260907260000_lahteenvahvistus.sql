-- 7B.1 Lähteenvahvistaja: havainto tallennetusta kentästä vs. lähdeasiakirja.

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'uusi_hanke',
      'taydennys',
      'korjaus',
      'kuva',
      'kentta_tarkistus',
      'kentta_tyhjennys',
      'paatos',
      'maaraaja',
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto',
      'lahteenvahvistus',
      'lahteenvahvistus_pyynto'
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
    OR (
      tyyppi IN (
        'taydennys',
        'korjaus',
        'kuva',
        'kentta_tarkistus',
        'kentta_tyhjennys',
        'paatos',
        'maaraaja',
        'lahteenvahvistus',
        'lahteenvahvistus_pyynto'
      )
      AND hanke_id IS NOT NULL
    )
    OR tyyppi IN (
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto'
    )
  );

COMMENT ON CONSTRAINT muutosehdotukset_tyyppi_tarkistus ON muutosehdotukset IS
  'lahteenvahvistus = mallin tulos; lahteenvahvistus_pyynto = ylläpitäjän käynnistämä jono.';
