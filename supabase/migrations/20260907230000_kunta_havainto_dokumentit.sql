-- Kuntahavainto: hyväksyntä voi julkaista valitut asiakirjat hankkeen alle.

CREATE FUNCTION julkaise_kunta_havainto(
  p_ehdotus_id uuid,
  p_kasittelija text,
  p_hanke_id uuid DEFAULT NULL,
  p_dokumentit_url text[] DEFAULT ARRAY[]::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_kunta jsonb;
  v_dokumentit jsonb;
  v_hanke_id uuid;
  v_asia_url text;
  v_url text;
  v_dok jsonb;
  v_otsikko text;
  v_laji text;
  v_muoto text;
  v_dokumentti_id uuid;
  v_kentat text[];
  v_kentta text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'kunta_havainto'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  v_hanke_id := COALESCE(p_hanke_id, v_ehdotus.hanke_id);
  v_kunta := COALESCE(v_ehdotus.sisalto -> 'kunta', '{}'::jsonb);
  v_dokumentit := COALESCE(v_kunta -> 'dokumentit', '[]'::jsonb);
  v_asia_url := NULLIF(btrim(COALESCE(v_ehdotus.lahde_url, '')), '');

  IF p_dokumentit_url IS NOT NULL AND cardinality(p_dokumentit_url) > 0 THEN
    IF v_hanke_id IS NULL THEN
      RAISE EXCEPTION 'Asiakirjojen julkaisu vaatii hankkeen';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM hankkeet WHERE id = v_hanke_id AND julkaistu
    ) THEN
      RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
    END IF;

    IF v_asia_url IS NULL THEN
      RAISE EXCEPTION 'Kuntahavainnolta puuttuu asiasivun osoite';
    END IF;

    IF jsonb_typeof(v_dokumentit) <> 'array' THEN
      RAISE EXCEPTION 'Kuntahavainnon asiakirjat ovat virheelliset';
    END IF;

    FOREACH v_url IN ARRAY p_dokumentit_url
    LOOP
      v_url := NULLIF(btrim(COALESCE(v_url, '')), '');
      IF v_url IS NULL THEN
        CONTINUE;
      END IF;

      SELECT value INTO v_dok
      FROM jsonb_array_elements(v_dokumentit) AS t(value)
      WHERE t.value ->> 'url' = v_url
      LIMIT 1;
      IF v_dok IS NULL THEN
        RAISE EXCEPTION 'Asiakirjaa ei löydy ehdotuksesta: %', v_url;
      END IF;

      v_otsikko := NULLIF(btrim(COALESCE(v_dok ->> 'otsikko', '')), '');
      v_laji := NULLIF(btrim(COALESCE(v_dok ->> 'laji', '')), '');
      v_muoto := NULLIF(btrim(COALESCE(v_dok ->> 'muoto', '')), '');

      IF v_otsikko IS NULL THEN
        RAISE EXCEPTION 'Asiakirjan otsikko puuttuu: %', v_url;
      END IF;
      IF v_laji IS NULL OR v_laji NOT IN (
        'verkkosivu',
        'kuulutus',
        'yva_ohjelma',
        'yva_selostus',
        'asemakaava',
        'kaavamaaraykset',
        'kartta_aineisto',
        'muu'
      ) THEN
        RAISE EXCEPTION 'Asiakirjan laji puuttuu tai ei ole sallittu: %', v_url;
      END IF;
      IF v_muoto IS NOT NULL AND v_muoto NOT IN ('html', 'pdf', 'wfs', 'muu') THEN
        RAISE EXCEPTION 'Asiakirjan muoto ei ole sallittu: %', v_url;
      END IF;

      SELECT id INTO v_dokumentti_id
      FROM dokumentit
      WHERE url = v_url;

      IF v_dokumentti_id IS NULL THEN
        INSERT INTO dokumentit (
          hanke_id,
          url,
          otsikko,
          laji,
          muoto,
          julkaistu
        )
        VALUES (
          v_hanke_id,
          v_url,
          v_otsikko,
          v_laji,
          v_muoto,
          true
        )
        RETURNING id INTO v_dokumentti_id;
      ELSIF EXISTS (
        SELECT 1
        FROM dokumentit
        WHERE id = v_dokumentti_id
          AND hanke_id IS NOT NULL
          AND hanke_id <> v_hanke_id
      ) THEN
        CONTINUE;
      ELSE
        UPDATE dokumentit
        SET hanke_id = v_hanke_id
        WHERE id = v_dokumentti_id
          AND hanke_id IS NULL;
      END IF;

      v_kentat := ARRAY['otsikko', 'laji'];
      IF v_muoto IS NOT NULL THEN
        v_kentat := v_kentat || 'muoto';
      END IF;

      FOREACH v_kentta IN ARRAY v_kentat
      LOOP
        PERFORM tallenna_kentta_lahde(
          'dokumentit',
          v_dokumentti_id,
          v_kentta,
          v_asia_url,
          NULL,
          CURRENT_DATE,
          'epavarma',
          NULL,
          'ihmisen_vahvistama',
          'html'
        );
      END LOOP;
    END LOOP;
  END IF;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    hanke_id = COALESCE(v_hanke_id, hanke_id)
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$$;

COMMENT ON FUNCTION julkaise_kunta_havainto(uuid, text, uuid, text[]) IS
  'Hyväksyy kuntahavainnon: valinnaisesti julkaisee asiakirjat hankkeen alle. Vain ihmisen hyväksyntä.';

REVOKE ALL ON FUNCTION julkaise_kunta_havainto(uuid, text, uuid, text[])
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_kunta_havainto(uuid, text, uuid, text[]) TO service_role;
