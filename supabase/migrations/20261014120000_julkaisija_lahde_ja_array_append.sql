-- dokumentti_puuttuvat_lahteet: text[] || text on epäselvä Postgres 17:ssä
-- ("malformed array literal"). Vaihdetaan array_appendiin.
-- julkaise_dokumentti_lahde_metatiedot: kirjoita julkaisija-lähde ennen UPDATE.

CREATE OR REPLACE FUNCTION dokumentti_puuttuvat_lahteet(d dokumentit)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('dokumentit', d.id, 'otsikko') THEN
    puuttuvat := array_append(puuttuvat, 'otsikko');
  END IF;
  IF NOT lahde_on_olemassa('dokumentit', d.id, 'laji') THEN
    puuttuvat := array_append(puuttuvat, 'laji');
  END IF;
  IF d.muoto IS NOT NULL AND NOT lahde_on_olemassa('dokumentit', d.id, 'muoto') THEN
    puuttuvat := array_append(puuttuvat, 'muoto');
  END IF;
  IF d.kieli IS NOT NULL AND NOT lahde_on_olemassa('dokumentit', d.id, 'kieli') THEN
    puuttuvat := array_append(puuttuvat, 'kieli');
  END IF;
  IF d.julkaisija IS NOT NULL
    AND NOT lahde_on_olemassa('dokumentit', d.id, 'julkaisija') THEN
    puuttuvat := array_append(puuttuvat, 'julkaisija');
  END IF;
  IF d.julkaistu_pvm IS NOT NULL
    AND NOT lahde_on_olemassa('dokumentit', d.id, 'julkaistu_pvm') THEN
    puuttuvat := array_append(puuttuvat, 'julkaistu_pvm');
  END IF;
  IF d.tunnus IS NOT NULL AND NOT lahde_on_olemassa('dokumentit', d.id, 'tunnus') THEN
    puuttuvat := array_append(puuttuvat, 'tunnus');
  END IF;
  IF d.sivumaara IS NOT NULL
    AND NOT lahde_on_olemassa('dokumentit', d.id, 'sivumaara') THEN
    puuttuvat := array_append(puuttuvat, 'sivumaara');
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION julkaise_dokumentti_lahde_metatiedot(
  p_dokumentti_id uuid,
  p_lahde_tyyppi text,
  p_sitovuustaso text,
  p_otsikko text,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dok dokumentit%ROWTYPE;
  v_otsikko text;
  v_meta jsonb;
  v_julkaisija text;
  v_julkaistu_pvm date;
  v_lahde_laji text;
BEGIN
  IF p_lahde_tyyppi NOT IN (
    'paatos',
    'viranomaisasiakirja',
    'rekisteri',
    'hankkeen_oma',
    'media',
    'menetelma',
    'muu'
  ) THEN
    RAISE EXCEPTION 'lahde_tyyppi ei ole sallittu';
  END IF;
  IF p_sitovuustaso NOT IN ('sitova', 'virallinen', 'epavirallinen') THEN
    RAISE EXCEPTION 'sitovuustaso ei ole sallittu';
  END IF;

  SELECT * INTO v_dok
  FROM dokumentit
  WHERE id = p_dokumentti_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumenttia ei löytynyt';
  END IF;

  IF p_ehdotus_id IS NOT NULL THEN
    PERFORM 1
    FROM muutosehdotukset
    WHERE id = p_ehdotus_id
      AND tila = 'odottaa'
      AND tyyppi = 'lahde_tyyppi_havainto'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
    END IF;
    SELECT sisalto -> 'lahde_metatiedot' INTO v_meta
    FROM muutosehdotukset
    WHERE id = p_ehdotus_id;
  END IF;

  v_otsikko := NULLIF(btrim(COALESCE(p_otsikko, '')), '');
  IF v_otsikko IS NULL AND v_meta IS NOT NULL THEN
    v_otsikko := NULLIF(btrim(COALESCE(v_meta ->> 'ehdotettu_otsikko', '')), '');
  END IF;

  v_julkaisija := NULLIF(btrim(COALESCE(v_meta ->> 'ehdotettu_julkaisija', '')), '');
  IF v_meta ? 'ehdotettu_julkaistu_pvm' AND btrim(COALESCE(v_meta ->> 'ehdotettu_julkaistu_pvm', '')) <> '' THEN
    v_julkaistu_pvm := (v_meta ->> 'ehdotettu_julkaistu_pvm')::date;
  END IF;

  v_lahde_laji := CASE
    WHEN v_dok.muoto = 'pdf' THEN 'dokumentti'
    ELSE 'html'
  END;

  -- Lähde ennen UPDATE (trg_dokumentit_lahteet on DEFERRABLE)
  IF v_julkaisija IS NOT NULL THEN
    PERFORM tallenna_kentta_lahde(
      'dokumentit',
      p_dokumentti_id,
      'julkaisija',
      v_dok.url,
      NULL,
      CURRENT_DATE,
      'epavarma',
      v_julkaisija,
      'ihmisen_vahvistama',
      v_lahde_laji
    );
  END IF;

  UPDATE dokumentit
  SET
    lahde_tyyppi = p_lahde_tyyppi,
    sitovuustaso = p_sitovuustaso,
    otsikko = CASE
      WHEN v_otsikko IS NOT NULL AND v_otsikko <> url THEN v_otsikko
      ELSE otsikko
    END,
    otsikko_automaattinen = CASE
      WHEN v_otsikko IS NOT NULL AND v_otsikko <> url THEN false
      ELSE otsikko_automaattinen
    END,
    julkaisija = COALESCE(v_julkaisija, julkaisija),
    julkaistu_pvm = COALESCE(v_julkaistu_pvm, julkaistu_pvm),
    lahde_metatiedot_kasitelty_pvm = CURRENT_DATE
  WHERE id = p_dokumentti_id;

  IF v_otsikko IS NOT NULL AND v_otsikko <> v_dok.url THEN
    PERFORM tallenna_kentta_lahde(
      'dokumentit',
      p_dokumentti_id,
      'otsikko',
      v_dok.url,
      NULL,
      CURRENT_DATE,
      'vahvistettu',
      v_otsikko,
      'ihmisen_vahvistama',
      COALESCE(
        (
          SELECT kl.lahde_laji
          FROM kentta_lahteet kl
          WHERE kl.taulu = 'dokumentit'
            AND kl.rivi_id = p_dokumentti_id
            AND kl.kentta = 'otsikko'
          LIMIT 1
        ),
        v_lahde_laji
      )
    );
  END IF;

  IF p_ehdotus_id IS NOT NULL THEN
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
  END IF;
END;
$$;
