-- Y-tunnuksellisille: maa=FI, rekisterinumero=Y-tunnus, rekisteriviranomainen=RA000188.
-- Lähde YTJ/PRH (avoindata.prh.fi). Ilman Y-tunnusta maa jätetään tyhjäksi.
-- GLEIF-poikkeuskoodit: ei julkiseen näyttöön (kommentti).

COMMENT ON COLUMN organisaatiot.gleif_suora_emo_poikkeus IS
  'GLEIF direct parent reporting exception reason (esim. NATURAL_PERSONS). '
  'Ei julkiselle sivulle eikä avoimeen dataan; julkinen teksti: '
  '"ei emoyhtiötietoa GLEIF:ssä".';

COMMENT ON COLUMN organisaatiot.gleif_ylin_emo_poikkeus IS
  'GLEIF ultimate parent reporting exception reason. '
  'Ei julkiselle sivulle eikä avoimeen dataan; julkinen teksti: '
  '"ei emoyhtiötietoa GLEIF:ssä".';

CREATE OR REPLACE FUNCTION taydenna_organisaatio_maa_ytunnuksellisille(
  p_kuiva boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pvm date := CURRENT_DATE;
  v_lkm integer := 0;
  v_paivitetty integer := 0;
  v_esimerkit jsonb := '[]'::jsonb;
  r RECORD;
BEGIN
  SELECT count(*)::integer INTO v_lkm
  FROM organisaatiot
  WHERE julkaistu
    AND y_tunnus ~ '^[0-9]{7}-[0-9]$'
    AND (
      maa IS DISTINCT FROM 'FI'
      OR rekisteriviranomainen IS DISTINCT FROM 'RA000188'
      OR rekisterinumero IS DISTINCT FROM y_tunnus
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.nimi), '[]'::jsonb)
  INTO v_esimerkit
  FROM (
    SELECT id, nimi, y_tunnus, maa, rekisterinumero, rekisteriviranomainen
    FROM organisaatiot
    WHERE julkaistu
      AND y_tunnus ~ '^[0-9]{7}-[0-9]$'
      AND (
        maa IS DISTINCT FROM 'FI'
        OR rekisteriviranomainen IS DISTINCT FROM 'RA000188'
        OR rekisterinumero IS DISTINCT FROM y_tunnus
      )
    ORDER BY nimi
    LIMIT 3
  ) x;

  IF p_kuiva THEN
    RETURN jsonb_build_object(
      'kuiva', true,
      'lkm', v_lkm,
      'esimerkit', v_esimerkit
    );
  END IF;

  FOR r IN
    SELECT id, y_tunnus
    FROM organisaatiot
    WHERE julkaistu
      AND y_tunnus ~ '^[0-9]{7}-[0-9]$'
      AND (
        maa IS DISTINCT FROM 'FI'
        OR rekisteriviranomainen IS DISTINCT FROM 'RA000188'
        OR rekisterinumero IS DISTINCT FROM y_tunnus
      )
    FOR UPDATE
  LOOP
    UPDATE organisaatiot
    SET
      maa = 'FI',
      rekisterinumero = r.y_tunnus,
      rekisteriviranomainen = 'RA000188'
    WHERE id = r.id;

    PERFORM tallenna_kentta_lahde(
      'organisaatiot', r.id, 'maa',
      'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=' || r.y_tunnus,
      NULL, v_pvm, 'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
    );
    PERFORM tallenna_kentta_lahde(
      'organisaatiot', r.id, 'rekisterinumero',
      'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=' || r.y_tunnus,
      NULL, v_pvm, 'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
    );
    PERFORM tallenna_kentta_lahde(
      'organisaatiot', r.id, 'rekisteriviranomainen',
      'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=' || r.y_tunnus,
      NULL, v_pvm, 'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
    );

    v_paivitetty := v_paivitetty + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'kuiva', false,
    'lkm', v_lkm,
    'paivitetty', v_paivitetty,
    'esimerkit', v_esimerkit
  );
END;
$$;

COMMENT ON FUNCTION taydenna_organisaatio_maa_ytunnuksellisille(boolean) IS
  'Asettaa Y-tunnuksellisille maa=FI, rekisterinumero=Y-tunnus, '
  'rekisteriviranomainen=RA000188 PRH/YTJ-lähteellä. p_kuiva=true vain laskee.';

GRANT EXECUTE ON FUNCTION taydenna_organisaatio_maa_ytunnuksellisille(boolean)
  TO service_role;
