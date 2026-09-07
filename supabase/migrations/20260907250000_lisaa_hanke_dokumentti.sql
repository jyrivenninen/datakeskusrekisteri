-- Lisää yksittäisen asiakirjan hankkeelle (ihmisen/korjausskriptin käyttö).

CREATE FUNCTION lisaa_hanke_dokumentti(
  p_hanke_id uuid,
  p_url text,
  p_otsikko text,
  p_laji text,
  p_muoto text DEFAULT NULL,
  p_lahde_url text DEFAULT NULL,
  p_kasittelija text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dokumentti_id uuid;
  v_kentat text[];
  v_kentta text;
  v_lahde_url text;
BEGIN
  IF p_hanke_id IS NULL THEN
    RAISE EXCEPTION 'Hanke puuttuu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hankkeet WHERE id = p_hanke_id AND julkaistu) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  p_url := NULLIF(btrim(COALESCE(p_url, '')), '');
  p_otsikko := NULLIF(btrim(COALESCE(p_otsikko, '')), '');
  p_laji := NULLIF(btrim(COALESCE(p_laji, '')), '');
  p_muoto := NULLIF(btrim(COALESCE(p_muoto, '')), '');
  v_lahde_url := NULLIF(btrim(COALESCE(p_lahde_url, '')), '');

  IF p_url IS NULL OR p_otsikko IS NULL OR p_laji IS NULL THEN
    RAISE EXCEPTION 'Asiakirjan url, otsikko ja laji vaaditaan';
  END IF;
  IF p_laji NOT IN (
    'verkkosivu', 'kuulutus', 'yva_ohjelma', 'yva_selostus',
    'asemakaava', 'kaavamaaraykset', 'kartta_aineisto', 'muu'
  ) THEN
    RAISE EXCEPTION 'Asiakirjan laji ei ole sallittu';
  END IF;
  IF p_muoto IS NOT NULL AND p_muoto NOT IN ('html', 'pdf', 'wfs', 'muu') THEN
    RAISE EXCEPTION 'Asiakirjan muoto ei ole sallittu';
  END IF;

  SELECT id INTO v_dokumentti_id FROM dokumentit WHERE url = p_url;

  IF v_dokumentti_id IS NULL THEN
    INSERT INTO dokumentit (hanke_id, url, otsikko, laji, muoto, julkaistu)
    VALUES (p_hanke_id, p_url, p_otsikko, p_laji, p_muoto, true)
    RETURNING id INTO v_dokumentti_id;
  ELSIF EXISTS (
    SELECT 1 FROM dokumentit
    WHERE id = v_dokumentti_id
      AND hanke_id IS NOT NULL
      AND hanke_id <> p_hanke_id
  ) THEN
    RAISE EXCEPTION 'Asiakirja on jo toisen hankkeen alla';
  ELSE
    UPDATE dokumentit
    SET hanke_id = p_hanke_id
    WHERE id = v_dokumentti_id AND hanke_id IS NULL;
  END IF;

  IF v_lahde_url IS NOT NULL THEN
    v_kentat := ARRAY['otsikko', 'laji'];
    IF p_muoto IS NOT NULL THEN
      v_kentat := array_append(v_kentat, 'muoto');
    END IF;
    FOREACH v_kentta IN ARRAY v_kentat
    LOOP
      PERFORM tallenna_kentta_lahde(
        'dokumentit',
        v_dokumentti_id,
        v_kentta,
        v_lahde_url,
        NULL,
        CURRENT_DATE,
        'epavarma',
        NULL,
        'ihmisen_vahvistama',
        'html'
      );
    END LOOP;
  END IF;

  RETURN v_dokumentti_id;
END;
$$;

COMMENT ON FUNCTION lisaa_hanke_dokumentti(uuid, text, text, text, text, text, text) IS
  'Luo tai linkittää asiakirjan hankkeelle lähteineen. Korjaus- ja ylläpitokäyttö.';

REVOKE ALL ON FUNCTION lisaa_hanke_dokumentti(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION lisaa_hanke_dokumentti(uuid, text, text, text, text, text, text) TO service_role;
