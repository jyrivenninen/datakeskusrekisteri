-- Hyväksyttyjen hankemuutosten loki. Rivi syntyy, kun julkaistu hanketieto
-- muuttuu. Siihen ei kirjoiteta vapaata tekstiä eikä ehdotusjonoa.

CREATE TABLE julkaistut_muutokset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  kentta text NOT NULL,
  uusi_arvo text,
  hyvaksytty_pvm timestamptz NOT NULL,
  lahde_url text,
  lahde_otsikko text,
  ehdotus_id uuid REFERENCES muutosehdotukset (id) ON DELETE SET NULL,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT julkaistut_muutokset_kentta_pituus CHECK (
    char_length(btrim(kentta)) > 0 AND char_length(kentta) <= 80
  )
);

CREATE INDEX julkaistut_muutokset_aika_idx
  ON julkaistut_muutokset (hyvaksytty_pvm DESC, id DESC);

CREATE INDEX julkaistut_muutokset_hanke_idx
  ON julkaistut_muutokset (hanke_id);

CREATE UNIQUE INDEX julkaistut_muutokset_ehdotus_kentta_idx
  ON julkaistut_muutokset (ehdotus_id, kentta)
  WHERE ehdotus_id IS NOT NULL;

COMMENT ON TABLE julkaistut_muutokset IS
  'Julkaistun hanketiedon hyväksytyt muutokset. Kenttä uusi_hanke tarkoittaa hankkeen julkaisua. Ei ehdotusjonoa eikä vapaata tekstiä.';

