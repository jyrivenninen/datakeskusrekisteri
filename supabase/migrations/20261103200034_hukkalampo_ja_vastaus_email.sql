-- Hukkalämpökentät hankkeille ja palautteen vapaaehtoinen vastausosoite.
-- Ei täytä hanketietoja. Konehdotus hukkalämpökentistä jää jonoon.

ALTER TABLE hankkeet
  ADD COLUMN hukkalampo_tila text,
  ADD COLUMN hukkalampo_vastaanottaja_id uuid,
  ADD COLUMN hukkalampo_gwh_a numeric(12, 3),
  ADD COLUMN hukkalampo_mw numeric(12, 3);

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_hukkalampo_tila_tarkistus CHECK (
    hukkalampo_tila IS NULL OR hukkalampo_tila IN (
      'toimitetaan_verkkoon',
      'sopimus_tehty',
      'aie_tai_suunnitelma',
      'ei_hyodynneta'
    )
  ),
  ADD CONSTRAINT hankkeet_hukkalampo_gwh_a_positiivinen CHECK (
    hukkalampo_gwh_a IS NULL OR hukkalampo_gwh_a > 0
  ),
  ADD CONSTRAINT hankkeet_hukkalampo_mw_positiivinen CHECK (
    hukkalampo_mw IS NULL OR hukkalampo_mw > 0
  ),
  ADD CONSTRAINT hankkeet_hukkalampo_vastaanottaja_id_fkey
    FOREIGN KEY (hukkalampo_vastaanottaja_id)
    REFERENCES organisaatiot (id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN hankkeet.hukkalampo_tila IS
  'Hukkalämmön tila. NULL = ei julkista tietoa, ei tarkoita ettei lämpöä hyödynnetä. toimitetaan_verkkoon = lämpöä toimitetaan kaukolämpöverkkoon. sopimus_tehty = sitova sopimus, ei vielä käytössä. aie_tai_suunnitelma = aiesopimus, selvitys tai hankkeen suunnitelma. ei_hyodynneta = lähde toteaa nimenomaisesti, ettei hukkalämpöä hyödynnetä.';
COMMENT ON COLUMN hankkeet.hukkalampo_vastaanottaja_id IS
  'Energiayhtiö, joka ottaa hukkalämmön vastaan. Viittaus organisaatiot-tauluun, sama malli kuin toimija_organisaatio_id.';
COMMENT ON COLUMN hankkeet.hukkalampo_gwh_a IS
  'Toimitettu lämpö gigawattitunteina vuodessa. Tyhjä, jos julkista lukua ei ole.';
COMMENT ON COLUMN hankkeet.hukkalampo_mw IS
  'Lämmön talteenoton teho megawatteina. Tyhjä, jos julkista lukua ei ole.';

CREATE INDEX hankkeet_hukkalampo_tila_idx ON hankkeet (hukkalampo_tila);
CREATE INDEX hankkeet_hukkalampo_vastaanottaja_id_idx
  ON hankkeet (hukkalampo_vastaanottaja_id);

INSERT INTO faktakentta_sitovuus (taulu, kentta, luokka) VALUES
  ('hankkeet', 'hukkalampo_tila', 'sitovuus_merkittaa'),
  ('hankkeet', 'hukkalampo_vastaanottaja_id', 'sitovuus_merkittaa'),
  ('hankkeet', 'hukkalampo_gwh_a', 'sitovuus_merkittaa'),
  ('hankkeet', 'hukkalampo_mw', 'sitovuus_merkittaa');

ALTER TABLE palautteet
  ADD COLUMN vastaus_email text;

ALTER TABLE palautteet
  ADD CONSTRAINT palautteet_vastaus_email_muoto CHECK (
    vastaus_email IS NULL
    OR (
      char_length(vastaus_email) BETWEEN 1 AND 320
      AND vastaus_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

COMMENT ON COLUMN palautteet.vastaus_email IS
  'Vapaaehtoinen vastausosoite. Ei julkaista. Tyhjennetään triggerissä, kun tila vaihtuu käsitellyksi, ja ajastetusti kun saapumisesta on yli 89 päivää.';

CREATE INDEX palautteet_vastaus_email_luotu_idx
  ON palautteet (luotu_pvm)
  WHERE vastaus_email IS NOT NULL;

REVOKE ALL ON TABLE palautteet FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE palautteet TO anon, authenticated;
GRANT SELECT (
  id,
  aihe,
  viesti,
  tila,
  luotu_pvm,
  kasitelty_pvm,
  kasittelija,
  huomautus
) ON TABLE palautteet TO authenticated;
GRANT UPDATE (
  tila,
  kasitelty_pvm,
  kasittelija,
  huomautus
) ON TABLE palautteet TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE palautteet TO service_role;

CREATE OR REPLACE FUNCTION public.tyhjenna_vastaus_email_kasiteltaessa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tila = 'kasitelty' AND OLD.tila IS DISTINCT FROM 'kasitelty' THEN
    NEW.vastaus_email := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_palautteet_tyhjenna_vastaus_email ON palautteet;
CREATE TRIGGER trg_palautteet_tyhjenna_vastaus_email
BEFORE UPDATE OF tila ON palautteet
FOR EACH ROW
EXECUTE FUNCTION public.tyhjenna_vastaus_email_kasiteltaessa();

REVOKE ALL ON FUNCTION public.tyhjenna_vastaus_email_kasiteltaessa()
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.tyhjenna_vastaus_email_kasiteltaessa()
  TO service_role, authenticated;

CREATE OR REPLACE FUNCTION tarkista_hukkalampo_lainaus()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.taulu = 'hankkeet'
    AND NEW.kentta IN (
      'hukkalampo_tila',
      'hukkalampo_vastaanottaja_id',
      'hukkalampo_gwh_a',
      'hukkalampo_mw'
    )
    AND NEW.tila = 'voimassa'
    AND NULLIF(btrim(NEW.lainaus), '') IS NULL THEN
    RAISE EXCEPTION 'Hukkalämpökentän lähde vaatii lainauksen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kentta_lahteet_hukkalampo_lainaus ON kentta_lahteet;
CREATE TRIGGER trg_kentta_lahteet_hukkalampo_lainaus
BEFORE INSERT OR UPDATE OF kentta, tila, lainaus, taulu ON kentta_lahteet
FOR EACH ROW
EXECUTE FUNCTION tarkista_hukkalampo_lainaus();

REVOKE ALL ON FUNCTION tarkista_hukkalampo_lainaus() FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION tarkista_hukkalampo_lainaus() TO service_role;

CREATE OR REPLACE FUNCTION public.tyhjenna_vanhat_vastaus_email(p_paivia integer DEFAULT 89)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  tyhjennetty integer;
BEGIN
  IF p_paivia IS NULL OR p_paivia < 1 THEN
    RAISE EXCEPTION 'p_paivia oltava vähintään 1';
  END IF;

  UPDATE palautteet
  SET vastaus_email = NULL
  WHERE vastaus_email IS NOT NULL
    AND luotu_pvm < now() - make_interval(days => p_paivia);

  GET DIAGNOSTICS tyhjennetty = ROW_COUNT;
  RETURN tyhjennetty;
END;
$$;

REVOKE ALL ON FUNCTION public.tyhjenna_vanhat_vastaus_email(integer)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.tyhjenna_vanhat_vastaus_email(integer) TO service_role;
