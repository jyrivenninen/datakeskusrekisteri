-- julkaise_paatos: älä luo kaksoisorganisaatiota nimellä — käytä olemassa olevaa apuria.

CREATE OR REPLACE FUNCTION julkaise_paatos(
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
  v_paatos jsonb;
  v_lahteet jsonb;
  v_lahde jsonb;
  v_hanke_id uuid;
  v_paatos_id uuid;
  v_org_id uuid;
  v_org_lahde jsonb;
  v_kuvaus text;
  v_pvm date;
  v_dokumentti_id uuid;
  v_menettely_id uuid;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'paatos'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Paatosehdotukselta puuttuu hanke';
  END IF;

  v_paatos := COALESCE(v_ehdotus.sisalto -> 'paatos', '{}'::jsonb);
  v_lahteet := COALESCE(v_paatos -> 'lahteet', '[]'::jsonb);
  IF jsonb_typeof(v_lahteet) <> 'array' THEN
    RAISE EXCEPTION 'Paatoksen lahteet ovat virheelliset';
  END IF;

  v_kuvaus := NULLIF(btrim(COALESCE(v_paatos ->> 'kuvaus', '')), '');
  v_pvm := NULLIF(v_paatos ->> 'pvm', '')::date;
  v_org_id := NULLIF(v_paatos ->> 'paattava_organisaatio_id', '')::uuid;
  v_dokumentti_id := NULLIF(v_paatos ->> 'dokumentti_id', '')::uuid;
  v_menettely_id := NULLIF(v_paatos ->> 'menettely_id', '')::uuid;
  v_hanke_id := v_ehdotus.hanke_id;

  IF v_kuvaus IS NULL THEN
    RAISE EXCEPTION 'Paatokselta puuttuu kuvaus';
  END IF;
  IF v_pvm IS NULL THEN
    RAISE EXCEPTION 'Paatokselta puuttuu pvm';
  END IF;

  IF v_org_id IS NULL AND NULLIF(v_paatos ->> 'paattava_organisaatio_nimi', '') IS NOT NULL THEN
    SELECT value INTO v_org_lahde
    FROM jsonb_array_elements(v_lahteet) AS t(value)
    WHERE t.value ->> 'kentta' = 'paattava_organisaatio_id'
    LIMIT 1;

    IF v_org_lahde IS NULL THEN
      RAISE EXCEPTION 'Paattavan organisaation nimelta puuttuu lahde';
    END IF;

    v_org_id := kayta_tai_luo_toimija_organisaatio(
      v_paatos ->> 'paattava_organisaatio_nimi',
      'muu',
      v_org_lahde
    );
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Paatokselta puuttuu paattava organisaatio';
  END IF;

  INSERT INTO paatokset (
    hanke_id,
    kuvaus,
    pvm,
    paattava_organisaatio_id,
    dokumentti_id,
    menettely_id,
    julkaistu
  )
  VALUES (
    v_hanke_id,
    v_kuvaus,
    v_pvm,
    v_org_id,
    v_dokumentti_id,
    v_menettely_id,
    true
  )
  RETURNING id INTO v_paatos_id;

  FOR v_lahde IN SELECT value FROM jsonb_array_elements(v_lahteet)
  LOOP
    PERFORM tallenna_kentta_lahde(
      'paatokset',
      v_paatos_id,
      v_lahde ->> 'kentta',
      v_lahde ->> 'lahde_url',
      NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
      (v_lahde ->> 'vahvistettu_pvm')::date,
      v_lahde ->> 'luottamus',
      NULLIF(v_lahde ->> 'lainaus', ''),
      v_lahde ->> 'merkitty',
      vaadi_lahde_laji(v_lahde)
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

  RETURN v_paatos_id;
END;
$$;

COMMENT ON FUNCTION julkaise_paatos(uuid, text) IS
  'Hyväksyy paatos-ehdotuksen. Organisaatio nimellä: kayta_tai_luo_toimija_organisaatio.';
