-- Täydennä dokumenttirekisteri kaikista faktalähde-URL:ista ja linkitä hanke_id,
-- kun URL viittaa yhteen julkaistuun hankkeeseen.

INSERT INTO dokumentit (
  url,
  otsikko,
  laji,
  muoto,
  julkaistu,
  lahde_tyyppi,
  sitovuustaso,
  otsikko_automaattinen
)
SELECT DISTINCT
  kl.lahde_url,
  kl.lahde_url,
  'verkkosivu',
  NULL,
  true,
  'muu',
  'epavirallinen',
  true
FROM kentta_lahteet kl
WHERE NOT kl.tekninen_lahde
  AND kl.taulu <> 'dokumentit'
  AND kl.lahde_url ~ '^https?://'
  AND NOT EXISTS (
    SELECT 1 FROM dokumentit d WHERE d.url = kl.lahde_url
  );

UPDATE dokumentit
SET otsikko_automaattinen = true
WHERE otsikko = url
  AND NOT otsikko_automaattinen;

-- Itseviittauslähteet (deferred trigger)
INSERT INTO kentta_lahteet (
  taulu,
  rivi_id,
  kentta,
  lahde_url,
  lahde_sivu,
  lahde_laji,
  dokumentti_id,
  vahvistettu_pvm,
  luottamus,
  lainaus,
  merkitty,
  tekninen_lahde
)
SELECT
  'dokumentit',
  d.id,
  v.kentta,
  d.url,
  NULL,
  COALESCE(
    (
      SELECT kl.lahde_laji
      FROM kentta_lahteet kl
      WHERE kl.lahde_url = d.url
        AND kl.taulu <> 'dokumentit'
      GROUP BY kl.lahde_laji
      ORDER BY COUNT(*) DESC, kl.lahde_laji
      LIMIT 1
    ),
    'html'
  ),
  d.id,
  COALESCE(
    (
      SELECT MIN(kl.vahvistettu_pvm)
      FROM kentta_lahteet kl
      WHERE kl.lahde_url = d.url
        AND kl.taulu <> 'dokumentit'
        AND NOT kl.tekninen_lahde
    ),
    CURRENT_DATE
  ),
  'epavarma',
  NULL,
  'koneen_ehdottama',
  true
FROM dokumentit d
CROSS JOIN (VALUES ('otsikko'), ('laji')) AS v(kentta)
WHERE EXISTS (
  SELECT 1
  FROM kentta_lahteet kl
  WHERE kl.lahde_url = d.url
    AND kl.taulu <> 'dokumentit'
    AND NOT kl.tekninen_lahde
)
AND NOT EXISTS (
  SELECT 1
  FROM kentta_lahteet kl
  WHERE kl.taulu = 'dokumentit'
    AND kl.rivi_id = d.id
    AND kl.kentta = v.kentta
)
ON CONFLICT ON CONSTRAINT kentta_lahteet_sama_lahde_kerran DO NOTHING;

UPDATE kentta_lahteet kl
SET dokumentti_id = d.id
FROM dokumentit d
WHERE d.url = kl.lahde_url
  AND kl.dokumentti_id IS DISTINCT FROM d.id;

WITH karto AS (
  SELECT kl.lahde_url AS url, h.id AS hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hankkeet h ON h.id = kl.rivi_id AND h.julkaistu
  WHERE kl.taulu = 'hankkeet'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, m.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN maaraajat m ON m.id = kl.rivi_id AND m.julkaistu
  WHERE kl.taulu = 'maaraajat'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, hk.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hanke_kunnat hk ON hk.id = kl.rivi_id AND hk.julkaistu
  WHERE kl.taulu = 'hanke_kunnat'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, hm.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hanke_menettelyt hm ON hm.id = kl.rivi_id AND hm.julkaistu
  WHERE kl.taulu = 'hanke_menettelyt'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, ho.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hanke_organisaatiot ho ON ho.id = kl.rivi_id AND ho.julkaistu
  WHERE kl.taulu = 'hanke_organisaatiot'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, hj.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hanke_johdot hj ON hj.id = kl.rivi_id AND hj.julkaistu
  WHERE kl.taulu = 'hanke_johdot'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, hv.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hanke_vaihtoehdot hv ON hv.id = kl.rivi_id AND hv.julkaistu
  WHERE kl.taulu = 'hanke_vaihtoehdot'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, hk.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN hanke_kuvat hk ON hk.id = kl.rivi_id AND hk.julkaistu
  WHERE kl.taulu = 'hanke_kuvat'
    AND NOT kl.tekninen_lahde

  UNION ALL

  SELECT kl.lahde_url, p.hanke_id
  FROM kentta_lahteet kl
  INNER JOIN paatokset p ON p.id = kl.rivi_id AND p.julkaistu
  WHERE kl.taulu = 'paatokset'
    AND NOT kl.tekninen_lahde
),
yksilolliset AS (
  SELECT url, (MIN(hanke_id::text))::uuid AS hanke_id
  FROM karto
  GROUP BY url
  HAVING COUNT(DISTINCT hanke_id) = 1
)
UPDATE dokumentit d
SET hanke_id = y.hanke_id
FROM yksilolliset y
WHERE d.url = y.url
  AND d.hanke_id IS NULL;
