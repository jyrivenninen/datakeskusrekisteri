-- Estä datakeskusrekisteri.fi (ja alidomainit) lähte-URL:na kaikissa kirjoituksissa.

CREATE OR REPLACE FUNCTION lahde_url_on_kielletty(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_host text;
BEGIN
  IF p_url IS NULL OR btrim(p_url) = '' THEN
    RETURN false;
  END IF;
  BEGIN
    v_host := lower(
      regexp_replace(
        split_part(regexp_replace(btrim(p_url), '^https?://', ''), '/', 1),
        '^www\.',
        ''
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  IF v_host = 'datakeskusrekisteri.fi' OR v_host LIKE '%.datakeskusrekisteri.fi' THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION lahde_url_on_kielletty(text) IS
  'true = oma rekisteri tai muu kielletty lähde-URL; ei saa tallentaa kentta_lahteisiin.';

CREATE OR REPLACE FUNCTION tarkista_muutosehdotus_lahde_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lahde_url IS NOT NULL AND lahde_url_on_kielletty(NEW.lahde_url) THEN
    RAISE EXCEPTION 'Lähde-URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS muutosehdotukset_lahde_url_kielto ON muutosehdotukset;
CREATE TRIGGER muutosehdotukset_lahde_url_kielto
  BEFORE INSERT OR UPDATE OF lahde_url ON muutosehdotukset
  FOR EACH ROW
  EXECUTE FUNCTION tarkista_muutosehdotus_lahde_url();

CREATE OR REPLACE FUNCTION tarkista_dokumentti_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF lahde_url_on_kielletty(NEW.url) THEN
    RAISE EXCEPTION 'Dokumentin URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dokumentit_url_kielto ON dokumentit;
CREATE TRIGGER dokumentit_url_kielto
  BEFORE INSERT OR UPDATE OF url ON dokumentit
  FOR EACH ROW
  EXECUTE FUNCTION tarkista_dokumentti_url();

-- tallenna_kentta_lahde: hylkää kielletty URL
CREATE OR REPLACE FUNCTION tallenna_kentta_lahde(
  p_taulu text,
  p_rivi_id uuid,
  p_kentta text,
  p_lahde_url text,
  p_lahde_sivu integer,
  p_vahvistettu_pvm date,
  p_luottamus text,
  p_lainaus text,
  p_merkitty text,
  p_lahde_laji text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF lahde_url_on_kielletty(p_lahde_url) THEN
    RAISE EXCEPTION 'Lähde-URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
  IF p_lahde_laji NOT IN ('dokumentti', 'rajapinta', 'rss', 'html') THEN
    RAISE EXCEPTION 'lahde_laji puuttuu tai ei ole sallittu';
  END IF;
  INSERT INTO kentta_lahteet (
    taulu, rivi_id, kentta, lahde_url, lahde_sivu, lahde_laji,
    vahvistettu_pvm, luottamus, lainaus, merkitty
  )
  VALUES (
    p_taulu,
    p_rivi_id,
    p_kentta,
    p_lahde_url,
    p_lahde_sivu,
    p_lahde_laji,
    p_vahvistettu_pvm,
    p_luottamus,
    p_lainaus,
    p_merkitty
  )
  ON CONFLICT ON CONSTRAINT kentta_lahteet_sama_lahde_kerran
  DO UPDATE SET
    lahde_sivu = EXCLUDED.lahde_sivu,
    lahde_laji = EXCLUDED.lahde_laji,
    vahvistettu_pvm = EXCLUDED.vahvistettu_pvm,
    luottamus = EXCLUDED.luottamus,
    lainaus = EXCLUDED.lainaus,
    merkitty = EXCLUDED.merkitty;
END;
$$;

-- Grok/selvitys: hyväksynnässä voi päivittää julkaisija ja julkaistu_pvm
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
        'html'
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

REVOKE ALL ON FUNCTION lahde_url_on_kielletty(text) FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION lahde_url_on_kielletty(text) TO service_role;

REVOKE ALL ON FUNCTION tallenna_kentta_lahde(
  text, uuid, text, text, integer, date, text, text, text, text
) FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION tallenna_kentta_lahde(
  text, uuid, text, text, integer, date, text, text, text, text
) TO service_role;
