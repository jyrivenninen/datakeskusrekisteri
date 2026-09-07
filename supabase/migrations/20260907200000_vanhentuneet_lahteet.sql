-- 7A.4: vanhentuneet kenttälähteet ja tarkistukset (ylläpito + agentti).

CREATE OR REPLACE FUNCTION vanhentuneet_kentat(p_kuukautta integer DEFAULT 6)
RETURNS TABLE (
  laji text,
  hanke_id uuid,
  hanke_nimi text,
  kentta text,
  vahvistettu_pvm date,
  lahde_url text,
  luottamus text,
  merkitty text,
  huomautus text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    'lahde'::text,
    h.id,
    h.nimi,
    kl.kentta,
    kl.vahvistettu_pvm,
    kl.lahde_url,
    kl.luottamus,
    kl.merkitty,
    NULL::text
  FROM kentta_lahteet kl
  JOIN hankkeet h ON kl.taulu = 'hankkeet' AND kl.rivi_id = h.id
  WHERE h.julkaistu
    AND h.yhdistetty_kohde_id IS NULL
    AND kl.vahvistettu_pvm < (CURRENT_DATE - make_interval(months => p_kuukautta))::date

  UNION ALL

  SELECT
    'tarkistus'::text,
    h.id,
    h.nimi,
    kt.kentta,
    kt.vahvistettu_pvm,
    NULL::text,
    NULL::text,
    kt.merkitty,
    kt.huomautus
  FROM kentta_tarkistukset kt
  JOIN hankkeet h ON kt.taulu = 'hankkeet' AND kt.rivi_id = h.id
  WHERE h.julkaistu
    AND h.yhdistetty_kohde_id IS NULL
    AND kt.vahvistettu_pvm < (CURRENT_DATE - make_interval(months => p_kuukautta))::date

  ORDER BY 5 ASC, 3 ASC;
$$;

COMMENT ON FUNCTION vanhentuneet_kentat(integer) IS
  'Julkaistujen hankkeiden kentät, joiden lähde- tai tarkistuspäivä on yli p_kuukautta vanha. 7A.4.';

REVOKE ALL ON FUNCTION vanhentuneet_kentat(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION vanhentuneet_kentat(integer) TO service_role;
