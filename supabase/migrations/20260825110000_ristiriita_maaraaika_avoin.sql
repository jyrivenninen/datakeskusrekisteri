-- maaraajat-taulussa ei ole tilaa avoin. Julkaistu päättynyt määräaika
-- on historianä, ei ristiriita. Spec 7A.3: «menneisyydessä mutta tila yhä avoin».
-- Tulkinta ilman tilakenttää: vanhempi rivi yhä julkaistu, saman tyypin
-- myöhempi määräaika on vielä voimassa.

CREATE OR REPLACE FUNCTION ristiriita_saanto_maaraaika_mennyt()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'maaraaika_mennyt'::text,
    vanha.hanke_id,
    'maaraaika_mennyt:' || vanha.id::text,
    'Hankkeessa «' || h.nimi || '» määräaika (' || vanha.tyyppi || ') päättyi '
      || vanha.paattyy_pvm::text
      || ', saman tyypin myöhempi määräaika on voimassa '
      || uudempi.paattyy_pvm::text
      || ' asti.'
  FROM maaraajat vanha
  JOIN hankkeet h ON h.id = vanha.hanke_id
  JOIN LATERAL (
    SELECT m.paattyy_pvm
    FROM maaraajat m
    WHERE m.hanke_id = vanha.hanke_id
      AND m.tyyppi = vanha.tyyppi
      AND m.julkaistu
      AND m.paattyy_pvm >= CURRENT_DATE
    ORDER BY m.paattyy_pvm
    LIMIT 1
  ) uudempi ON true
  WHERE vanha.julkaistu
    AND h.julkaistu
    AND vanha.paattyy_pvm < CURRENT_DATE;
$$;

COMMENT ON FUNCTION ristiriita_saanto_maaraaika_mennyt() IS
  'Päättynyt julkaistu määräaika vain jos saman tyypin myöhempi määräaika on yhä voimassa.';
