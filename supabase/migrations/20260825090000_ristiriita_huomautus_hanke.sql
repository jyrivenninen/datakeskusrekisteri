-- Ristiriitahavainnon huomautukseen hankkeen nimi. Ei julkaise.

CREATE OR REPLACE FUNCTION ristiriita_saanto_rekisterointi_ennen_hanketta()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH rek AS (
    SELECT DISTINCT ON (e.sisalto -> 'ytj' ->> 'organisaatio_id')
      (e.sisalto -> 'ytj' ->> 'organisaatio_id')::uuid AS org_id,
      (e.sisalto -> 'ytj' ->> 'rekisterointi_pvm')::date AS rek_pvm
    FROM muutosehdotukset e
    WHERE e.tyyppi = 'ytj_havainto'
      AND e.tila = 'hyvaksytty'
      AND (e.sisalto -> 'ytj' ->> 'organisaatio_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (e.sisalto -> 'ytj' ->> 'rekisterointi_pvm') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ORDER BY
      e.sisalto -> 'ytj' ->> 'organisaatio_id',
      e.kasitelty_pvm DESC NULLS LAST,
      e.luotu_pvm DESC
  ),
  hpvm AS (
    SELECT
      h.id,
      (
        SELECT min(m.paattyy_pvm)
        FROM maaraajat m
        WHERE m.hanke_id = h.id
          AND m.julkaistu
      ) AS hanke_pvm
    FROM hankkeet h
    WHERE h.julkaistu
      AND h.toimija_organisaatio_id IS NOT NULL
  )
  SELECT
    'rekisterointi_ennen_hanketta'::text,
    hpvm.id,
    'rekisterointi_ennen_hanketta:' || hpvm.id::text,
    'Hankkeessa «' || h.nimi || '» määräajan päättymispäivä on ' || hpvm.hanke_pvm::text
      || ', toimijan YTJ-rekisteröintipäivä on ' || rek.rek_pvm::text || '.'
  FROM hpvm
  JOIN hankkeet h ON h.id = hpvm.id
  JOIN rek ON rek.org_id = h.toimija_organisaatio_id
  WHERE hpvm.hanke_pvm IS NOT NULL
    AND hpvm.hanke_pvm < rek.rek_pvm;
$$;

CREATE OR REPLACE FUNCTION ristiriita_saanto_teho_suhde(p_teho_suhde numeric)
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'teho_suhde'::text,
    h.id,
    'teho_suhde:' || h.id::text,
    'Hankkeessa «' || h.nimi || '» generaattorien polttoaineteho × lukumäärä on '
      || (COALESCE(h.generaattorit_kaytossa_max_lkm, h.generaattorit_lkm)
          * h.generaattori_polttoaineteho_mw)::text
      || ' MW, ilmoitettu teho on '
      || COALESCE(h.it_teho_mw, h.teho_mw)::text
      || ' MW.'
  FROM hankkeet h
  WHERE h.julkaistu
    AND h.generaattori_polttoaineteho_mw IS NOT NULL
    AND COALESCE(h.generaattorit_kaytossa_max_lkm, h.generaattorit_lkm) IS NOT NULL
    AND COALESCE(h.generaattorit_kaytossa_max_lkm, h.generaattorit_lkm) > 0
    AND COALESCE(h.it_teho_mw, h.teho_mw) IS NOT NULL
    AND COALESCE(h.it_teho_mw, h.teho_mw) > 0
    AND p_teho_suhde >= 1
    AND (
      (
        COALESCE(h.generaattorit_kaytossa_max_lkm, h.generaattorit_lkm)
        * h.generaattori_polttoaineteho_mw
      ) / COALESCE(h.it_teho_mw, h.teho_mw) >= p_teho_suhde
      OR COALESCE(h.it_teho_mw, h.teho_mw) / (
        COALESCE(h.generaattorit_kaytossa_max_lkm, h.generaattorit_lkm)
        * h.generaattori_polttoaineteho_mw
      ) >= p_teho_suhde
    );
$$;

CREATE OR REPLACE FUNCTION ristiriita_saanto_koordinaatit_suomi(
  p_lat_min numeric,
  p_lat_max numeric,
  p_lon_min numeric,
  p_lon_max numeric
)
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'koordinaatit_suomi'::text,
    h.id,
    'koordinaatit_suomi:' || h.id::text,
    'Hankkeen «' || h.nimi || '» sijainti on ' || h.sijainti_lat::text || ', '
      || h.sijainti_lon::text
      || '. Vertailualue on lat '
      || p_lat_min::text || '–' || p_lat_max::text
      || ', lon '
      || p_lon_min::text || '–' || p_lon_max::text || '.'
  FROM hankkeet h
  WHERE h.julkaistu
    AND h.sijainti_lat IS NOT NULL
    AND h.sijainti_lon IS NOT NULL
    AND (
      h.sijainti_lat < p_lat_min
      OR h.sijainti_lat > p_lat_max
      OR h.sijainti_lon < p_lon_min
      OR h.sijainti_lon > p_lon_max
    );
$$;

CREATE OR REPLACE FUNCTION ristiriita_saanto_maaraaika_mennyt()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'maaraaika_mennyt'::text,
    m.hanke_id,
    'maaraaika_mennyt:' || m.id::text,
    'Hankkeessa «' || h.nimi || '» määräaika (' || m.tyyppi || ') päättyi '
      || m.paattyy_pvm::text
      || ', määräaika on yhä julkaistu.'
  FROM maaraajat m
  JOIN hankkeet h ON h.id = m.hanke_id
  WHERE m.julkaistu
    AND h.julkaistu
    AND m.paattyy_pvm < CURRENT_DATE;
$$;

CREATE OR REPLACE FUNCTION ristiriita_saanto_lahekkaiset_hankkeet(p_etaisyys_m numeric)
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'lahekkaiset_hankkeet'::text,
    a.id,
    'lahekkaiset_hankkeet:' || a.id::text || ':' || b.id::text,
    'Hankkeen «' || a.nimi || '» sijainti on ' || a.sijainti_lat::text || ', '
      || a.sijainti_lon::text
      || '. Hankkeen «' || b.nimi || '» sijainti on ' || b.sijainti_lat::text
      || ', ' || b.sijainti_lon::text
      || '. Etäisyys on '
      || round(ristiriita_etaisyys_m(a.sijainti_lat, a.sijainti_lon, b.sijainti_lat, b.sijainti_lon))::text
      || ' m.'
  FROM hankkeet a
  JOIN hankkeet b ON a.id < b.id
  WHERE a.julkaistu
    AND b.julkaistu
    AND a.sijainti_lat IS NOT NULL
    AND a.sijainti_lon IS NOT NULL
    AND b.sijainti_lat IS NOT NULL
    AND b.sijainti_lon IS NOT NULL
    AND ristiriita_etaisyys_m(
      a.sijainti_lat, a.sijainti_lon, b.sijainti_lat, b.sijainti_lon
    ) < p_etaisyys_m;
$$;
