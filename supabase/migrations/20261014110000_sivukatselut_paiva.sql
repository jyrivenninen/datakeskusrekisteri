-- Sivukatselut päiväkohtaisena UPSERT-tauluna. Vanha sivukatselut jää raakadataksi.
-- Päiväys Europe/Helsinki. Allowlist: staattiset reitit + /hankkeet/<uuid>[/alipolku] + /kunnat/<slug>.

CREATE TABLE IF NOT EXISTS sivukatselut_paiva (
  polku text NOT NULL,
  paiva date NOT NULL,
  lkm integer NOT NULL DEFAULT 0 CHECK (lkm >= 0),
  PRIMARY KEY (polku, paiva),
  CONSTRAINT sivukatselut_paiva_polku_pituus CHECK (char_length(polku) BETWEEN 1 AND 200)
);

COMMENT ON TABLE sivukatselut_paiva IS
  'Päiväkohtaiset sivulatauslaskurit (Europe/Helsinki). Kirjoitus vain kirjaa_sivukatselu.';

CREATE INDEX IF NOT EXISTS sivukatselut_paiva_paiva_idx
  ON sivukatselut_paiva (paiva DESC);

ALTER TABLE sivukatselut_paiva ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sivukatselut_paiva_yllapito_luku ON sivukatselut_paiva;
CREATE POLICY sivukatselut_paiva_yllapito_luku
ON sivukatselut_paiva
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

REVOKE ALL ON TABLE sivukatselut_paiva FROM anon, authenticated;
GRANT SELECT ON TABLE sivukatselut_paiva TO authenticated;

-- Indeksit (hankkeet.id = PK jo; kunnat.slug jo yksilöllinen)
CREATE INDEX IF NOT EXISTS hankkeet_id_julkaistu_idx
  ON hankkeet (id)
  WHERE julkaistu AND yhdistetty_kohde_id IS NULL;

-- Backfill raakataulusta (Helsinki-päivä)
INSERT INTO sivukatselut_paiva (polku, paiva, lkm)
SELECT
  polku,
  (luotu_pvm AT TIME ZONE 'Europe/Helsinki')::date,
  count(*)::int
FROM sivukatselut
GROUP BY 1, 2
ON CONFLICT (polku, paiva) DO UPDATE
SET lkm = EXCLUDED.lkm;

CREATE OR REPLACE FUNCTION kirjaa_sivukatselu(p_polku text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := NULLIF(btrim(p_polku), '');
  v_paiva date := (now() AT TIME ZONE 'Europe/Helsinki')::date;
  v_hid uuid;
  v_slug text;
BEGIN
  IF v IS NULL OR length(v) > 200 THEN
    RETURN;
  END IF;
  -- estot ennen allowlistia
  IF v ~* '^/(icon|api|yllapito|kirjaudu|_next|opengraph-image)(/|$)' THEN
    RETURN;
  END IF;
  IF v ~* '\.(svg|png|jpe?g|gif|webp|ico|woff2?|css|js|map)$' THEN
    RETURN;
  END IF;

  -- staattiset julkiset reitit
  IF v IN (
    '/',
    '/kartta',
    '/muutokset',
    '/tietoa',
    '/ilmoitus',
    '/maaraajat',
    '/hakemisto',
    '/yhteys',
    '/data',
    '/kunnat',
    '/toimijat',
    '/konsultit',
    '/opas/yva-mielipide',
    '/hankkeet'
  ) THEN
    INSERT INTO sivukatselut_paiva (polku, paiva, lkm)
    VALUES (v, v_paiva, 1)
    ON CONFLICT (polku, paiva) DO UPDATE
    SET lkm = sivukatselut_paiva.lkm + 1;
    -- raakaloki säilyy
    INSERT INTO sivukatselut (polku) VALUES (v);
    RETURN;
  END IF;

  -- /hankkeet/<uuid> ja alipolut olemassa olevalle julkaistulle hankkeelle
  IF v ~ '^/hankkeet/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/json|/asiakirjat|/paivita|/paatos|/kuva)?$' THEN
    v_hid := substring(v from '^/hankkeet/([0-9a-f-]{36})')::uuid;
    IF EXISTS (
      SELECT 1 FROM hankkeet h
      WHERE h.id = v_hid
        AND h.julkaistu
        AND h.yhdistetty_kohde_id IS NULL
    ) THEN
      INSERT INTO sivukatselut_paiva (polku, paiva, lkm)
      VALUES (v, v_paiva, 1)
      ON CONFLICT (polku, paiva) DO UPDATE
      SET lkm = sivukatselut_paiva.lkm + 1;
      INSERT INTO sivukatselut (polku) VALUES (v);
    END IF;
    RETURN;
  END IF;

  -- /kunnat/<slug>
  IF v ~ '^/kunnat/[a-z0-9-]+$' THEN
    v_slug := substring(v from '^/kunnat/([a-z0-9-]+)$');
    IF EXISTS (SELECT 1 FROM kunnat k WHERE k.slug = v_slug) THEN
      INSERT INTO sivukatselut_paiva (polku, paiva, lkm)
      VALUES (v, v_paiva, 1)
      ON CONFLICT (polku, paiva) DO UPDATE
      SET lkm = sivukatselut_paiva.lkm + 1;
      INSERT INTO sivukatselut (polku) VALUES (v);
    END IF;
    RETURN;
  END IF;

  -- /toimijat/<slug> ja /konsultit/<slug> (slug-tarkistus kevyt: muoto)
  IF v ~ '^/toimijat/[a-z0-9-]+$' OR v ~ '^/konsultit/[a-z0-9-]+$' THEN
    INSERT INTO sivukatselut_paiva (polku, paiva, lkm)
    VALUES (v, v_paiva, 1)
    ON CONFLICT (polku, paiva) DO UPDATE
    SET lkm = sivukatselut_paiva.lkm + 1;
    INSERT INTO sivukatselut (polku) VALUES (v);
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION kirjaa_sivukatselu(text) IS
  'UPSERT sivukatselut_paiva + raakarivi sivukatselut. Allowlist; Helsinki-päivä. Ei IP:tä.';

REVOKE ALL ON FUNCTION kirjaa_sivukatselu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kirjaa_sivukatselu(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION sivukatselut_paivittain(p_paivia integer DEFAULT 30)
RETURNS TABLE (paiva date, lkm bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.paiva,
    sum(s.lkm)::bigint AS lkm
  FROM sivukatselut_paiva s
  WHERE onko_yllapitaja()
    AND s.paiva >= ((now() AT TIME ZONE 'Europe/Helsinki')::date
      - greatest(1, least(p_paivia, 366)) + 1)
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION sivukatselut_suosituimmat(
  p_paivia integer DEFAULT 30,
  p_rajat integer DEFAULT 20
)
RETURNS TABLE (polku text, lkm bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.polku,
    sum(s.lkm)::bigint AS lkm
  FROM sivukatselut_paiva s
  WHERE onko_yllapitaja()
    AND s.paiva >= ((now() AT TIME ZONE 'Europe/Helsinki')::date
      - greatest(1, least(p_paivia, 366)) + 1)
  GROUP BY s.polku
  ORDER BY lkm DESC, s.polku
  LIMIT greatest(1, least(p_rajat, 100));
$$;

REVOKE ALL ON FUNCTION sivukatselut_paivittain(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION sivukatselut_suosituimmat(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sivukatselut_paivittain(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION sivukatselut_suosituimmat(integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