CREATE OR REPLACE FUNCTION julkaistu_muutos_numero(n numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN n IS NULL THEN NULL
    WHEN position('.' IN n::text) = 0 THEN n::text
    ELSE rtrim(rtrim(n::text, '0'), '.')
  END;
$$;

CREATE OR REPLACE FUNCTION julkaistu_muutos_lahde(
  p_hanke_id uuid,
  p_kentta text,
  p_ehdotus_id uuid
)
RETURNS TABLE (lahde_url text, lahde_otsikko text)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(l.lahde_url, e.lahde_url) AS lahde_url,
         d.otsikko AS lahde_otsikko
  FROM (SELECT 1) AS _
  LEFT JOIN LATERAL (
    SELECT kl.lahde_url, kl.dokumentti_id
    FROM kentta_lahteet kl
    WHERE kl.taulu = 'hankkeet'
      AND kl.rivi_id = p_hanke_id
      AND kl.kentta = CASE
        WHEN p_kentta = 'uusi_hanke' THEN 'nimi'
        ELSE p_kentta
      END
    ORDER BY kl.merkitty_pvm DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN muutosehdotukset e ON e.id = p_ehdotus_id
  LEFT JOIN LATERAL (
    SELECT dok.otsikko
    FROM dokumentit dok
    WHERE dok.julkaistu
      AND (
        dok.id = l.dokumentti_id
        OR dok.url = COALESCE(l.lahde_url, e.lahde_url)
      )
    ORDER BY (dok.id = l.dokumentti_id) DESC, dok.paivitetty_pvm DESC
    LIMIT 1
  ) d ON true;
$$;

CREATE OR REPLACE FUNCTION kirjaa_julkaistu_muutos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  muutos record;
  v_ehdotus uuid;
  v_lahde_url text;
  v_lahde_otsikko text;
BEGIN
  IF NEW.yhdistetty_kohde_id IS NOT NULL OR NOT NEW.julkaistu THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NOT OLD.julkaistu) THEN
    SELECT e.id INTO v_ehdotus
    FROM muutosehdotukset e
    WHERE e.hanke_id = NEW.id
      AND e.tila = 'hyvaksytty'
      AND e.tyyppi = 'uusi_hanke'
      AND e.kasitelty_pvm >= transaction_timestamp() - interval '5 minutes'
    ORDER BY e.kasitelty_pvm DESC
    LIMIT 1;

    SELECT lahde_url, lahde_otsikko
    INTO v_lahde_url, v_lahde_otsikko
    FROM julkaistu_muutos_lahde(NEW.id, 'uusi_hanke', v_ehdotus);

    INSERT INTO julkaistut_muutokset (
      hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
    )
    VALUES (
      NEW.id, 'uusi_hanke', NEW.nimi, transaction_timestamp(),
      v_lahde_url, v_lahde_otsikko, v_ehdotus
    )
    ON CONFLICT (ehdotus_id, kentta) WHERE ehdotus_id IS NOT NULL DO NOTHING;

    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  FOR muutos IN
    SELECT kentta, arvo
    FROM (
      SELECT
        'nimi'::text AS kentta,
        NULLIF(btrim(NEW.nimi), '') AS arvo,
        NULLIF(btrim(OLD.nimi), '') IS DISTINCT FROM NULLIF(btrim(NEW.nimi), '') AS muuttui
      UNION ALL SELECT 'kunta', NULLIF(btrim(NEW.kunta), ''),
        NULLIF(btrim(OLD.kunta), '') IS DISTINCT FROM NULLIF(btrim(NEW.kunta), '')
      UNION ALL SELECT 'maakunta', NULLIF(btrim(NEW.maakunta), ''),
        NULLIF(btrim(OLD.maakunta), '') IS DISTINCT FROM NULLIF(btrim(NEW.maakunta), '')
      UNION ALL SELECT 'vaihe', NEW.vaihe,
        OLD.vaihe IS DISTINCT FROM NEW.vaihe
      UNION ALL SELECT 'yva_diaarinumero', NULLIF(btrim(NEW.yva_diaarinumero), ''),
        NULLIF(btrim(OLD.yva_diaarinumero), '') IS DISTINCT FROM NULLIF(btrim(NEW.yva_diaarinumero), '')
      UNION ALL SELECT 'kaavatunnus', NULLIF(btrim(NEW.kaavatunnus), ''),
        NULLIF(btrim(OLD.kaavatunnus), '') IS DISTINCT FROM NULLIF(btrim(NEW.kaavatunnus), '')
      UNION ALL SELECT 'kortteli', NULLIF(btrim(NEW.kortteli), ''),
        NULLIF(btrim(OLD.kortteli), '') IS DISTINCT FROM NULLIF(btrim(NEW.kortteli), '')
      UNION ALL SELECT 'sijainti_alue_tyyppi', NULLIF(btrim(NEW.sijainti_alue_tyyppi), ''),
        NULLIF(btrim(OLD.sijainti_alue_tyyppi), '') IS DISTINCT FROM NULLIF(btrim(NEW.sijainti_alue_tyyppi), '')
      UNION ALL SELECT 'it_teho_mw', julkaistu_muutos_numero(NEW.it_teho_mw),
        OLD.it_teho_mw IS DISTINCT FROM NEW.it_teho_mw
      UNION ALL SELECT 'teho_mw', julkaistu_muutos_numero(NEW.teho_mw),
        OLD.teho_mw IS DISTINCT FROM NEW.teho_mw
      UNION ALL SELECT 'pinta_ala_ha', julkaistu_muutos_numero(NEW.pinta_ala_ha),
        OLD.pinta_ala_ha IS DISTINCT FROM NEW.pinta_ala_ha
      UNION ALL SELECT 'sahkonkaytto_twh_a', julkaistu_muutos_numero(NEW.sahkonkaytto_twh_a),
        OLD.sahkonkaytto_twh_a IS DISTINCT FROM NEW.sahkonkaytto_twh_a
      UNION ALL SELECT 'generaattori_polttoaineteho_mw', julkaistu_muutos_numero(NEW.generaattori_polttoaineteho_mw),
        OLD.generaattori_polttoaineteho_mw IS DISTINCT FROM NEW.generaattori_polttoaineteho_mw
      UNION ALL SELECT 'generaattorit_lkm', NEW.generaattorit_lkm::text,
        OLD.generaattorit_lkm IS DISTINCT FROM NEW.generaattorit_lkm
      UNION ALL SELECT 'generaattorit_kaytossa_max_lkm', NEW.generaattorit_kaytossa_max_lkm::text,
        OLD.generaattorit_kaytossa_max_lkm IS DISTINCT FROM NEW.generaattorit_kaytossa_max_lkm
      UNION ALL SELECT 'sijainti_lat', julkaistu_muutos_numero(NEW.sijainti_lat),
        OLD.sijainti_lat IS DISTINCT FROM NEW.sijainti_lat
      UNION ALL SELECT 'sijainti_lon', julkaistu_muutos_numero(NEW.sijainti_lon),
        OLD.sijainti_lon IS DISTINCT FROM NEW.sijainti_lon
      UNION ALL SELECT 'toimija_organisaatio_id',
        (SELECT o.nimi FROM organisaatiot o WHERE o.id = NEW.toimija_organisaatio_id),
        OLD.toimija_organisaatio_id IS DISTINCT FROM NEW.toimija_organisaatio_id
    ) ero
    WHERE ero.muuttui
  LOOP
    SELECT e.id INTO v_ehdotus
    FROM muutosehdotukset e
    WHERE e.hanke_id = NEW.id
      AND e.tila = 'hyvaksytty'
      AND e.kasitelty_pvm >= transaction_timestamp() - interval '5 minutes'
      AND (
        (
          e.tyyppi IN ('taydennys', 'korjaus')
          AND (
            jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), muutos.kentta)
            OR (
              muutos.kentta = 'toimija_organisaatio_id'
              AND jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), 'toimija_nimi')
            )
          )
        )
        OR (
          e.tyyppi = 'kentta_tyhjennys'
          AND COALESCE(e.sisalto #>> '{tyhjennys,kentta}', '') IN (muutos.kentta, 'toimija_nimi')
        )
      )
    ORDER BY e.kasitelty_pvm DESC
    LIMIT 1;

    SELECT l.lahde_url, l.lahde_otsikko
    INTO v_lahde_url, v_lahde_otsikko
    FROM julkaistu_muutos_lahde(NEW.id, muutos.kentta, v_ehdotus) AS l;

    IF v_lahde_url IS NULL AND v_ehdotus IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF(e.sisalto #>> ARRAY['kentat', muutos.kentta, 'lahde_url'], ''),
        NULLIF(e.sisalto #>> '{kentat,toimija_nimi,lahde_url}', ''),
        NULLIF(e.sisalto #>> '{tyhjennys,lahde_url}', ''),
        e.lahde_url
      )
      INTO v_lahde_url
      FROM muutosehdotukset e
      WHERE e.id = v_ehdotus;

      SELECT dok.otsikko INTO v_lahde_otsikko
      FROM dokumentit dok
      WHERE dok.julkaistu AND dok.url = v_lahde_url
      LIMIT 1;
    END IF;

    INSERT INTO julkaistut_muutokset (
      hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
    )
    VALUES (
      NEW.id,
      muutos.kentta,
      muutos.arvo,
      transaction_timestamp(),
      v_lahde_url,
      v_lahde_otsikko,
      v_ehdotus
    )
    ON CONFLICT (ehdotus_id, kentta) WHERE ehdotus_id IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kirjaa_julkaistu_muutos ON hankkeet;

CREATE CONSTRAINT TRIGGER trg_kirjaa_julkaistu_muutos
AFTER INSERT OR UPDATE ON hankkeet
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION kirjaa_julkaistu_muutos();

REVOKE ALL ON FUNCTION julkaistu_muutos_numero(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION julkaistu_muutos_lahde(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION kirjaa_julkaistu_muutos() FROM PUBLIC;

ALTER TABLE julkaistut_muutokset ENABLE ROW LEVEL SECURITY;

CREATE POLICY julkaistut_muutokset_julkinen_luku
ON julkaistut_muutokset
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM hankkeet h
    WHERE h.id = julkaistut_muutokset.hanke_id
      AND h.julkaistu
      AND h.yhdistetty_kohde_id IS NULL
  )
);

REVOKE ALL ON julkaistut_muutokset FROM PUBLIC, anon, authenticated, agentti;
GRANT SELECT ON julkaistut_muutokset TO anon, authenticated;

-- Historia hyväksytyistä ehdotuksista. Kenttätarkistus, havainto ja linkki
-- eivät muuta julkaistua hanketietoa, joten ne jätetään pois.

INSERT INTO julkaistut_muutokset (
  hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
)
SELECT
  e.hanke_id,
  'uusi_hanke',
  h.nimi,
  e.kasitelty_pvm,
  COALESCE(
    NULLIF(e.lahde_url, ''),
    NULLIF(e.sisalto #>> '{kentat,nimi,lahde_url}', '')
  ),
  d.otsikko,
  e.id
FROM muutosehdotukset e
JOIN hankkeet h
  ON h.id = e.hanke_id
 AND h.julkaistu
 AND h.yhdistetty_kohde_id IS NULL
LEFT JOIN dokumentit d
  ON d.url = COALESCE(
    NULLIF(e.lahde_url, ''),
    NULLIF(e.sisalto #>> '{kentat,nimi,lahde_url}', '')
  )
 AND d.julkaistu
WHERE e.tila = 'hyvaksytty'
  AND e.tyyppi = 'uusi_hanke'
  AND e.kasitelty_pvm IS NOT NULL;

INSERT INTO julkaistut_muutokset (
  hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
)
SELECT
  e.hanke_id,
  CASE WHEN k.avain = 'toimija_nimi' THEN 'toimija_organisaatio_id' ELSE k.avain END,
  CASE
    WHEN k.avain IN ('toimija_organisaatio_id')
      AND k.arvo ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN COALESCE((SELECT o.nimi FROM organisaatiot o WHERE o.id = k.arvo::uuid), NULLIF(btrim(k.arvo), ''))
    WHEN k.avain = 'toimija_nimi' THEN NULLIF(btrim(k.arvo), '')
    ELSE NULLIF(btrim(k.arvo), '')
  END,
  e.kasitelty_pvm,
  COALESCE(NULLIF(k.lahde_url, ''), NULLIF(e.lahde_url, '')),
  d.otsikko,
  e.id
FROM muutosehdotukset e
JOIN hankkeet h
  ON h.id = e.hanke_id
 AND h.julkaistu
 AND h.yhdistetty_kohde_id IS NULL
CROSS JOIN LATERAL (
  SELECT jsonb_object_keys(COALESCE(e.sisalto->'kentat', '{}'::jsonb)) AS avain
) avaimet
CROSS JOIN LATERAL (
  SELECT
    avaimet.avain,
    e.sisalto #>> ARRAY['kentat', avaimet.avain, 'arvo'] AS arvo,
    e.sisalto #>> ARRAY['kentat', avaimet.avain, 'lahde_url'] AS lahde_url
) k
JOIN (
  VALUES
    ('nimi'),
    ('kunta'),
    ('maakunta'),
    ('vaihe'),
    ('toimija_organisaatio_id'),
    ('toimija_nimi'),
    ('yva_diaarinumero'),
    ('it_teho_mw'),
    ('teho_mw'),
    ('pinta_ala_ha'),
    ('sahkonkaytto_twh_a'),
    ('generaattorit_lkm'),
    ('generaattorit_kaytossa_max_lkm'),
    ('generaattori_polttoaineteho_mw'),
    ('kaavatunnus'),
    ('kortteli'),
    ('sijainti_lat'),
    ('sijainti_lon'),
    ('sijainti_alue_tyyppi')
) AS sallitut (kentta) ON sallitut.kentta = k.avain
LEFT JOIN dokumentit d
  ON d.url = COALESCE(NULLIF(k.lahde_url, ''), NULLIF(e.lahde_url, ''))
 AND d.julkaistu
WHERE e.tila = 'hyvaksytty'
  AND e.tyyppi IN ('taydennys', 'korjaus')
  AND e.kasitelty_pvm IS NOT NULL
  AND NOT (
    k.avain = 'toimija_nimi'
    AND jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), 'toimija_organisaatio_id')
  );

INSERT INTO julkaistut_muutokset (
  hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
)
SELECT
  e.hanke_id,
  CASE
    WHEN e.sisalto #>> '{tyhjennys,kentta}' = 'toimija_nimi' THEN 'toimija_organisaatio_id'
    ELSE e.sisalto #>> '{tyhjennys,kentta}'
  END,
  NULL,
  e.kasitelty_pvm,
  COALESCE(
    NULLIF(e.sisalto #>> '{tyhjennys,lahde_url}', ''),
    NULLIF(e.lahde_url, '')
  ),
  d.otsikko,
  e.id
FROM muutosehdotukset e
JOIN hankkeet h
  ON h.id = e.hanke_id
 AND h.julkaistu
 AND h.yhdistetty_kohde_id IS NULL
LEFT JOIN dokumentit d
  ON d.url = COALESCE(
    NULLIF(e.sisalto #>> '{tyhjennys,lahde_url}', ''),
    NULLIF(e.lahde_url, '')
  )
 AND d.julkaistu
WHERE e.tila = 'hyvaksytty'
  AND e.tyyppi = 'kentta_tyhjennys'
  AND e.kasitelty_pvm IS NOT NULL
  AND COALESCE(e.sisalto #>> '{tyhjennys,kentta}', '') IN (
    'nimi',
    'kunta',
    'maakunta',
    'vaihe',
    'toimija_organisaatio_id',
    'toimija_nimi',
    'yva_diaarinumero',
    'it_teho_mw',
    'teho_mw',
    'pinta_ala_ha',
    'sahkonkaytto_twh_a',
    'generaattorit_lkm',
    'generaattorit_kaytossa_max_lkm',
    'generaattori_polttoaineteho_mw',
    'kaavatunnus',
    'kortteli',
    'sijainti_lat',
    'sijainti_lon',
    'sijainti_alue_tyyppi'
  );
