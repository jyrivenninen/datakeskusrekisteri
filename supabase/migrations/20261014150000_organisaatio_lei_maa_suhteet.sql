-- Organisaatio: LEI, maa, rekisterinumero; suhde: lainaus + GLEIF-tyypit.
-- GLEIF-haku ja toimijasivu tulevat erikseen.

-- ---------------------------------------------------------------------------
-- ISO 17442: LEI 20 merkkiä, tarkistusnumero (koko merkkijonon arvo mod 97 = 1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lei_on_kelvollinen(p_lei text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
  v_c char;
  v_num text := '';
BEGIN
  v := upper(btrim(p_lei));
  IF length(v) <> 20 OR v !~ '^[A-Z0-9]{20}$' THEN
    RETURN false;
  END IF;
  FOREACH v_c IN ARRAY string_to_array(v, NULL) LOOP
    IF v_c >= '0' AND v_c <= '9' THEN
      v_num := v_num || v_c;
    ELSE
      v_num := v_num || (ascii(v_c) - 55)::text;
    END IF;
  END LOOP;
  RETURN (v_num::numeric % 97) = 1;
END;
$$;

COMMENT ON FUNCTION lei_on_kelvollinen(text) IS
  'ISO 17442 LEI-tarkistusnumero. True, jos 20 merkkiä ja arvo mod 97 = 1.';

-- ---------------------------------------------------------------------------
-- organisaatiot: LEI, maa, rekisteritunniste
-- ---------------------------------------------------------------------------
ALTER TABLE organisaatiot
  ADD COLUMN IF NOT EXISTS lei text,
  ADD COLUMN IF NOT EXISTS lei_tila text,
  ADD COLUMN IF NOT EXISTS lei_paivitetty_pvm timestamptz,
  ADD COLUMN IF NOT EXISTS lei_haettu_pvm date,
  ADD COLUMN IF NOT EXISTS maa text,
  ADD COLUMN IF NOT EXISTS rekisterinumero text,
  ADD COLUMN IF NOT EXISTS rekisteriviranomainen text,
  ADD COLUMN IF NOT EXISTS gleif_suora_emo_poikkeus text,
  ADD COLUMN IF NOT EXISTS gleif_ylin_emo_poikkeus text;

ALTER TABLE organisaatiot
  DROP CONSTRAINT IF EXISTS organisaatiot_lei_muoto,
  DROP CONSTRAINT IF EXISTS organisaatiot_maa_muoto,
  DROP CONSTRAINT IF EXISTS organisaatiot_rekisteriviranomainen_muoto;

ALTER TABLE organisaatiot
  ADD CONSTRAINT organisaatiot_lei_muoto CHECK (
    lei IS NULL OR lei_on_kelvollinen(lei)
  ),
  ADD CONSTRAINT organisaatiot_maa_muoto CHECK (
    maa IS NULL OR maa ~ '^[A-Z]{2}$'
  ),
  ADD CONSTRAINT organisaatiot_rekisteriviranomainen_muoto CHECK (
    rekisteriviranomainen IS NULL
    OR rekisteriviranomainen ~ '^RA[0-9]{6}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS organisaatiot_lei_yksilollinen
  ON organisaatiot (lei)
  WHERE lei IS NOT NULL;

COMMENT ON COLUMN organisaatiot.lei IS
  'Legal Entity Identifier (ISO 17442), 20 merkkiä. Ei täytetä nimihaulla.';
COMMENT ON COLUMN organisaatiot.lei_tila IS
  'GLEIF registration.status (esim. ISSUED, LAPSED).';
COMMENT ON COLUMN organisaatiot.lei_paivitetty_pvm IS
  'GLEIF registration.lastUpdateDate.';
COMMENT ON COLUMN organisaatiot.lei_haettu_pvm IS
  'Milloin LEI haettiin GLEIF:stä tähän rekisteriin.';
COMMENT ON COLUMN organisaatiot.maa IS
  'ISO 3166-1 alpha-2 (esim. FI, SE, NO).';
COMMENT ON COLUMN organisaatiot.rekisterinumero IS
  'Kansallinen rekisterinumero (Suomessa Y-tunnus muodossa nnnnnnn-n).';
COMMENT ON COLUMN organisaatiot.rekisteriviranomainen IS
  'GLEIF Registration Authority -koodi (esim. RA000188 = Suomen BIS/PRH).';
COMMENT ON COLUMN organisaatiot.gleif_suora_emo_poikkeus IS
  'GLEIF direct parent reporting exception reason (esim. NATURAL_PERSONS).';
COMMENT ON COLUMN organisaatiot.gleif_ylin_emo_poikkeus IS
  'GLEIF ultimate parent reporting exception reason.';

-- Lähdepakko uusille faktakentille (julkaistu organisaatio)
CREATE OR REPLACE FUNCTION organisaatio_puuttuvat_lahteet(o organisaatiot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT o.julkaistu THEN
    RETURN puuttuvat;
  END IF;
  IF NOT lahde_on_olemassa('organisaatiot', o.id, 'nimi') THEN
    puuttuvat := array_append(puuttuvat, 'nimi');
  END IF;
  IF o.y_tunnus IS NOT NULL AND NOT lahde_on_olemassa('organisaatiot', o.id, 'y_tunnus') THEN
    puuttuvat := array_append(puuttuvat, 'y_tunnus');
  END IF;
  IF o.verkko_osoite IS NOT NULL
    AND NOT lahde_on_olemassa('organisaatiot', o.id, 'verkko_osoite') THEN
    puuttuvat := array_append(puuttuvat, 'verkko_osoite');
  END IF;
  IF o.lei IS NOT NULL AND NOT lahde_on_olemassa('organisaatiot', o.id, 'lei') THEN
    puuttuvat := array_append(puuttuvat, 'lei');
  END IF;
  IF o.maa IS NOT NULL AND NOT lahde_on_olemassa('organisaatiot', o.id, 'maa') THEN
    puuttuvat := array_append(puuttuvat, 'maa');
  END IF;
  IF o.rekisterinumero IS NOT NULL
    AND NOT lahde_on_olemassa('organisaatiot', o.id, 'rekisterinumero') THEN
    puuttuvat := array_append(puuttuvat, 'rekisterinumero');
  END IF;
  IF o.rekisteriviranomainen IS NOT NULL
    AND NOT lahde_on_olemassa('organisaatiot', o.id, 'rekisteriviranomainen') THEN
    puuttuvat := array_append(puuttuvat, 'rekisteriviranomainen');
  END IF;
  RETURN puuttuvat;
END;
$$;

-- ---------------------------------------------------------------------------
-- Suhdetyypit
-- ---------------------------------------------------------------------------
INSERT INTO organisaatio_suhde_tyypit (tunnus, nimi, jarjestys) VALUES
  ('hankeyhtio', 'Hankeyhtiö', 30),
  ('gleif_suora_emo', 'GLEIF: suora konsolidoiva emo', 40),
  ('gleif_ylin_emo', 'GLEIF: ylin konsolidoiva emo', 50)
ON CONFLICT (tunnus) DO UPDATE
SET nimi = EXCLUDED.nimi, jarjestys = EXCLUDED.jarjestys, kaytossa = true;

UPDATE organisaatio_suhde_tyypit
SET nimi = 'Emoyhtiö (asiakirja)', jarjestys = 20
WHERE tunnus = 'emoyhtio';

UPDATE organisaatio_suhde_tyypit
SET nimi = 'Omistus (asiakirja)', jarjestys = 10
WHERE tunnus = 'omistus';

-- ---------------------------------------------------------------------------
-- organisaatio_suhteet.lainaus
-- ---------------------------------------------------------------------------
ALTER TABLE organisaatio_suhteet
  ADD COLUMN IF NOT EXISTS lainaus text;

COMMENT ON COLUMN organisaatio_suhteet.lainaus IS
  'Sanatarkka lainaus. Pakollinen asiakirjasuhteille (omistus, emoyhtio, hankeyhtio).';

-- Regant: täydennä lainaus ennen CHECK-pakotetta
UPDATE organisaatio_suhteet
SET lainaus = COALESCE(
  NULLIF(btrim(lainaus), ''),
  'Kaupunginhallituksen päätös 10.8.2026 § 260'
)
WHERE suhde_tunnus IN ('omistus', 'emoyhtio', 'hankeyhtio')
  AND NULLIF(btrim(COALESCE(lainaus, '')), '') IS NULL;

ALTER TABLE organisaatio_suhteet
  DROP CONSTRAINT IF EXISTS organisaatio_suhteet_asiakirja_lainaus;

ALTER TABLE organisaatio_suhteet
  ADD CONSTRAINT organisaatio_suhteet_asiakirja_lainaus CHECK (
    suhde_tunnus IN ('gleif_suora_emo', 'gleif_ylin_emo')
    OR NULLIF(btrim(COALESCE(lainaus, '')), '') IS NOT NULL
  );

COMMENT ON TABLE organisaatio_suhteet IS
  'Omistus- ja konsernisuhteet: asiakirjatyypit vain nimetystä asiakirjasta; '
  'gleif_* vain GLEIF-tietueesta ehdotusjonon kautta. '
  'Vuokralainen, konsultti, hakija ja aloitteen_tekija ovat hanke_organisaatio_roolit, ei suhteita.';
