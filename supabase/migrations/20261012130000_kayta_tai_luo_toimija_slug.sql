-- kayta_tai_luo_toimija_organisaatio: slug on NOT NULL organisaatiot-taulussa.
-- Uusi hanke -tuonti kaatui ilman slugia.

CREATE OR REPLACE FUNCTION kayta_tai_luo_toimija_organisaatio(
  p_nimi text,
  p_tyyppi text,
  p_lahde jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_nimi text;
  v_slug text;
  v_lahde_url text;
BEGIN
  v_nimi := btrim(COALESCE(p_nimi, ''));
  IF v_nimi = '' THEN
    RAISE EXCEPTION 'Toimijan nimi on tyhja';
  END IF;
  IF p_tyyppi NOT IN (
    'yritys', 'kunta', 'ely', 'lvv', 'avi', 'ministerio', 'jarjesto', 'muu'
  ) THEN
    RAISE EXCEPTION 'Organisaatiotyyppi ei ole sallittu';
  END IF;

  SELECT id INTO v_id
  FROM organisaatiot
  WHERE julkaistu
    AND lower(btrim(nimi)) = lower(v_nimi)
  ORDER BY luotu_pvm, id
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_lahde_url := btrim(COALESCE(p_lahde ->> 'lahde_url', ''));
  v_slug := johda_organisaatio_slug(v_nimi);
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Slugia ei voitu johtaa nimestä';
  END IF;
  IF EXISTS (SELECT 1 FROM organisaatiot WHERE slug = v_slug) THEN
    v_slug :=
      v_slug || '-' || substr(md5(v_nimi || COALESCE(v_lahde_url, '')), 1, 8);
  END IF;

  BEGIN
    INSERT INTO organisaatiot (nimi, tyyppi, julkaistu, slug)
    VALUES (v_nimi, p_tyyppi, true, v_slug)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id
    FROM organisaatiot
    WHERE julkaistu
      AND lower(btrim(nimi)) = lower(v_nimi)
    ORDER BY luotu_pvm, id
    LIMIT 1;
    IF v_id IS NULL THEN
      RAISE;
    END IF;
    RETURN v_id;
  END;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot',
    v_id,
    'nimi',
    p_lahde ->> 'lahde_url',
    NULLIF(p_lahde ->> 'lahde_sivu', '')::integer,
    (p_lahde ->> 'vahvistettu_pvm')::date,
    p_lahde ->> 'luottamus',
    NULLIF(p_lahde ->> 'lainaus', ''),
    p_lahde ->> 'merkitty',
    vaadi_lahde_laji(p_lahde)
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION kayta_tai_luo_toimija_organisaatio(text, text, jsonb) IS
  'Hakee julkaistun toimijaorganisaation nimellä tai luo uuden (slug pakollinen).';
