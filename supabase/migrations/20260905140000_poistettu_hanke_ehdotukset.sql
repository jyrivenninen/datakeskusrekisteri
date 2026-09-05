-- Poistettu duplikaatti: ei uusia ehdotuksia, agentti ei näe hanketta, duplikaatin merkinnässä hylätään jono.

CREATE OR REPLACE FUNCTION estae_ehdotus_poistetulle_hankkeelle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.hanke_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM hankkeet h
    WHERE h.id = NEW.hanke_id
      AND h.yhdistetty_kohde_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hanke on poistettu duplikaattina — ehdotusta ei voi luoda';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS muutosehdotukset_estae_poistettu_hanke ON muutosehdotukset;

CREATE TRIGGER muutosehdotukset_estae_poistettu_hanke
BEFORE INSERT ON muutosehdotukset
FOR EACH ROW
EXECUTE FUNCTION estae_ehdotus_poistetulle_hankkeelle();

DROP POLICY IF EXISTS hankkeet_agentti_luku ON hankkeet;

CREATE POLICY hankkeet_agentti_luku
ON hankkeet
FOR SELECT
TO agentti
USING (julkaistu AND yhdistetty_kohde_id IS NULL);

DROP POLICY IF EXISTS muutosehdotukset_agentti_lisays ON muutosehdotukset;

CREATE POLICY muutosehdotukset_agentti_lisays
ON muutosehdotukset
FOR INSERT
TO agentti
WITH CHECK (
  tila = 'odottaa'
  AND ehdottaja_tyyppi = 'agentti'
  AND kasitelty_pvm IS NULL
  AND kasittelija IS NULL
  AND (
    hanke_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM hankkeet h
      WHERE h.id = hanke_id
        AND h.julkaistu
        AND h.yhdistetty_kohde_id IS NULL
    )
  )
);

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

  UPDATE muutosehdotukset
  SET
    tila = 'hylatty',
    kasitelty_pvm = now(),
    kasittelija = btrim(p_kasittelija),
    perustelu = 'Hanke merkitty duplikaatiksi — ehdotus hylätty automaattisesti.'
  WHERE hanke_id = p_duplikaatti
    AND tila = 'odottaa';
END;
$$;
