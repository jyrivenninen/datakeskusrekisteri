-- Duplikaatti / poistettu: erotetaan julkaisemattomista luonnoksista.
-- yhdistetty_kohde_id osoittaa säilytettyyn hankkeeseen; riviä ei poisteta.

ALTER TABLE hankkeet
  ADD COLUMN poistettu_perustelu text,
  ADD COLUMN poistettu_pvm timestamptz,
  ADD COLUMN poistettu_kasittelija text;

COMMENT ON COLUMN hankkeet.poistettu_perustelu IS
  'Miksi hanke merkittiin duplikaatiksi tai yhdistettiin pois julkiselta listalta.';
COMMENT ON COLUMN hankkeet.poistettu_pvm IS
  'Milloin hanke merkittiin poistetuksi yllapidossa.';
COMMENT ON COLUMN hankkeet.poistettu_kasittelija IS
  'Kuka merkitsi hankkeen poistetuksi.';

CREATE OR REPLACE FUNCTION merkitse_hanke_duplikaatiksi(
  p_duplikaatti uuid,
  p_kohde uuid,
  p_kasittelija text,
  p_perustelu text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_duplikaatti hankkeet%ROWTYPE;
  v_kohde hankkeet%ROWTYPE;
BEGIN
  IF p_duplikaatti IS NULL OR p_kohde IS NULL OR p_duplikaatti = p_kohde THEN
    RAISE EXCEPTION 'Duplikaatti ja kohde puuttuvat tai ovat samat.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;
  IF char_length(btrim(COALESCE(p_perustelu, ''))) < 12 THEN
    RAISE EXCEPTION 'Kirjaa miksi hanke on duplikaatti (vahintaan 12 merkkia).';
  END IF;

  SELECT * INTO v_duplikaatti
  FROM hankkeet
  WHERE id = p_duplikaatti
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei loytynyt.';
  END IF;
  IF v_duplikaatti.julkaistu THEN
    RAISE EXCEPTION 'Julkaistua hanketta ei merkita duplikaatiksi talla toiminolla. Kayta yhdistamista.';
  END IF;
  IF v_duplikaatti.yhdistetty_kohde_id IS NOT NULL THEN
    RAISE EXCEPTION 'Hanke on jo merkitty poistetuksi.';
  END IF;

  SELECT * INTO v_kohde
  FROM hankkeet
  WHERE id = p_kohde;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kohdehanketta ei loytynyt.';
  END IF;
  IF v_kohde.yhdistetty_kohde_id IS NOT NULL THEN
    RAISE EXCEPTION 'Kohdehanke on itse poistettu eikä voi olla duplikaatin kohde.';
  END IF;

  UPDATE hankkeet
  SET
    yhdistetty_kohde_id = p_kohde,
    poistettu_perustelu = btrim(p_perustelu),
    poistettu_pvm = now(),
    poistettu_kasittelija = btrim(p_kasittelija)
  WHERE id = p_duplikaatti
    AND NOT julkaistu
    AND yhdistetty_kohde_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplikaatin merkinta epaonnistui.';
  END IF;
END;
$$;

COMMENT ON FUNCTION merkitse_hanke_duplikaatiksi(uuid, uuid, text, text) IS
  'Yllapitaja merkitsee julkaisemattoman hankkeen duplikaatiksi. Ei poista rivia.';

CREATE OR REPLACE FUNCTION julkaise_hanke(
  p_hanke_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hanke hankkeet%ROWTYPE;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_hanke
  FROM hankkeet
  WHERE id = p_hanke_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei löytynyt';
  END IF;

  IF v_hanke.julkaistu THEN
    RAISE EXCEPTION 'Hanke on jo julkaistu';
  END IF;

  IF v_hanke.yhdistetty_kohde_id IS NOT NULL THEN
    RAISE EXCEPTION 'Duplikaatti tai yhdistetty hanke ei voi julkaista';
  END IF;

  IF char_length(trim(v_hanke.nimi)) = 0
    OR char_length(trim(v_hanke.kunta)) = 0
    OR char_length(trim(v_hanke.vaihe)) = 0 THEN
    RAISE EXCEPTION 'Hankkeelta puuttuu nimi, kunta tai vaihe';
  END IF;

  IF v_hanke.toimija_organisaatio_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM organisaatiot o
    WHERE o.id = v_hanke.toimija_organisaatio_id
      AND o.julkaistu
  ) THEN
    RAISE EXCEPTION 'Toimija-organisaatio ei ole julkaistu';
  END IF;

  UPDATE hankkeet
  SET julkaistu = true
  WHERE id = p_hanke_id
    AND NOT julkaistu
    AND yhdistetty_kohde_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei voitu julkaista';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION merkitse_hanke_duplikaatiksi(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION merkitse_hanke_duplikaatiksi(uuid, uuid, text, text) TO service_role;
