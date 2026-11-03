-- YTJ-verkkotunnus: ihmisen hyväksyntä tallentaa organisaation verkkotunnuksen lähteineen.
-- Agentti ei kirjoita organisaatiot-tauluun.

CREATE FUNCTION julkaise_organisaation_verkkotunnus(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_org organisaatiot%ROWTYPE;
  v_org_id uuid;
  v_tunnus text;
  v_lainaus text;
  v_url text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'ytj_havainto'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  IF COALESCE(v_ehdotus.sisalto #>> '{ytj,ehdota_tunnus}', 'false') = 'true' THEN
    RAISE EXCEPTION 'Ehdotus sisältää Y-tunnuksen; käytä julkaise_organisaation_y_tunnus';
  END IF;
  IF COALESCE(v_ehdotus.sisalto #>> '{ytj,ehdota_verkkotunnus}', 'false') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Ehdotus ei ole verkkotunnusehdotus';
  END IF;

  v_org_id := NULLIF(v_ehdotus.sisalto #>> '{ytj,organisaatio_id}', '')::uuid;
  v_tunnus := lower(btrim(COALESCE(v_ehdotus.sisalto #>> '{ytj,verkkotunnus_ehdotus}', '')));
  v_url := NULLIF(btrim(COALESCE(v_ehdotus.lahde_url, '')), '');
  v_lainaus := NULLIF(
    btrim(COALESCE(v_ehdotus.sisalto #>> '{ytj,website_ytj}', v_tunnus)),
    ''
  );

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisaatio puuttuu';
  END IF;
  IF v_tunnus !~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$'
     OR v_tunnus ~ '[/:]' THEN
    RAISE EXCEPTION 'Verkkotunnuksen muoto ei kelpaa';
  END IF;
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF v_lainaus IS NULL THEN
    RAISE EXCEPTION 'Lainaus puuttuu';
  END IF;

  SELECT * INTO v_org
  FROM organisaatiot
  WHERE id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisaatiota ei löytynyt';
  END IF;
  IF v_org.verkkotunnus IS NOT NULL AND v_org.verkkotunnus IS DISTINCT FROM v_tunnus THEN
    RAISE EXCEPTION 'Organisaatiolla on jo eri verkkotunnus';
  END IF;

  IF v_org.verkkotunnus IS NULL THEN
    UPDATE organisaatiot
    SET verkkotunnus = v_tunnus
    WHERE id = v_org_id;
  END IF;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot',
    v_org_id,
    'verkkotunnus',
    v_url,
    NULL,
    CURRENT_DATE,
    'vahvistettu',
    v_lainaus,
    'ihmisen_vahvistama',
    'rajapinta'
  );

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
END;
$$;

COMMENT ON FUNCTION julkaise_organisaation_verkkotunnus(uuid, text) IS
  'Hyväksyy YTJ-verkkotunnusehdotuksen ja tallentaa organisaatiot.verkkotunnus-arvon lähteineen. Agentti ei kutsu tätä.';

REVOKE ALL ON FUNCTION julkaise_organisaation_verkkotunnus(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_organisaation_verkkotunnus(uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF has_function_privilege('agentti', 'public.julkaise_organisaation_verkkotunnus(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'agentti EXECUTE yha true';
  END IF;
  IF has_function_privilege('anon', 'public.julkaise_organisaation_verkkotunnus(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon EXECUTE true';
  END IF;
  IF has_function_privilege('authenticated', 'public.julkaise_organisaation_verkkotunnus(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated EXECUTE true';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.julkaise_organisaation_verkkotunnus(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role EXECUTE false';
  END IF;
END $$;
