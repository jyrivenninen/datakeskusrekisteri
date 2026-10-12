-- Tyhjä sisältötiiviste (SHA-256("")) ei saa näyttää onnistunutta noutoa.
-- Tallennus epäonnistuneesta noudosta + tyhjien tiivisteiden nollaus.

ALTER TABLE dokumentit
  ADD COLUMN IF NOT EXISTS sisalto_nouto_syy text;

ALTER TABLE dokumentit
  ADD COLUMN IF NOT EXISTS sisalto_nouto_pvm timestamptz;

COMMENT ON COLUMN dokumentit.sisalto_nouto_syy IS
  'Kun sisalto_tiiviste on NULL noutoyrityksen jälkeen: robots | http_403 | '
  'http_429 | http_4xx | http_5xx | tyhja_sisalto | skannattu_pdf | '
  'muoto_ei_tuettu | nouto_virhe | muu';

COMMENT ON COLUMN dokumentit.sisalto_nouto_pvm IS
  'Viimeisin sisällön noutoyritys (onnistunut tai epäonnistunut).';

-- Tyhjän merkkijonon SHA-256 ei ole kelvollinen sisältötiiviste.
CREATE OR REPLACE FUNCTION aseta_dokumentti_sisalto_tiiviste(
  p_dokumentti_id uuid,
  p_sisalto_tiiviste text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tiiviste text;
  v_kanoninen_id uuid;
  v_tyhja constant text :=
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
BEGIN
  v_tiiviste := NULLIF(btrim(COALESCE(p_sisalto_tiiviste, '')), '');
  IF v_tiiviste IS NULL OR v_tiiviste !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sisalto_tiiviste ei ole kelvollinen SHA-256.';
  END IF;
  IF v_tiiviste = v_tyhja THEN
    RAISE EXCEPTION
      'Tyhjän sisällön tiivistettä ei kirjoiteta; käytä merkitse_dokumentti_sisalto_nouto_epaonnistui.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM dokumentit WHERE id = p_dokumentti_id) THEN
    RAISE EXCEPTION 'Dokumenttia ei löytynyt.';
  END IF;

  v_kanoninen_id := hae_kanoninen_dokumentti_sisalolla(v_tiiviste);
  IF v_kanoninen_id = p_dokumentti_id THEN
    v_kanoninen_id := NULL;
  END IF;

  UPDATE dokumentit
  SET
    sisalto_tiiviste = v_tiiviste,
    kanoninen_dokumentti_id = COALESCE(kanoninen_dokumentti_id, v_kanoninen_id),
    sisalto_nouto_syy = NULL,
    sisalto_nouto_pvm = now()
  WHERE id = p_dokumentti_id;
END;
$$;

COMMENT ON FUNCTION aseta_dokumentti_sisalto_tiiviste(uuid, text) IS
  'Asettaa dokumentin sisalto_tiivisteen (raaka-tavujen SHA-256). '
  'Hylkää tyhjän sisällön tiivisteen. Käytä service_role-kutsusta.';

CREATE OR REPLACE FUNCTION merkitse_dokumentti_sisalto_nouto_epaonnistui(
  p_dokumentti_id uuid,
  p_syy text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_syy text;
BEGIN
  v_syy := NULLIF(btrim(COALESCE(p_syy, '')), '');
  IF v_syy IS NULL OR char_length(v_syy) > 80 THEN
    RAISE EXCEPTION 'sisalto_nouto_syy puuttuu tai on liian pitkä.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dokumentit WHERE id = p_dokumentti_id) THEN
    RAISE EXCEPTION 'Dokumenttia ei löytynyt.';
  END IF;

  UPDATE dokumentit
  SET
    sisalto_tiiviste = NULL,
    -- Tyhjän tiivisteen perusteella syntynyt kanoninen-viittaus ei ole luotettava.
    kanoninen_dokumentti_id = CASE
      WHEN sisalto_tiiviste =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      THEN NULL
      ELSE kanoninen_dokumentti_id
    END,
    sisalto_nouto_syy = v_syy,
    sisalto_nouto_pvm = now()
  WHERE id = p_dokumentti_id;
END;
$$;

COMMENT ON FUNCTION merkitse_dokumentti_sisalto_nouto_epaonnistui(uuid, text) IS
  'Merkitsee, että sisällön nouto ei tuottanut tekstiä/tavuja; ei kirjoita tiivistettä.';

REVOKE ALL ON FUNCTION merkitse_dokumentti_sisalto_nouto_epaonnistui(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION merkitse_dokumentti_sisalto_nouto_epaonnistui(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION nollaa_tyhjat_sisalto_tiivisteet()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
  v_tyhja constant text :=
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
BEGIN
  UPDATE dokumentit
  SET
    sisalto_tiiviste = NULL,
    kanoninen_dokumentti_id = NULL,
    sisalto_nouto_syy = COALESCE(sisalto_nouto_syy, 'tyhja_sisalto_nollattu'),
    sisalto_nouto_pvm = COALESCE(sisalto_nouto_pvm, now())
  WHERE sisalto_tiiviste = v_tyhja;

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION nollaa_tyhjat_sisalto_tiivisteet() IS
  'Nollaa e3b0c442-tiivisteet ja niistä seuranneet kanoninen-viittaukset.';

REVOKE ALL ON FUNCTION nollaa_tyhjat_sisalto_tiivisteet()
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION nollaa_tyhjat_sisalto_tiivisteet() TO service_role;

CREATE OR REPLACE FUNCTION aseta_dokumentti_kanoninen(
  p_dokumentti_id uuid,
  p_kanoninen_dokumentti_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_dokumentti_id = p_kanoninen_dokumentti_id THEN
    RAISE EXCEPTION 'Dokumentti ei voi olla itsensä kanoninen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dokumentit WHERE id = p_dokumentti_id) THEN
    RAISE EXCEPTION 'Dokumenttia ei löytynyt.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM dokumentit WHERE id = p_kanoninen_dokumentti_id) THEN
    RAISE EXCEPTION 'Kanonista dokumenttia ei löytynyt.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM dokumentit
    WHERE id = p_kanoninen_dokumentti_id
      AND kanoninen_dokumentti_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Kanoninen kohde on itse alias; ketjua ei sallita.';
  END IF;

  UPDATE dokumentit
  SET kanoninen_dokumentti_id = p_kanoninen_dokumentti_id
  WHERE id = p_dokumentti_id;
END;
$$;

COMMENT ON FUNCTION aseta_dokumentti_kanoninen(uuid, uuid) IS
  'Merkitsee URL-aliaksen viittaamaan kanoniseen dokumenttiin.';

REVOKE ALL ON FUNCTION aseta_dokumentti_kanoninen(uuid, uuid)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION aseta_dokumentti_kanoninen(uuid, uuid) TO service_role;

-- Nollaa olemassa olevat tyhjät tiivisteet heti.
SELECT nollaa_tyhjat_sisalto_tiivisteet();
