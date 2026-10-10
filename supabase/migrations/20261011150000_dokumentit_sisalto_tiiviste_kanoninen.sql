-- Sisältötiiviste (tavut) ja kanoninen alias duplikaateille.

ALTER TABLE dokumentit
  ADD COLUMN IF NOT EXISTS sisalto_tiiviste text;

ALTER TABLE dokumentit
  ADD COLUMN IF NOT EXISTS kanoninen_dokumentti_id uuid REFERENCES dokumentit (id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dokumentit_sisalto_tiiviste_sha256'
  ) THEN
    ALTER TABLE dokumentit
      ADD CONSTRAINT dokumentit_sisalto_tiiviste_sha256 CHECK (
        sisalto_tiiviste IS NULL OR sisalto_tiiviste ~ '^[0-9a-f]{64}$'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dokumentit_ei_itselleen_kanoninen'
  ) THEN
    ALTER TABLE dokumentit
      ADD CONSTRAINT dokumentit_ei_itselleen_kanoninen CHECK (
        kanoninen_dokumentti_id IS NULL OR kanoninen_dokumentti_id <> id
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS dokumentit_sisalto_tiiviste_idx
ON dokumentit (sisalto_tiiviste)
WHERE sisalto_tiiviste IS NOT NULL;

COMMENT ON COLUMN dokumentit.sisalto_tiiviste IS
  'SHA-256 alkuperäistiedoston tavuista (ei pelkkä teksti-uute).';
COMMENT ON COLUMN dokumentit.kanoninen_dokumentti_id IS
  'Jos asetettu, tämä URL-alias viittaa samaan sisältöön kuin kanoninen rivi.';

-- Karttaliitteet: otsikko voi olla tyhjä
ALTER TABLE dokumentit DROP CONSTRAINT IF EXISTS dokumentit_otsikko_ei_tyhja;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dokumentit_otsikko_ei_tyhja'
  ) THEN
    ALTER TABLE dokumentit
      ADD CONSTRAINT dokumentit_otsikko_ei_tyhja CHECK (
        laji = 'kartta_aineisto'
        OR char_length(btrim(otsikko)) > 0
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hae_kanoninen_dokumentti_sisalolla(p_tiiviste text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM dokumentit
  WHERE sisalto_tiiviste = p_tiiviste
    AND kanoninen_dokumentti_id IS NULL
  ORDER BY luotu_pvm ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION hae_kanoninen_dokumentti_sisalolla(text) FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION hae_kanoninen_dokumentti_sisalolla(text) TO service_role;

-- Päivitetty kuntahavainnon julkaisu: sisalto_tiiviste + kanoninen, kartta ilman otsikkoa
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

      v_otsikko := COALESCE(v_dok ->> 'otsikko', '');
      v_laji := NULLIF(btrim(COALESCE(v_dok ->> 'laji', '')), '');
      v_muoto := NULLIF(btrim(COALESCE(v_dok ->> 'muoto', '')), '');
      v_sisalto_tiiviste := NULLIF(btrim(COALESCE(v_dok ->> 'sisalto_tiiviste', '')), '');

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
          kanoninen_dokumentti_id
        )
        VALUES (
          v_hanke_id,
          v_url,
          CASE WHEN v_laji = 'kartta_aineisto' THEN COALESCE(v_otsikko, '') ELSE btrim(v_otsikko) END,
          v_laji,
          v_muoto,
          true,
          v_sisalto_tiiviste,
          v_kanoninen_id
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
          sisalto_tiiviste
        )
        VALUES (
          v_hanke_id,
          v_url,
          CASE WHEN v_laji = 'kartta_aineisto' THEN COALESCE(v_otsikko, '') ELSE btrim(v_otsikko) END,
          v_laji,
          v_muoto,
          true,
          v_sisalto_tiiviste
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
          kanoninen_dokumentti_id = COALESCE(kanoninen_dokumentti_id, v_kanoninen_id)
        WHERE id = v_dokumentti_id;
      END IF;

      v_kentat := ARRAY['laji'];
      IF v_laji <> 'kartta_aineisto' OR char_length(btrim(v_otsikko)) > 0 THEN
        v_kentat := array_append(v_kentat, 'otsikko');
      END IF;
      IF v_muoto IS NOT NULL THEN
        v_kentat := array_append(v_kentat, 'muoto');
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
