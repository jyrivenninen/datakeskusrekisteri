-- Julkinen tehonäkymä (V2). security_invoker: RLS hankkeet/tehohavainnot kautta.
-- Ajettu tuotantoon 2026-10-13 (MCP apply_migration).

CREATE OR REPLACE VIEW hanke_teho_julkinen
WITH (security_invoker = true) AS
WITH ve AS (
  SELECT
    hv.hanke_id,
    min(COALESCE(hv.it_teho_mw, hv.teho_mw)) AS ve_min,
    max(COALESCE(hv.it_teho_mw, hv.teho_mw)) AS ve_max
  FROM hanke_vaihtoehdot hv
  WHERE hv.tunnus IS DISTINCT FROM 'VE0'
    AND COALESCE(hv.it_teho_mw, hv.teho_mw) IS NOT NULL
  GROUP BY hv.hanke_id
),
hav AS (
  SELECT
    t.hanke_id,
    min(CASE
      WHEN t.kohde = 'koko_hanke' AND t.rajaus = 'vali' THEN t.mw_min
      WHEN t.kohde = 'koko_hanke' AND t.rajaus = 'ylaraja' THEN NULL
      WHEN t.kohde = 'koko_hanke' THEN t.mw
    END) AS koko_min,
    max(CASE
      WHEN t.kohde = 'koko_hanke' AND t.rajaus = 'vali' THEN t.mw_max
      WHEN t.kohde = 'koko_hanke' AND t.rajaus = 'alaraja' THEN t.mw
      WHEN t.kohde = 'koko_hanke' AND t.rajaus = 'ylaraja' THEN t.mw
      WHEN t.kohde = 'koko_hanke' THEN t.mw
    END) AS koko_max,
    bool_or(t.kohde = 'koko_hanke') AS on_koko,
    bool_or(t.kohde = 'koko_hanke' AND t.rajaus IS DISTINCT FROM 'ylaraja') AS on_koko_min,
    min(CASE
      WHEN t.kohde = 'tavoite' AND t.rajaus = 'vali' THEN t.mw_min
      WHEN t.kohde = 'tavoite' AND t.rajaus = 'ylaraja' THEN NULL
      WHEN t.kohde = 'tavoite' THEN t.mw
    END) AS tavoite_min,
    max(CASE
      WHEN t.kohde = 'tavoite' AND t.rajaus = 'vali' THEN t.mw_max
      WHEN t.kohde = 'tavoite' AND t.rajaus = 'alaraja' THEN t.mw
      WHEN t.kohde = 'tavoite' AND t.rajaus = 'ylaraja' THEN t.mw
      WHEN t.kohde = 'tavoite' THEN t.mw
    END) AS tavoite_max,
    bool_or(t.kohde = 'tavoite') AS on_tavoite,
    bool_or(t.kohde = 'tavoite' AND t.rajaus IS DISTINCT FROM 'ylaraja') AS on_tavoite_min,
    min(CASE WHEN t.kohde = 'asennettu' THEN COALESCE(t.mw, t.mw_min) END) AS asennettu_min,
    max(CASE WHEN t.kohde = 'asennettu' THEN COALESCE(t.mw, t.mw_max, t.mw) END) AS asennettu_max,
    bool_or(t.kohde = 'asennettu') AS on_asennettu
  FROM tehohavainnot t
  WHERE t.tila = 'voimassa'
    AND t.kohde IN ('koko_hanke', 'tavoite', 'asennettu')
  GROUP BY t.hanke_id
),
valittu AS (
  SELECT
    h.id AS hanke_id,
    h.nimi,
    h.vaihe,
    CASE
      WHEN h.vaihe = 'peruttu' THEN NULL
      WHEN ve.hanke_id IS NOT NULL THEN ve.ve_min
      WHEN hav.on_koko AND hav.on_koko_min THEN hav.koko_min
      WHEN hav.on_koko THEN NULL
      WHEN hav.on_tavoite AND hav.on_tavoite_min THEN hav.tavoite_min
      WHEN hav.on_tavoite THEN NULL
      WHEN hav.on_asennettu AND h.vaihe = 'toiminnassa' THEN hav.asennettu_min
      WHEN h.it_teho_mw IS NOT NULL THEN h.it_teho_mw
      WHEN h.teho_mw IS NOT NULL THEN h.teho_mw
      WHEN h.teho_erittelematon_mw IS NOT NULL THEN h.teho_erittelematon_mw
      ELSE NULL
    END AS teho_min_mw,
    CASE
      WHEN h.vaihe = 'peruttu' THEN NULL
      WHEN ve.hanke_id IS NOT NULL THEN ve.ve_max
      WHEN hav.on_koko THEN hav.koko_max
      WHEN hav.on_tavoite THEN hav.tavoite_max
      WHEN hav.on_asennettu AND h.vaihe = 'toiminnassa' THEN hav.asennettu_max
      WHEN h.it_teho_mw IS NOT NULL THEN h.it_teho_mw
      WHEN h.teho_mw IS NOT NULL THEN h.teho_mw
      WHEN h.teho_erittelematon_mw IS NOT NULL THEN h.teho_erittelematon_mw
      ELSE NULL
    END AS teho_max_mw,
    CASE
      WHEN h.vaihe = 'peruttu' THEN false
      WHEN ve.hanke_id IS NOT NULL THEN true
      WHEN hav.on_koko THEN true
      WHEN hav.on_tavoite THEN true
      WHEN hav.on_asennettu AND h.vaihe = 'toiminnassa' THEN true
      WHEN h.it_teho_mw IS NOT NULL OR h.teho_mw IS NOT NULL
        OR h.teho_erittelematon_mw IS NOT NULL THEN true
      ELSE false
    END AS mukana_summassa
  FROM hankkeet h
  LEFT JOIN hav ON hav.hanke_id = h.id
  LEFT JOIN ve ON ve.hanke_id = h.id
  WHERE h.julkaistu AND h.yhdistetty_kohde_id IS NULL
)
SELECT
  hanke_id,
  nimi,
  vaihe,
  teho_min_mw,
  teho_max_mw,
  mukana_summassa,
  CASE
    WHEN teho_max_mw IS NULL THEN 'ei_ilmoitettu'
    WHEN teho_max_mw < 50 THEN 'pieni'
    WHEN teho_max_mw <= 200 THEN 'keski'
    ELSE 'suuri'
  END AS kokoluokka_edustaja,
  (vaihe = 'peruttu') AS peruttu
FROM valittu;

COMMENT ON VIEW hanke_teho_julkinen IS
  'Julkinen teho min–max per hanke (V2, VE ensin, ylaraja vain max). Suodatin ei käytä kokoluokka_edustaja.';

GRANT SELECT ON hanke_teho_julkinen TO anon, authenticated, service_role;
