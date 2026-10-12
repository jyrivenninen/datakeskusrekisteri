-- Kuittauksen tapa ja erätunniste kentta_lahteet-riville.

ALTER TABLE kentta_lahteet
  ADD COLUMN IF NOT EXISTS kuittaustapa text,
  ADD COLUMN IF NOT EXISTS eratunniste text;

ALTER TABLE kentta_lahteet
  DROP CONSTRAINT IF EXISTS kentta_lahteet_kuittaustapa_check;

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_kuittaustapa_check CHECK (
    kuittaustapa IS NULL OR kuittaustapa IN ('yksittain', 'era')
  );

COMMENT ON COLUMN kentta_lahteet.kuittaustapa IS
  'Miten ihmisen_vahvistama asetettiin: yksittain (UI/kuittaus) tai era (eräajo).';
COMMENT ON COLUMN kentta_lahteet.eratunniste IS
  'Eräajon tunniste (esim. lahdeselvitys13_era1_vahvistus). Vain kuittaustapa=era.';

-- Aseta kuittaustapa olemassa olevalle lähderiville (hyväksynnän jälkeen).
CREATE OR REPLACE FUNCTION aseta_lahde_kuittaustapa(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text,
  p_lahde_url text,
  p_kuittaustapa text,
  p_eratunniste text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
BEGIN
  IF p_kuittaustapa NOT IN ('yksittain', 'era') THEN
    RAISE EXCEPTION 'kuittaustapa ei ole sallittu';
  END IF;
  IF p_kuittaustapa = 'era'
    AND NULLIF(btrim(COALESCE(p_eratunniste, '')), '') IS NULL THEN
    RAISE EXCEPTION 'eratunniste puuttuu eräkuittaukselta';
  END IF;

  UPDATE kentta_lahteet
  SET
    kuittaustapa = p_kuittaustapa,
    eratunniste = CASE
      WHEN p_kuittaustapa = 'era' THEN btrim(p_eratunniste)
      ELSE NULL
    END
  WHERE taulu = p_taulu
    AND rivi_id = p_rivi_id
    AND kentta = p_kentta
    AND lahde_url = p_lahde_url
    AND merkitty = 'ihmisen_vahvistama'
    AND tila IS DISTINCT FROM 'korvattu';

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION aseta_lahde_kuittaustapa(text, uuid, text, text, text, text) IS
  'Kirjaa kuittaustapa ja erätunniste ihmisen vahvistamalle lähderiville.';

GRANT EXECUTE ON FUNCTION aseta_lahde_kuittaustapa(text, uuid, text, text, text, text)
  TO service_role;

-- Yksittäiskuittaus merkitsee kuittaustapa=yksittain
CREATE OR REPLACE FUNCTION kuitaa_kentta_lahteet(
  p_lahde_idt uuid[],
  p_kasittelija text,
  p_luottamus text DEFAULT 'vahvistettu'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
BEGIN
  IF p_luottamus NOT IN ('vahvistettu', 'epavarma') THEN
    RAISE EXCEPTION 'Kuittauksen luottamus ei ole sallittu';
  END IF;
  IF p_lahde_idt IS NULL OR cardinality(p_lahde_idt) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE kentta_lahteet
  SET
    merkitty = 'ihmisen_vahvistama',
    luottamus = p_luottamus,
    merkitty_pvm = now(),
    kuittaustapa = 'yksittain',
    eratunniste = NULL
  WHERE id = ANY (p_lahde_idt)
    AND merkitty = 'koneen_ehdottama'
    AND tila IS DISTINCT FROM 'korvattu';

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

CREATE OR REPLACE FUNCTION kuitaa_hanke_kentat(
  p_hanke_id uuid,
  p_kentat text[],
  p_kasittelija text,
  p_luottamus text DEFAULT 'vahvistettu'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kentta text;
  v_lkm integer := 0;
  v_rivit integer;
BEGIN
  IF p_luottamus NOT IN ('vahvistettu', 'epavarma') THEN
    RAISE EXCEPTION 'Kuittauksen luottamus ei ole sallittu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = p_hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  FOREACH v_kentta IN ARRAY p_kentat
  LOOP
    UPDATE kentta_lahteet
    SET
      merkitty = 'ihmisen_vahvistama',
      luottamus = p_luottamus,
      merkitty_pvm = now(),
      kuittaustapa = 'yksittain',
      eratunniste = NULL
    WHERE taulu = 'hankkeet'
      AND rivi_id = p_hanke_id
      AND kentta = agentti_lahde_kentta(v_kentta)
      AND merkitty = 'koneen_ehdottama';

    GET DIAGNOSTICS v_rivit = ROW_COUNT;
    v_lkm := v_lkm + v_rivit;
  END LOOP;

  RETURN v_lkm;
END;
$$;

-- Kuiva / kirjoitus: merkitse LS13-eräosumille kuittaustapa=era
CREATE OR REPLACE FUNCTION merkitse_ls13_era_kuittaukset(p_kuiva boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
  v_esimerkit jsonb;
BEGIN
  WITH era AS (
    SELECT m.ehdottaja_tunniste, m.hanke_id, m.lahde_url, k.key AS kentta
    FROM muutosehdotukset m,
    LATERAL jsonb_each(COALESCE(m.sisalto -> 'kentat', '{}'::jsonb)) k
    WHERE m.ehdottaja_tunniste IN (
      'lahdeselvitys13_era1_vahvistus',
      'lahdeselvitys13_era2_vahvistus',
      'lahdeselvitys13_era3_vahvistus'
    )
    AND m.tila = 'hyvaksytty'
  ),
  osumat AS (
    SELECT kl.id, e.ehdottaja_tunniste AS eratunniste, kl.kentta, kl.rivi_id
    FROM kentta_lahteet kl
    JOIN era e
      ON e.hanke_id = kl.rivi_id
     AND e.kentta = kl.kentta
     AND e.lahde_url = kl.lahde_url
    WHERE kl.merkitty = 'ihmisen_vahvistama'
      AND kl.tila IS DISTINCT FROM 'korvattu'
      AND kl.taulu = 'hankkeet'
  )
  SELECT count(*)::integer INTO v_lkm FROM osumat;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_esimerkit
  FROM (
    SELECT o.eratunniste, o.kentta, o.rivi_id, o.id AS lahde_id
    FROM (
      SELECT kl.id, e.ehdottaja_tunniste AS eratunniste, kl.kentta, kl.rivi_id
      FROM kentta_lahteet kl
      JOIN (
        SELECT m.ehdottaja_tunniste, m.hanke_id, m.lahde_url, k.key AS kentta
        FROM muutosehdotukset m,
        LATERAL jsonb_each(COALESCE(m.sisalto -> 'kentat', '{}'::jsonb)) k
        WHERE m.ehdottaja_tunniste IN (
          'lahdeselvitys13_era1_vahvistus',
          'lahdeselvitys13_era2_vahvistus',
          'lahdeselvitys13_era3_vahvistus'
        )
        AND m.tila = 'hyvaksytty'
      ) e
        ON e.hanke_id = kl.rivi_id
       AND e.kentta = kl.kentta
       AND e.lahde_url = kl.lahde_url
      WHERE kl.merkitty = 'ihmisen_vahvistama'
        AND kl.tila IS DISTINCT FROM 'korvattu'
        AND kl.taulu = 'hankkeet'
    ) o
    ORDER BY o.eratunniste, o.kentta
    LIMIT 5
  ) x;

  IF p_kuiva THEN
    RETURN jsonb_build_object(
      'kuiva', true,
      'ls13_era_ihmisen_vahvistama', v_lkm,
      'esimerkit', v_esimerkit
    );
  END IF;

  UPDATE kentta_lahteet kl
  SET
    kuittaustapa = 'era',
    eratunniste = e.ehdottaja_tunniste
  FROM (
    SELECT m.ehdottaja_tunniste, m.hanke_id, m.lahde_url, k.key AS kentta
    FROM muutosehdotukset m,
    LATERAL jsonb_each(COALESCE(m.sisalto -> 'kentat', '{}'::jsonb)) k
    WHERE m.ehdottaja_tunniste IN (
      'lahdeselvitys13_era1_vahvistus',
      'lahdeselvitys13_era2_vahvistus',
      'lahdeselvitys13_era3_vahvistus'
    )
    AND m.tila = 'hyvaksytty'
  ) e
  WHERE kl.taulu = 'hankkeet'
    AND kl.rivi_id = e.hanke_id
    AND kl.kentta = e.kentta
    AND kl.lahde_url = e.lahde_url
    AND kl.merkitty = 'ihmisen_vahvistama'
    AND kl.tila IS DISTINCT FROM 'korvattu';

  GET DIAGNOSTICS v_lkm = ROW_COUNT;

  RETURN jsonb_build_object('kuiva', false, 'paivitetty', v_lkm);
END;
$$;

COMMENT ON FUNCTION merkitse_ls13_era_kuittaukset(boolean) IS
  'Merkitsee LS13-vahvistuserien ihmisen_vahvistama-lähteet kuittaustapa=era. p_kuiva=true vain laskee.';

GRANT EXECUTE ON FUNCTION merkitse_ls13_era_kuittaukset(boolean) TO service_role;
