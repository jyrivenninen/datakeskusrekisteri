-- URL-tasoinen lähdetyypitys: lahde_tyyppi ja sitovuustaso dokumentit-taulussa.
-- Täydentää kentta_lahteet-URL:t dokumenttirekisteriin (911 uniikkia tuotannossa).

ALTER TABLE dokumentit
  ADD COLUMN lahde_tyyppi text NOT NULL DEFAULT 'muu';

ALTER TABLE dokumentit
  ADD COLUMN sitovuustaso text NOT NULL DEFAULT 'epavirallinen';

ALTER TABLE dokumentit
  ADD CONSTRAINT dokumentit_lahde_tyyppi_tarkistus CHECK (
    lahde_tyyppi IN (
      'paatos',
      'viranomaisasiakirja',
      'rekisteri',
      'hankkeen_oma',
      'media',
      'muu'
    )
  );

ALTER TABLE dokumentit
  ADD CONSTRAINT dokumentit_sitovuustaso_tarkistus CHECK (
    sitovuustaso IN ('sitova', 'virallinen', 'epavirallinen')
  );

COMMENT ON COLUMN dokumentit.lahde_tyyppi IS
  'Lähteen sisältötyyppi URL-tasolla. Eri käsite kuin laji (asiakirmalaji).';
COMMENT ON COLUMN dokumentit.sitovuustaso IS
  'Lähteen virallisuus/sitovuus URL-tasolla. Eri käsite kuin kentta_lahteet.luottamus (väitteen luottamus).';

-- Oletukset jäävät: vanhat INSERT-polut saavat muu/epavirallinen kunnes syöttö täyttää eksplisiittisesti.

-- Yleisin lahde_laji kullekin URL:lle (kentta_lahteet), oletus html.
CREATE OR REPLACE FUNCTION yleisin_lahde_laji_urlille(p_url text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT kl.lahde_laji
      FROM kentta_lahteet kl
      WHERE kl.lahde_url = p_url
      GROUP BY kl.lahde_laji
      ORDER BY COUNT(*) DESC, kl.lahde_laji
      LIMIT 1
    ),
    'html'
  );
$$;

-- 1) Puuttuvat dokumenttirivit kaikille kentta_lahteet-URL:ille
INSERT INTO dokumentit (url, otsikko, laji, muoto, julkaistu, lahde_tyyppi, sitovuustaso)
SELECT
  u.lahde_url,
  u.lahde_url,
  'verkkosivu',
  NULL,
  true,
  'muu',
  'epavirallinen'
FROM (
  SELECT DISTINCT lahde_url
  FROM kentta_lahteet
) u
WHERE NOT EXISTS (
  SELECT 1 FROM dokumentit d WHERE d.url = u.lahde_url
);

-- 2) Itseviittauslähteet otsikolle ja lajille (deferred trigger vaatii nämä commitissa)
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
  merkitty
)
SELECT
  'dokumentit',
  d.id,
  v.kentta,
  d.url,
  NULL,
  yleisin_lahde_laji_urlille(d.url),
  d.id,
  COALESCE(
    (SELECT MIN(kl.vahvistettu_pvm) FROM kentta_lahteet kl WHERE kl.lahde_url = d.url),
    CURRENT_DATE
  ),
  'epavarma',
  NULL,
  'koneen_ehdottama'
FROM dokumentit d
CROSS JOIN (VALUES ('otsikko'), ('laji')) AS v(kentta)
WHERE EXISTS (SELECT 1 FROM kentta_lahteet kl WHERE kl.lahde_url = d.url)
  AND NOT EXISTS (
    SELECT 1
    FROM kentta_lahteet kl
    WHERE kl.taulu = 'dokumentit'
      AND kl.rivi_id = d.id
      AND kl.kentta = v.kentta
  )
ON CONFLICT (taulu, rivi_id, kentta, lahde_url) DO NOTHING;

-- 3) Linkitä kaikki kentta_lahteet oikeaan dokumenttiin URL:n perusteella
UPDATE kentta_lahteet kl
SET dokumentti_id = d.id
FROM dokumentit d
WHERE d.url = kl.lahde_url
  AND (kl.dokumentti_id IS DISTINCT FROM d.id);

DROP FUNCTION yleisin_lahde_laji_urlille(text);
