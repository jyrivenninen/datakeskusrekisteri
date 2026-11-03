-- GLEIF-vahvistus: täytä Y-tunnus vain jos organisaatiolla ei ole sitä.
-- Jos olemassa oleva Y-tunnus eroaa GLEIF:stä, LEI tallennetaan silti; ristiriita
-- palautetaan sovelluskerrokselle ilmoitukseksi.

DROP FUNCTION IF EXISTS julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text
);

CREATE OR REPLACE FUNCTION julkaise_organisaatio_lei(
  p_organisaatio_id uuid,
  p_lei text,
  p_lei_tila text,
  p_lei_paivitetty_pvm timestamptz,
  p_lahde_url text,
  p_kasittelija text,
  p_gleif_suora_emo_poikkeus text DEFAULT NULL,
  p_gleif_ylin_emo_poikkeus text DEFAULT NULL,
  p_y_tunnus text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lei text;
  v_lahde text;
  v_pvm date := CURRENT_DATE;
  v_yt text;
  v_nykyinen text;
  v_ytunnus_tila text := 'ei_loydy';
  v_maa_tyhja boolean;
  v_nro_tyhja boolean;
  v_ra_tyhja boolean;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  v_lei := upper(btrim(COALESCE(p_lei, '')));
  v_lahde := btrim(COALESCE(p_lahde_url, ''));
  v_yt := NULLIF(btrim(COALESCE(p_y_tunnus, '')), '');

  IF NOT lei_on_kelvollinen(v_lei) THEN
    RAISE EXCEPTION 'LEI ei ole kelvollinen';
  END IF;
  IF v_lahde = '' THEN
    RAISE EXCEPTION 'lahde_url puuttuu';
  END IF;
  IF v_yt IS NOT NULL AND v_yt !~ '^[0-9]{7}-[0-9]$' THEN
    RAISE EXCEPTION 'Y-tunnuksen muoto ei kelpaa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organisaatiot WHERE id = p_organisaatio_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Organisaatiota ei ole tai se ei ole julkaistu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM organisaatiot
    WHERE lei = v_lei AND id IS DISTINCT FROM p_organisaatio_id
  ) THEN
    RAISE EXCEPTION 'LEI on jo toisella organisaatiolla';
  END IF;

  SELECT NULLIF(btrim(COALESCE(y_tunnus, '')), '')
  INTO v_nykyinen
  FROM organisaatiot
  WHERE id = p_organisaatio_id
  FOR UPDATE;

  UPDATE organisaatiot
  SET
    lei = v_lei,
    lei_tila = NULLIF(btrim(COALESCE(p_lei_tila, '')), ''),
    lei_paivitetty_pvm = p_lei_paivitetty_pvm,
    lei_haettu_pvm = v_pvm,
    gleif_suora_emo_poikkeus = NULLIF(btrim(COALESCE(p_gleif_suora_emo_poikkeus, '')), ''),
    gleif_ylin_emo_poikkeus = NULLIF(btrim(COALESCE(p_gleif_ylin_emo_poikkeus, '')), '')
  WHERE id = p_organisaatio_id;

  PERFORM tallenna_kentta_lahde(
    'organisaatiot',
    p_organisaatio_id,
    'lei',
    v_lahde,
    NULL,
    v_pvm,
    'vahvistettu',
    'GLEIF LEI-tietue ' || v_lei,
    'ihmisen_vahvistama',
    'rajapinta'
  );

  IF v_yt IS NULL THEN
    v_ytunnus_tila := 'ei_loydy';
  ELSIF v_nykyinen IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM organisaatiot
      WHERE y_tunnus = v_yt AND id IS DISTINCT FROM p_organisaatio_id
    ) THEN
      v_ytunnus_tila := 'varattu';
    ELSE
      SELECT
        maa IS NULL,
        rekisterinumero IS NULL OR btrim(rekisterinumero) = '',
        rekisteriviranomainen IS NULL OR btrim(rekisteriviranomainen) = ''
      INTO v_maa_tyhja, v_nro_tyhja, v_ra_tyhja
      FROM organisaatiot
      WHERE id = p_organisaatio_id;

      UPDATE organisaatiot
      SET
        y_tunnus = v_yt,
        maa = CASE WHEN v_maa_tyhja THEN 'FI' ELSE maa END,
        rekisterinumero = CASE WHEN v_nro_tyhja THEN v_yt ELSE rekisterinumero END,
        rekisteriviranomainen = CASE
          WHEN v_ra_tyhja THEN 'RA000188'
          ELSE rekisteriviranomainen
        END
      WHERE id = p_organisaatio_id;

      PERFORM tallenna_kentta_lahde(
        'organisaatiot',
        p_organisaatio_id,
        'y_tunnus',
        v_lahde,
        NULL,
        v_pvm,
        'vahvistettu',
        'GLEIF registeredAs ' || v_yt,
        'ihmisen_vahvistama',
        'rajapinta'
      );
      IF v_maa_tyhja THEN
        PERFORM tallenna_kentta_lahde(
          'organisaatiot', p_organisaatio_id, 'maa',
          v_lahde, NULL, v_pvm, 'vahvistettu',
          'GLEIF / Suomen Y-tunnus', 'ihmisen_vahvistama', 'rajapinta'
        );
      END IF;
      IF v_nro_tyhja THEN
        PERFORM tallenna_kentta_lahde(
          'organisaatiot', p_organisaatio_id, 'rekisterinumero',
          v_lahde, NULL, v_pvm, 'vahvistettu',
          'GLEIF registeredAs ' || v_yt, 'ihmisen_vahvistama', 'rajapinta'
        );
      END IF;
      IF v_ra_tyhja THEN
        PERFORM tallenna_kentta_lahde(
          'organisaatiot', p_organisaatio_id, 'rekisteriviranomainen',
          v_lahde, NULL, v_pvm, 'vahvistettu',
          'GLEIF RA000188', 'ihmisen_vahvistama', 'rajapinta'
        );
      END IF;
      v_ytunnus_tila := 'taytetty';
    END IF;
  ELSIF v_nykyinen = v_yt THEN
    v_ytunnus_tila := 'sama';
  ELSE
    v_ytunnus_tila := 'ristiriita';
  END IF;

  RETURN jsonb_build_object(
    'ytunnus_tila', v_ytunnus_tila,
    'y_tunnus', v_yt,
    'nykyinen_y_tunnus', v_nykyinen
  );
END;
$$;

COMMENT ON FUNCTION julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text, text
) IS
  'Tallentaa GLEIF:stä vahvistetun LEI:n. Jos p_y_tunnus ja organisaation Y-tunnus '
  'on tyhjä, täyttää Y-tunnuksen. Ristiriita ei estä LEI-tallennusta.';

REVOKE ALL ON FUNCTION julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_organisaatio_lei(
  uuid, text, text, timestamptz, text, text, text, text, text
) TO service_role;
