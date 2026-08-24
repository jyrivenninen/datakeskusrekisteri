-- YTJ-nimihaku: hyväksyntä saa tallentaa organisaation Y-tunnuksen lähteineen.
-- Agentti ei kirjoita organisaatiot-tauluun.

CREATE FUNCTION julkaise_organisaation_y_tunnus(
  p_organisaatio_id uuid,
  p_y_tunnus text,
  p_lahde_url text,
  p_lainaus text,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org organisaatiot%ROWTYPE;
BEGIN
  IF p_y_tunnus IS NULL OR p_y_tunnus !~ '^[0-9]{7}-[0-9]$' THEN
    RAISE EXCEPTION 'Y-tunnuksen muoto ei kelpaa';
  END IF;
  IF NULLIF(btrim(COALESCE(p_lahde_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;

  PERFORM 1
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'ytj_havainto'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  SELECT * INTO v_org
  FROM organisaatiot
  WHERE id = p_organisaatio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organisaatiota ei löytynyt';
  END IF;
  IF v_org.y_tunnus IS NOT NULL THEN
    RAISE EXCEPTION 'Organisaatiolla on jo Y-tunnus';
  END IF;
  IF EXISTS (
    SELECT 1 FROM organisaatiot WHERE y_tunnus = p_y_tunnus
  ) THEN
    RAISE EXCEPTION 'Y-tunnus on jo toisella organisaatiolla';
  END IF;

  UPDATE organisaatiot
  SET y_tunnus = p_y_tunnus
  WHERE id = p_organisaatio_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot',
    p_organisaatio_id,
    'y_tunnus',
    btrim(p_lahde_url),
    NULL,
    CURRENT_DATE,
    'vahvistettu',
    NULLIF(btrim(COALESCE(p_lainaus, '')), ''),
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

REVOKE ALL ON FUNCTION julkaise_organisaation_y_tunnus(
  uuid, text, text, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION julkaise_organisaation_y_tunnus(
  uuid, text, text, text, uuid, text
) TO service_role;
