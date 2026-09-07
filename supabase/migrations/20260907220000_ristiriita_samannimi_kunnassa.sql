-- 7A.3: Sama nimi + kunta → ristiriitahavainto, jotta ylläpito voi yhdistää julkaistut duplikaatit.

CREATE OR REPLACE FUNCTION ristiriita_saanto_samannimi_kunnassa()
RETURNS TABLE (saanto text, hanke_id uuid, avain text, huomautus text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'samannimi_kunnassa'::text,
    a.id,
    'samannimi_kunnassa:' || a.id::text || ':' || b.id::text,
    'Hankkeilla on sama nimi (' || a.nimi || ') ja kunta (' || a.kunta || ').'
      || ' Tunnisteet: ' || a.id::text || ' ja ' || b.id::text || '.'
  FROM hankkeet a
  JOIN hankkeet b ON a.id < b.id
  WHERE a.julkaistu
    AND b.julkaistu
    AND a.yhdistetty_kohde_id IS NULL
    AND b.yhdistetty_kohde_id IS NULL
    AND lower(btrim(a.nimi)) = lower(btrim(b.nimi))
    AND lower(btrim(a.kunta)) = lower(btrim(b.kunta));
$$;

COMMENT ON FUNCTION ristiriita_saanto_samannimi_kunnassa() IS
  'Julkaistut hankkeet joilla sama nimi ja kunta (duplikaattiepäily).';

CREATE OR REPLACE FUNCTION ristiriita_havainnot(
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
  SELECT * FROM ristiriita_saanto_lahekkaiset_hankkeet(p_etaisyys_m)
  UNION ALL
  SELECT * FROM ristiriita_saanto_samannimi_kunnassa();
$$;
