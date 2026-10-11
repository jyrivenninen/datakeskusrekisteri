-- Asiakirjaehdotukset, joiden kohdistus hankkeelle on epävarma,
-- odottavat erillisessä tilassa eivätkä kiinnity tuontihankkeeseen.

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tila_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tila_tarkistus CHECK (
    tila IN ('odottaa', 'odottaa_kohdistusta', 'hyvaksytty', 'hylatty')
  );

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_kasittely;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_kasittely CHECK (
    (
      tila IN ('odottaa', 'odottaa_kohdistusta')
      AND kasitelty_pvm IS NULL
      AND kasittelija IS NULL
    )
    OR (
      tila IN ('hyvaksytty', 'hylatty')
      AND kasitelty_pvm IS NOT NULL
      AND kasittelija IS NOT NULL
    )
  );

COMMENT ON COLUMN muutosehdotukset.tila IS
  'odottaa = normaali jono; odottaa_kohdistusta = asiakirja odottaa oikean hankkeen valintaa; '
  'hyvaksytty / hylatty = käsitelty.';
