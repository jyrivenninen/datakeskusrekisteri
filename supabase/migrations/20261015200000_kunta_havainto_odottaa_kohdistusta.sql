-- julkaise_kunta_havainto: hyväksy myös odottaa_kohdistusta-tilassa olevat.

CREATE OR REPLACE FUNCTION julkaise_kunta_havainto(
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
  v_sisalto_tiiviste text;
  v_lahde_tyyppi text;
  v_sitovuustaso text;
  v_julkaisija text;
  v_julkaistu_pvm date;
  v_dokumentti_id uuid;
  v_kanoninen_id uuid;
  v_kentat text[];
  v_kentta text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila IN ('odottaa', 'odottaa_kohdistusta')
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

      v_otsikko := COALESCE(v_dok ->> 'otsikko', '');
      v_laji := NULLIF(btrim(COALESCE(v_dok ->> 'laji', '')), '');
      v_muoto := NULLIF(btrim(COALESCE(v_dok ->> 'muoto', '')), '');
      v_sisalto_tiiviste := NULLIF(btrim(COALESCE(v_dok ->> 'sisalto_tiiviste', '')), '');

      v_lahde_tyyppi := NULLIF(btrim(COALESCE(
        v_dok ->> 'lahde_tyyppi',
        v_kunta ->> 'grok_lahde_tyyppi',
        ''
      )), '');
      IF v_lahde_tyyppi IS NULL THEN
        v_lahde_tyyppi := 'muu';
      ELSIF v_lahde_tyyppi NOT IN (
        'paatos',
        'viranomaisasiakirja',
        'rekisteri',
        'hankkeen_oma',
        'media',
        'menetelma',
        'muu'
      ) THEN
        RAISE EXCEPTION 'Asiakirjan lahde_tyyppi ei ole sallittu: % (%)', v_url, v_lahde_tyyppi;
      END IF;

      v_sitovuustaso := NULLIF(btrim(COALESCE(v_dok ->> 'sitovuustaso', '')), '');
      IF v_sitovuustaso IS NULL THEN
        v_sitovuustaso := CASE v_lahde_tyyppi
          WHEN 'paatos' THEN 'sitova'
          WHEN 'viranomaisasiakirja' THEN 'virallinen'
          WHEN 'rekisteri' THEN 'virallinen'
          ELSE 'epavirallinen'
        END;
      ELSIF v_sitovuustaso NOT IN ('sitova', 'virallinen', 'epavirallinen') THEN
        RAISE EXCEPTION 'Asiakirjan sitovuustaso ei ole sallittu: %', v_url;
      END IF;

      v_julkaisija := NULLIF(btrim(COALESCE(
        v_dok ->> 'julkaisija',
        v_kunta ->> 'grok_julkaisija',
        ''
      )), '');

      v_julkaistu_pvm := NULL;
      BEGIN
        IF NULLIF(btrim(COALESCE(
          v_dok ->> 'julkaistu_pvm',
          v_kunta ->> 'grok_julkaistu_pvm',
          ''
        )), '') IS NOT NULL THEN
          v_julkaistu_pvm := NULLIF(btrim(COALESCE(
            v_dok ->> 'julkaistu_pvm',
            v_kunta ->> 'grok_julkaistu_pvm',
            ''
          )), '')::date;
        END IF;
      EXCEPTION
        WHEN invalid_datetime_format OR datetime_field_overflow THEN
          v_julkaistu_pvm := NULL;
      END;

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

      IF v_laji <> 'kartta_aineisto' AND char_length(btrim(v_otsikko)) = 0 THEN
        RAISE EXCEPTION 'Asiakirjan otsikko puuttuu: %', v_url;
      END IF;

      IF v_muoto IS NOT NULL AND v_muoto NOT IN ('html', 'pdf', 'wfs', 'muu') THEN
        RAISE EXCEPTION 'Asiakirjan muoto ei ole sallittu: %', v_url;
      END IF;

      v_kanoninen_id := NULL;
      IF v_sisalto_tiiviste IS NOT NULL THEN
        v_kanoninen_id := hae_kanoninen_dokumentti_sisalolla(v_sisalto_tiiviste);
      END IF;

      SELECT id INTO v_dokumentti_id FROM dokumentit WHERE url = v_url;

      IF v_kanoninen_id IS NOT NULL AND v_dokumentti_id IS NULL THEN
        INSERT INTO dokumentit (
          hanke_id,
          url,
          otsikko,
          laji,
          muoto,
          julkaistu,
          sisalto_tiiviste,
          kanoninen_dokumentti_id,
          lahde_tyyppi,
          sitovuustaso,
          julkaisija,
          julkaistu_pvm
        )
        VALUES (
          v_hanke_id,
          v_url,
          CASE WHEN v_laji = 'kartta_aineisto' THEN COALESCE(v_otsikko, '') ELSE btrim(v_otsikko) END,
          v_laji,
          v_muoto,
          true,
          v_sisalto_tiiviste,
          v_kanoninen_id,
          v_lahde_tyyppi,
          v_sitovuustaso,
          v_julkaisija,
          v_julkaistu_pvm
        )
        RETURNING id INTO v_dokumentti_id;
      ELSIF v_dokumentti_id IS NULL THEN
        INSERT INTO dokumentit (
          hanke_id,
          url,
          otsikko,
          laji,
          muoto,
          julkaistu,
          sisalto_tiiviste,
          lahde_tyyppi,
          sitovuustaso,
          julkaisija,
          julkaistu_pvm
        )
        VALUES (
          v_hanke_id,
          v_url,
          CASE WHEN v_laji = 'kartta_aineisto' THEN COALESCE(v_otsikko, '') ELSE btrim(v_otsikko) END,
          v_laji,
          v_muoto,
          true,
          v_sisalto_tiiviste,
          v_lahde_tyyppi,
          v_sitovuustaso,
          v_julkaisija,
          v_julkaistu_pvm
        )
        RETURNING id INTO v_dokumentti_id;
      ELSIF EXISTS (
        SELECT 1 FROM dokumentit
        WHERE id = v_dokumentti_id
          AND hanke_id IS NOT NULL
          AND hanke_id <> v_hanke_id
      ) THEN
        CONTINUE;
      ELSE
        UPDATE dokumentit
        SET
          hanke_id = COALESCE(hanke_id, v_hanke_id),
          sisalto_tiiviste = COALESCE(sisalto_tiiviste, v_sisalto_tiiviste),
          kanoninen_dokumentti_id = COALESCE(kanoninen_dokumentti_id, v_kanoninen_id),
          lahde_tyyppi = CASE
            WHEN lahde_tyyppi = 'muu' AND v_lahde_tyyppi IS DISTINCT FROM 'muu'
              THEN v_lahde_tyyppi
            ELSE lahde_tyyppi
          END,
          sitovuustaso = CASE
            WHEN lahde_tyyppi = 'muu' AND v_lahde_tyyppi IS DISTINCT FROM 'muu'
              THEN v_sitovuustaso
            ELSE sitovuustaso
          END,
          julkaisija = COALESCE(julkaisija, v_julkaisija),
          julkaistu_pvm = COALESCE(julkaistu_pvm, v_julkaistu_pvm)
        WHERE id = v_dokumentti_id;
      END IF;

      v_kentat := ARRAY['laji'];
      IF v_laji <> 'kartta_aineisto' OR char_length(btrim(v_otsikko)) > 0 THEN
        v_kentat := array_append(v_kentat, 'otsikko');
      END IF;
      IF v_muoto IS NOT NULL THEN
        v_kentat := array_append(v_kentat, 'muoto');
      END IF;
      -- trg_dokumentit_lahteet on DEFERRABLE: lähde riville ennen transactionin loppua.
      IF v_julkaisija IS NOT NULL THEN
        v_kentat := array_append(v_kentat, 'julkaisija');
      END IF;
      IF v_julkaistu_pvm IS NOT NULL THEN
        v_kentat := array_append(v_kentat, 'julkaistu_pvm');
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
    AND tila IN ('odottaa', 'odottaa_kohdistusta');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$$;

