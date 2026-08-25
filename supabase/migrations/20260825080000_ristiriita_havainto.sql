-- 7A.3 ristiriitahavainnot SQL:llä. Uusi sääntö = yksi funktio + rivi unioniin.
-- Ei julkaise hanketietoa.

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
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto'
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
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto'
    )
  );

CREATE FUNCTION ristiriita_etaisyys_m(
  p_lat1 numeric,
  p_lon1 numeric,
  p_lat2 numeric,
  p_lon2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT 6371000 * acos(
    least(
      1::float8,
      greatest(
        -1::float8,
        cos(radians(p_lat1::float8)) * cos(radians(p_lat2::float8))
          * cos(radians(p_lon2::float8 - p_lon1::float8))
        + sin(radians(p_lat1::float8)) * sin(radians(p_lat2::float8))
      )
    )
  )::numeric;
$$;

CREATE FUNCTION ristiriita_saanto_ytunnus_nimet()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'ytunnus_nimet'::text,
    NULL::uuid,
    'ytunnus_nimet:' || o.y_tunnus,
    'Y-tunnuksella ' || o.y_tunnus || ' organisaation nimi on '
      || string_agg(DISTINCT o.nimi, '; ' ORDER BY o.nimi) || '.'
  FROM organisaatiot o
  WHERE o.julkaistu
    AND o.y_tunnus IS NOT NULL
  GROUP BY o.y_tunnus
  HAVING count(DISTINCT lower(btrim(o.nimi))) > 1;
$$;

CREATE FUNCTION ristiriita_saanto_nimi_ytunnukset()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'nimi_ytunnukset'::text,
    NULL::uuid,
    'nimi_ytunnukset:' || lower(btrim(o.nimi)),
    'Organisaation nimi on ' || min(o.nimi) || ', Y-tunnukset ovat '
      || string_agg(DISTINCT o.y_tunnus, '; ' ORDER BY o.y_tunnus) || '.'
  FROM organisaatiot o
  WHERE o.julkaistu
    AND o.y_tunnus IS NOT NULL
  GROUP BY lower(btrim(o.nimi))
  HAVING count(DISTINCT o.y_tunnus) > 1;
$$;

CREATE FUNCTION ristiriita_saanto_rekisterointi_ennen_hanketta()
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
    'Hankkeen määräajan päättymispäivä on ' || hpvm.hanke_pvm::text
      || ', toimijan YTJ-rekisteröintipäivä on ' || rek.rek_pvm::text || '.'
  FROM hpvm
  JOIN hankkeet h ON h.id = hpvm.id
  JOIN rek ON rek.org_id = h.toimija_organisaatio_id
  WHERE hpvm.hanke_pvm IS NOT NULL
    AND hpvm.hanke_pvm < rek.rek_pvm;
$$;

CREATE FUNCTION ristiriita_saanto_teho_suhde(p_teho_suhde numeric)
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'teho_suhde'::text,
    h.id,
    'teho_suhde:' || h.id::text,
    'Generaattorien polttoaineteho × lukumäärä on '
      || (COALESCE(h.generaattorit_kaytossa_max_lkm, h.generaattorit_lkm)
          * h.generaattori_polttoaineteho_mw)::text
      || ' MW, hankkeen ilmoitettu teho on '
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

CREATE FUNCTION ristiriita_saanto_koordinaatit_suomi(
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
    'Hankkeen sijainti on ' || h.sijainti_lat::text || ', '
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

CREATE FUNCTION ristiriita_saanto_maaraaika_mennyt()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'maaraaika_mennyt'::text,
    m.hanke_id,
    'maaraaika_mennyt:' || m.id::text,
    'Määräaika päättyi ' || m.paattyy_pvm::text
      || ', määräaika on yhä julkaistu.'
  FROM maaraajat m
  JOIN hankkeet h ON h.id = m.hanke_id
  WHERE m.julkaistu
    AND h.julkaistu
    AND m.paattyy_pvm < CURRENT_DATE;
$$;

CREATE FUNCTION ristiriita_saanto_lahekkaiset_hankkeet(p_etaisyys_m numeric)
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'lahekkaiset_hankkeet'::text,
    a.id,
    'lahekkaiset_hankkeet:' || a.id::text || ':' || b.id::text,
    'Hankkeen sijainti on ' || a.sijainti_lat::text || ', ' || a.sijainti_lon::text
      || ', toisen hankkeen sijainti on ' || b.sijainti_lat::text || ', '
      || b.sijainti_lon::text
      || ', etäisyys on '
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

CREATE FUNCTION ristiriita_havainnot(
  p_teho_suhde numeric DEFAULT 3,
  p_etaisyys_m numeric DEFAULT 500,
  p_lat_min numeric DEFAULT 59.3,
  p_lat_max numeric DEFAULT 70.2,
  p_lon_min numeric DEFAULT 19.0,
  p_lon_max numeric DEFAULT 31.6
)
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT * FROM ristiriita_saanto_ytunnus_nimet()
  UNION ALL
  SELECT * FROM ristiriita_saanto_nimi_ytunnukset()
  UNION ALL
  SELECT * FROM ristiriita_saanto_rekisterointi_ennen_hanketta()
  UNION ALL
  SELECT * FROM ristiriita_saanto_teho_suhde(p_teho_suhde)
  UNION ALL
  SELECT * FROM ristiriita_saanto_koordinaatit_suomi(
    p_lat_min, p_lat_max, p_lon_min, p_lon_max
  )
  UNION ALL
  SELECT * FROM ristiriita_saanto_maaraaika_mennyt()
  UNION ALL
  SELECT * FROM ristiriita_saanto_lahekkaiset_hankkeet(p_etaisyys_m);
$$;

REVOKE ALL ON FUNCTION ristiriita_etaisyys_m(numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_ytunnus_nimet()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_nimi_ytunnukset()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_rekisterointi_ennen_hanketta()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_teho_suhde(numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_koordinaatit_suomi(numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_maaraaika_mennyt()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_saanto_lahekkaiset_hankkeet(numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ristiriita_havainnot(numeric, numeric, numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION ristiriita_etaisyys_m(numeric, numeric, numeric, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_ytunnus_nimet() TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_nimi_ytunnukset() TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_rekisterointi_ennen_hanketta() TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_teho_suhde(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_koordinaatit_suomi(numeric, numeric, numeric, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_maaraaika_mennyt() TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_saanto_lahekkaiset_hankkeet(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION ristiriita_havainnot(numeric, numeric, numeric, numeric, numeric, numeric)
  TO service_role;
