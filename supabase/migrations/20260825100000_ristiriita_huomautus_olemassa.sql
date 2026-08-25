-- Vanhojen odottavien ristiriitahavaintojen huomautukseen hankkeen nimi.
-- Uudet rivit syntyvät funktioista; agentti ei päivitä vanhoja huomautuksia.

UPDATE muutosehdotukset e
SET huomautus = 'Hankkeessa «' || h.nimi || '». ' || e.huomautus
FROM hankkeet h
WHERE e.hanke_id = h.id
  AND e.tyyppi = 'ristiriita_havainto'
  AND e.tila = 'odottaa'
  AND e.huomautus IS NOT NULL
  AND e.huomautus NOT LIKE 'Hankkeessa «%';
