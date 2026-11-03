-- Erikoissijoitusrahasto ei ole yritys. Tyyppi asetetaan vain tämän funktion kautta.

ALTER TABLE organisaatiot
  DROP CONSTRAINT organisaatiot_tyyppi_tarkistus;

ALTER TABLE organisaatiot
  ADD CONSTRAINT organisaatiot_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'yritys',
      'kunta',
      'ely',
      'lvv',
      'avi',
      'ministerio',
      'jarjesto',
      'rahasto',
      'muu'
    )
  );

CREATE FUNCTION aseta_organisaation_tyyppi(
  p_organisaatio_id uuid,
  p_tyyppi text,
  p_lahde_url text,
  p_lainaus text,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tyyppi text;
  v_url text;
  v_lainaus text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  v_tyyppi := btrim(COALESCE(p_tyyppi, ''));
  v_url := btrim(COALESCE(p_lahde_url, ''));
  v_lainaus := btrim(COALESCE(p_lainaus, ''));

  IF v_tyyppi NOT IN (
    'yritys', 'kunta', 'ely', 'lvv', 'avi', 'ministerio', 'jarjesto', 'rahasto', 'muu'
  ) THEN
    RAISE EXCEPTION 'Organisaatiotyyppi ei ole sallittu: %', v_tyyppi;
  END IF;
  IF v_url !~ '^https?://' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF v_lainaus = '' THEN
    RAISE EXCEPTION 'Lainaus puuttuu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organisaatiot WHERE id = p_organisaatio_id) THEN
    RAISE EXCEPTION 'Organisaatiota ei löytynyt';
  END IF;

  UPDATE organisaatiot
  SET tyyppi = v_tyyppi
  WHERE id = p_organisaatio_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot',
    p_organisaatio_id,
    'tyyppi',
    v_url,
    NULL,
    CURRENT_DATE,
    'vahvistettu',
    v_lainaus,
    'ihmisen_vahvistama',
    'html'
  );
END;
$$;

COMMENT ON FUNCTION aseta_organisaation_tyyppi(uuid, text, text, text, text) IS
  'Asettaa organisaation tyypin ja lähteen. Agentti ei kutsu tätä.';

REVOKE ALL ON FUNCTION aseta_organisaation_tyyppi(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION aseta_organisaation_tyyppi(uuid, text, text, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF has_function_privilege('agentti', 'public.aseta_organisaation_tyyppi(uuid, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.aseta_organisaation_tyyppi(uuid, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.aseta_organisaation_tyyppi(uuid, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'aseta_organisaation_tyyppi: odottamaton suoritusoikeus';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.aseta_organisaation_tyyppi(uuid, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role EXECUTE false';
  END IF;
END $$;
