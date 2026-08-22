-- Odottavalla uudella hankkeella ei ole hanke_id:tä. Hyväksynnän jälkeen
-- ehdotus viittaa luotuun hankkeeseen jäljitettävyyttä varten.

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
    OR (tyyppi IN ('taydennys', 'korjaus') AND hanke_id IS NOT NULL)
  );
