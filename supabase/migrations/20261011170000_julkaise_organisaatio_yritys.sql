-- Julkaistu yritys YTJ-tunnuksella: agentit/skriptit eivät INSERT organisaatiot-tauluun suoraan.

CREATE OR REPLACE FUNCTION julkaise_organisaatio_yritys(
  p_nimi text,
  p_y_tunnus text,
  p_lahde_url text,
  p_vahvistettu_pvm date,
  p_lainaus text DEFAULT NULL,
  p_merkitty text DEFAULT 'ihmisen_vahvistama',
  p_ytj_lahde_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_nimi text;
  v_yt text;
  v_lahde text;
  v_ytj_lahde text;
BEGIN
  v_nimi := btrim(COALESCE(p_nimi, ''));
  v_yt := btrim(COALESCE(p_y_tunnus, ''));
  v_lahde := btrim(COALESCE(p_lahde_url, ''));
  v_ytj_lahde := btrim(COALESCE(p_ytj_lahde_url, ''));

  IF v_nimi = '' THEN
    RAISE EXCEPTION 'Organisaation nimi puuttuu';
  END IF;
  IF v_yt !~ '^[0-9]{7}-[0-9]$' THEN
    RAISE EXCEPTION 'Y-tunnuksen muoto ei kelpaa';
  END IF;
  IF v_lahde = '' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF p_vahvistettu_pvm IS NULL THEN
    RAISE EXCEPTION 'vahvistettu_pvm puuttuu';
  END IF;
  IF v_ytj_lahde = '' THEN
    v_ytj_lahde := 'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=' || v_yt;
  END IF;

  SELECT id INTO v_id FROM organisaatiot WHERE y_tunnus = v_yt LIMIT 1 FOR UPDATE;
  IF v_id IS NOT NULL THEN
    UPDATE organisaatiot SET julkaistu = true WHERE id = v_id AND NOT julkaistu;
    RETURN v_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM organisaatiot
    WHERE julkaistu AND lower(btrim(nimi)) = lower(v_nimi) AND y_tunnus IS DISTINCT FROM v_yt
  ) THEN
    RAISE EXCEPTION 'Julkaistu toiminimi on jo toisella Y-tunnuksella';
  END IF;

  INSERT INTO organisaatiot (nimi, tyyppi, y_tunnus, julkaistu)
  VALUES (v_nimi, 'yritys', v_yt, true)
  RETURNING id INTO v_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot', v_id, 'nimi', v_lahde, NULL, p_vahvistettu_pvm,
    'vahvistettu', NULLIF(btrim(COALESCE(p_lainaus, '')), ''), p_merkitty, 'dokumentti'
  );
  PERFORM tallenna_kentta_lahde(
    'organisaatiot', v_id, 'y_tunnus', v_ytj_lahde, NULL, p_vahvistettu_pvm,
    'vahvistettu', NULL, p_merkitty, 'rajapinta'
  );

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION julkaise_organisaatio_yritys IS
  'Luo tai palauttaa julkaistun yritysorganisaation Y-tunnuksella. Käytä skripteissä, ei suoraa INSERT.';

REVOKE ALL ON FUNCTION julkaise_organisaatio_yritys(
  text, text, text, date, text, text, text
) FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_organisaatio_yritys(
  text, text, text, date, text, text, text
) TO service_role;
