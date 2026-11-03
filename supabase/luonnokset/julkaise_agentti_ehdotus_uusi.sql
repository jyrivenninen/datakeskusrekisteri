CREATE OR REPLACE FUNCTION public.julkaise_agentti_ehdotus(p_ehdotus_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_hanke hankkeet%ROWTYPE;
  v_kentat jsonb;
  v_jonossa jsonb := '{}'::jsonb;
  v_hanke_pub jsonb := '{}'::jsonb;
  v_lahteet jsonb := '[]'::jsonb;
  v_avain text;
  v_tieto jsonb;
  v_arvo text;
  v_luottamus text;
  v_lahde_kentta text;
  v_hanke_id uuid;
  v_tyyppi text;
  v_uusi_hanke boolean;
  v_julkaistu_lkm integer := 0;
  v_jonossa_lkm integer := 0;
  v_tanaan date := CURRENT_DATE;
  v_sijainti_tieto jsonb;
BEGIN
  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei löytynyt';
  END IF;

  IF v_ehdotus.ehdottaja_tyyppi <> 'agentti' THEN
    RAISE EXCEPTION 'Automaattijulkaisu vain agentin ehdotuksille';
  END IF;

  IF v_ehdotus.tila <> 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotus on jo käsitelty';
  END IF;

  IF v_ehdotus.tyyppi NOT IN ('uusi_hanke', 'taydennys', 'korjaus') THEN
    RAISE EXCEPTION 'Tyyppi % ei kelpaa automaattijulkaisuun', v_ehdotus.tyyppi;
  END IF;

  v_uusi_hanke := v_ehdotus.tyyppi = 'uusi_hanke';
  v_kentat := COALESCE(v_ehdotus.sisalto -> 'kentat', '{}'::jsonb);

  IF v_uusi_hanke THEN
    NULL;
  ELSIF v_ehdotus.hanke_id IS NOT NULL THEN
    SELECT * INTO v_hanke FROM hankkeet WHERE id = v_ehdotus.hanke_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hanketta ei löytynyt';
    END IF;
  ELSE
    RAISE EXCEPTION 'Taydennykselta puuttuu hanke';
  END IF;

  IF v_kentat ? 'sijainti_lat' OR v_kentat ? 'sijainti_lon' OR v_kentat ? 'sijainti_alue_tyyppi' THEN
    v_sijainti_tieto := COALESCE(
      v_kentat -> 'sijainti_lat',
      v_kentat -> 'sijainti_lon',
      v_kentat -> 'sijainti_alue_tyyppi'
    );
    IF agentti_saako_julkaista_kentan(
      v_hanke,
      'sijainti_lat',
      COALESCE(v_kentat -> 'sijainti_lat' ->> 'arvo', v_kentat -> 'sijainti_lon' ->> 'arvo', ''),
      COALESCE(v_sijainti_tieto ->> 'luottamus', 'epavarma'),
      v_uusi_hanke
    ) THEN
      IF v_kentat ? 'sijainti_lat' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object(
          'sijainti_lat', v_kentat -> 'sijainti_lat' ->> 'arvo'
        );
      END IF;
      IF v_kentat ? 'sijainti_lon' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object(
          'sijainti_lon', v_kentat -> 'sijainti_lon' ->> 'arvo'
        );
      END IF;
      IF v_kentat ? 'sijainti_alue_tyyppi' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object(
          'sijainti_alue_tyyppi', v_kentat -> 'sijainti_alue_tyyppi' ->> 'arvo'
        );
      END IF;
      v_luottamus := agentti_kayta_luottamus(v_sijainti_tieto ->> 'luottamus');
      v_lahteet := v_lahteet || jsonb_build_array(
        jsonb_build_object(
          'kentta', 'sijainti',
          'lahde_url', v_sijainti_tieto ->> 'lahde_url',
          'lahde_sivu', v_sijainti_tieto ->> 'lahde_sivu',
          'lahde_laji', COALESCE(v_sijainti_tieto ->> 'lahde_laji', 'html'),
          'vahvistettu_pvm', COALESCE(v_sijainti_tieto ->> 'vahvistettu_pvm', v_tanaan::text),
          'luottamus', v_luottamus,
          'lainaus', COALESCE(v_sijainti_tieto ->> 'lainaus', ''),
          'merkitty', 'koneen_ehdottama'
        )
      );
      v_julkaistu_lkm := v_julkaistu_lkm + 1;
    ELSE
      IF v_kentat ? 'sijainti_lat' THEN
        v_jonossa := v_jonossa || jsonb_build_object('sijainti_lat', v_kentat -> 'sijainti_lat');
      END IF;
      IF v_kentat ? 'sijainti_lon' THEN
        v_jonossa := v_jonossa || jsonb_build_object('sijainti_lon', v_kentat -> 'sijainti_lon');
      END IF;
      IF v_kentat ? 'sijainti_alue_tyyppi' THEN
        v_jonossa := v_jonossa || jsonb_build_object(
          'sijainti_alue_tyyppi', v_kentat -> 'sijainti_alue_tyyppi'
        );
      END IF;
      v_jonossa_lkm := v_jonossa_lkm + 1;
    END IF;
  END IF;

  FOR v_avain, v_tieto IN
    SELECT key, value FROM jsonb_each(v_kentat)
  LOOP
    IF v_avain IN ('sijainti_lat', 'sijainti_lon', 'sijainti_alue_tyyppi') THEN
      CONTINUE;
    END IF;

    v_arvo := v_tieto ->> 'arvo';
    IF agentti_saako_julkaista_kentan(
      v_hanke,
      v_avain,
      v_arvo,
      COALESCE(v_tieto ->> 'luottamus', 'epavarma'),
      v_uusi_hanke
    ) THEN
      IF v_avain = 'toimija_nimi' THEN
        v_hanke_pub := v_hanke_pub || jsonb_build_object('toimija_nimi', v_arvo);
      ELSE
        v_hanke_pub := v_hanke_pub || jsonb_build_object(v_avain, v_arvo);
      END IF;

      v_lahde_kentta := agentti_lahde_kentta(v_avain);
      v_luottamus := agentti_kayta_luottamus(v_tieto ->> 'luottamus');
      v_lahteet := v_lahteet || jsonb_build_array(
        jsonb_build_object(
          'kentta', v_lahde_kentta,
          'lahde_url', v_tieto ->> 'lahde_url',
          'lahde_sivu', v_tieto ->> 'lahde_sivu',
          'lahde_laji', COALESCE(v_tieto ->> 'lahde_laji', 'html'),
          'vahvistettu_pvm', COALESCE(v_tieto ->> 'vahvistettu_pvm', v_tanaan::text),
          'luottamus', v_luottamus,
          'lainaus', COALESCE(v_tieto ->> 'lainaus', ''),
          'merkitty', 'koneen_ehdottama'
        )
      );
      v_julkaistu_lkm := v_julkaistu_lkm + 1;
    ELSE
      v_jonossa := v_jonossa || jsonb_build_object(v_avain, v_tieto);
      v_jonossa_lkm := v_jonossa_lkm + 1;
    END IF;
  END LOOP;

  IF v_uusi_hanke THEN
    IF NOT (
      v_hanke_pub ? 'nimi'
      AND v_hanke_pub ? 'kunta'
      AND v_hanke_pub ? 'vaihe'
    ) THEN
      RETURN jsonb_build_object(
        'hanke_id', NULL,
        'julkaistu_kentat', '[]'::jsonb,
        'jonossa_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_kentat) AS key),
        'tila', 'odottaa',
        'viesti', 'Pakolliset kentät (nimi, kunta, vaihe) vaativat hyväksynnän tai kelvollisen lähteen'
      );
    END IF;
  END IF;

  IF v_julkaistu_lkm = 0 THEN
    RETURN jsonb_build_object(
      'hanke_id', v_ehdotus.hanke_id,
      'julkaistu_kentat', '[]'::jsonb,
      'jonossa_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_jonossa) AS key),
      'tila', 'odottaa',
      'viesti', 'Yksikään kenttä ei kelvanut automaattijulkaisuun'
    );
  END IF;

  v_tyyppi := CASE WHEN v_uusi_hanke THEN 'uusi_hanke' ELSE v_ehdotus.tyyppi END;

  v_hanke_id := julkaise_ehdotetut_tiedot(
    v_tyyppi,
    v_ehdotus.hanke_id,
    v_hanke_pub,
    v_lahteet,
    p_ehdotus_id,
    'agentti:automaattinen',
    '[]'::jsonb,
    false
  );

  IF v_jonossa_lkm = 0 THEN
    UPDATE muutosehdotukset
    SET
      tila = 'hyvaksytty',
      kasitelty_pvm = now(),
      kasittelija = 'agentti:automaattinen',
      hanke_id = v_hanke_id
    WHERE id = p_ehdotus_id;

    RETURN jsonb_build_object(
      'hanke_id', v_hanke_id,
      'julkaistu_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_hanke_pub) AS key),
      'jonossa_kentat', '[]'::jsonb,
      'tila', 'hyvaksytty',
      'viesti', 'Kaikki kentät julkaistu automaattisesti'
    );
  END IF;

  UPDATE muutosehdotukset
  SET
    tyyppi = 'taydennys',
    hanke_id = v_hanke_id,
    sisalto = jsonb_set(
      COALESCE(sisalto, '{}'::jsonb),
      '{kentat}',
      v_jonossa,
      true
    ),
    huomautus = trim(both FROM concat_ws(
      ' ',
      COALESCE(huomautus, ''),
      format('Automaattijulkaistu %s kenttää; loput odottavat hyväksyntää.', v_julkaistu_lkm)
    ))
  WHERE id = p_ehdotus_id;

  RETURN jsonb_build_object(
    'hanke_id', v_hanke_id,
    'julkaistu_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_hanke_pub) AS key),
    'jonossa_kentat', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM jsonb_object_keys(v_jonossa) AS key),
    'tila', 'odottaa',
    'viesti', 'Osittainen automaattijulkaisu'
  );
END;
$function$


REVOKE ALL ON FUNCTION public.julkaise_agentti_ehdotus(uuid)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_agentti_ehdotus(uuid) TO service_role;
