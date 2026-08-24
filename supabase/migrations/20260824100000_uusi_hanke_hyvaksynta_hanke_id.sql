-- Kuva-migraatio palautti vahingossa tiukan pakotteen, joka estää
-- uuden hankkeen hyväksynnän: RPC asettaa hanke_id:n luodulle hankkeelle.

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
  );
