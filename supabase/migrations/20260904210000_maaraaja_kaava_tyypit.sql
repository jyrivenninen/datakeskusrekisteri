-- Kaavamenettelyn vaikuttamismääräajat: OAS ja kaavaluonnos (erillään kaavamuistutuksesta).

ALTER TABLE maaraajat
  DROP CONSTRAINT maaraajat_tyyppi_tarkistus;

ALTER TABLE maaraajat
  ADD CONSTRAINT maaraajat_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'yva_mielipide',
      'yva_ohjelma',
      'yva_selostus',
      'kaavamuistutus',
      'kaava_oas',
      'kaava_luonnos',
      'valitusaika',
      'kuulutus',
      'muu'
    )
  );

COMMENT ON CONSTRAINT maaraajat_tyyppi_tarkistus ON maaraajat IS
  'Vaikuttamisen määräajan tyyppi. kaava_oas = OAS-lausuntokierros; kaava_luonnos = asemakaavaluonnos tms. luonnosvaiheen lausuntokierros.';

CREATE OR REPLACE FUNCTION julkaise_maaraaja(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_maaraaja jsonb;
  v_lahteet jsonb;
  v_lahde jsonb;
  v_hanke_id uuid;
  v_maaraaja_id uuid;
  v_tyyppi text;
  v_alkaa_pvm date;
  v_paattyy_pvm date;
  v_menettely_id uuid;
  v_kentta text;
  v_puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'maaraaja'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Maaraajaehdotukselta puuttuu hanke';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_ehdotus.hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  v_maaraaja := COALESCE(v_ehdotus.sisalto -> 'maaraaja', '{}'::jsonb);
  v_lahteet := COALESCE(v_maaraaja -> 'lahteet', '[]'::jsonb);
  IF jsonb_typeof(v_lahteet) <> 'array' THEN
    RAISE EXCEPTION 'Maaraajan lahteet ovat virheelliset';
  END IF;

  v_tyyppi := NULLIF(btrim(COALESCE(v_maaraaja ->> 'tyyppi', '')), '');
  v_alkaa_pvm := NULLIF(v_maaraaja ->> 'alkaa_pvm', '')::date;
  v_paattyy_pvm := NULLIF(v_maaraaja ->> 'paattyy_pvm', '')::date;
  v_menettely_id := NULLIF(v_maaraaja ->> 'menettely_id', '')::uuid;
  v_hanke_id := v_ehdotus.hanke_id;

  IF v_tyyppi IS NULL OR v_tyyppi NOT IN (
    'yva_mielipide',
    'yva_ohjelma',
    'yva_selostus',
    'kaavamuistutus',
    'kaava_oas',
    'kaava_luonnos',
    'valitusaika',
    'kuulutus',
    'muu'
  ) THEN
    RAISE EXCEPTION 'Maaraajan tyyppi puuttuu tai ei ole sallittu';
  END IF;

  IF v_paattyy_pvm IS NULL THEN
    RAISE EXCEPTION 'Maaraajalta puuttuu paattyy_pvm';
  END IF;

  IF v_alkaa_pvm IS NOT NULL AND v_alkaa_pvm > v_paattyy_pvm THEN
    RAISE EXCEPTION 'Maaraajan alku on myöhemmin kuin loppu';
  END IF;

  IF v_menettely_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM hanke_menettelyt
    WHERE id = v_menettely_id
      AND hanke_id = v_hanke_id
  ) THEN
    RAISE EXCEPTION 'Menettely ei kuulu hankkeeseen';
  END IF;

  v_puuttuvat := ARRAY['tyyppi', 'paattyy_pvm'];
  IF v_alkaa_pvm IS NOT NULL THEN
    v_puuttuvat := v_puuttuvat || 'alkaa_pvm';
  END IF;

  FOREACH v_kentta IN ARRAY v_puuttuvat
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_lahteet) AS t(value)
      WHERE t.value ->> 'kentta' = v_kentta
    ) THEN
      RAISE EXCEPTION 'Maaraajan lahde puuttuu kentälle %', v_kentta;
    END IF;
  END LOOP;

  INSERT INTO maaraajat (
    hanke_id,
    menettely_id,
    tyyppi,
    alkaa_pvm,
    paattyy_pvm,
    julkaistu
  )
  VALUES (
    v_hanke_id,
    v_menettely_id,
    v_tyyppi,
    v_alkaa_pvm,
    v_paattyy_pvm,
    true
  )
  RETURNING id INTO v_maaraaja_id;

  FOR v_lahde IN SELECT value FROM jsonb_array_elements(v_lahteet)
  LOOP
    PERFORM tallenna_kentta_lahde(
      'maaraajat',
      v_maaraaja_id,
      v_lahde ->> 'kentta',
      v_lahde ->> 'lahde_url',
      NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
      COALESCE(
        NULLIF(v_lahde ->> 'vahvistettu_pvm', '')::date,
        CURRENT_DATE
      ),
      COALESCE(
        NULLIF(btrim(COALESCE(v_lahde ->> 'luottamus', '')), ''),
        'epavarma'
      ),
      NULLIF(v_lahde ->> 'lainaus', ''),
      COALESCE(
        NULLIF(btrim(COALESCE(v_lahde ->> 'merkitty', '')), ''),
        'ihmisen_vahvistama'
      ),
      paatos_lahde_laji(v_lahde)
    );
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;

  RETURN v_maaraaja_id;
END;
$$;
