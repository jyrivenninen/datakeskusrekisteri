-- B2 lisäävä: teho_erittelematon_mw + tehohavainnot.
-- Ei näkymää, ei julkaise_*-muutoksia, ei backfilliä, ei kuittaustapa-triggeriä.
-- Lähteet: kentta_lahteet(taulu='tehohavainnot', kentta='havainto').

ALTER TABLE hankkeet
  ADD COLUMN IF NOT EXISTS teho_erittelematon_mw numeric(12, 3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hankkeet_teho_erittelematon_mw_positiivinen'
  ) THEN
    ALTER TABLE hankkeet
      ADD CONSTRAINT hankkeet_teho_erittelematon_mw_positiivinen
        CHECK (teho_erittelematon_mw IS NULL OR teho_erittelematon_mw > 0);
  END IF;
END $$;

COMMENT ON COLUMN hankkeet.teho_erittelematon_mw IS
  'Koko hankkeen ilmoitettu teho MW, lajia erittelemättä. Vain koko hanke.';

CREATE TABLE IF NOT EXISTS tehohavainnot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE CASCADE,
  mw numeric(12, 3),
  mw_min numeric(12, 3),
  mw_max numeric(12, 3),
  laji text NOT NULL CHECK (laji IN ('IT', 'kokonais', 'erittelematon')),
  kohde text NOT NULL CHECK (kohde IN (
    'koko_hanke', 'vaihe', 'tavoite', 'moduuli', 'asennettu', 'lupa',
    'aiempi_suunnitelma'
  )),
  rajaus text NOT NULL CHECK (rajaus IN (
    'tarkka', 'noin', 'alaraja', 'ylaraja', 'vali'
  )),
  havainto_pvm date,
  haettu_pvm date NOT NULL DEFAULT CURRENT_DATE,
  tila text NOT NULL DEFAULT 'voimassa'
    CHECK (tila IN ('voimassa', 'korvattu', 'ei_tue')),
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tehohavainnot_mw_muoto CHECK (
    (rajaus = 'vali' AND mw IS NULL AND mw_min IS NOT NULL AND mw_max IS NOT NULL
      AND mw_min > 0 AND mw_max >= mw_min)
    OR
    (rajaus <> 'vali' AND mw IS NOT NULL AND mw > 0
      AND mw_min IS NULL AND mw_max IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS tehohavainnot_hanke_id_idx ON tehohavainnot (hanke_id);

CREATE UNIQUE INDEX IF NOT EXISTS tehohavainnot_yksi_koko_hanke_laji_rajaus
  ON tehohavainnot (hanke_id, laji, rajaus)
  WHERE tila = 'voimassa' AND kohde = 'koko_hanke';

COMMENT ON TABLE tehohavainnot IS
  'Tehohavainto: vaihe, tavoite, lupa, moduuli, asennettu, aiempi suunnitelma. '
  'Ei YVA-vaihtoehto (hanke_vaihtoehdot). Lähteet kentta_lahteet-taulussa.';

ALTER TABLE tehohavainnot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tehohavainnot_julkinen_luku ON tehohavainnot;
CREATE POLICY tehohavainnot_julkinen_luku
ON tehohavainnot FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_id AND h.julkaistu AND h.yhdistetty_kohde_id IS NULL
  )
);

CREATE OR REPLACE FUNCTION tehohavainto_puuttuvat_lahteet(t tehohavainnot)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF t.tila IS DISTINCT FROM 'voimassa' THEN
    RETURN ARRAY[]::text[];
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM kentta_lahteet kl
    WHERE kl.taulu = 'tehohavainnot'
      AND kl.rivi_id = t.id
      AND kl.kentta = 'havainto'
      AND kl.tila = 'voimassa'
      AND kl.lainaus IS NOT NULL
      AND btrim(kl.lainaus) <> ''
      AND kl.luottamus IS NOT NULL
      AND kl.merkitty IS NOT NULL
  ) THEN
    RETURN ARRAY['havainto'];
  END IF;
  RETURN ARRAY[]::text[];
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_tehohavainnon_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := tehohavainto_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Tehohavainnon faktakentiltä puuttuu lähde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tehohavainnot_lahteet ON tehohavainnot;
CREATE CONSTRAINT TRIGGER trg_tehohavainnot_lahteet
AFTER INSERT OR UPDATE ON tehohavainnot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_tehohavainnon_lahteet();

-- Siivoustrigger: poista kentta_lahteet kun havainto poistetaan
DROP TRIGGER IF EXISTS trg_tehohavainnot_poista_lahteet ON tehohavainnot;
CREATE TRIGGER trg_tehohavainnot_poista_lahteet
BEFORE DELETE ON tehohavainnot
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

ALTER TABLE kentta_lahteet DROP CONSTRAINT IF EXISTS kentta_lahteet_taulu_tarkistus;
ALTER TABLE kentta_lahteet ADD CONSTRAINT kentta_lahteet_taulu_tarkistus CHECK (
  taulu = ANY (ARRAY[
    'hankkeet'::text, 'maaraajat'::text, 'organisaatiot'::text, 'yhteyshenkilot'::text,
    'hanke_kunnat'::text, 'hanke_menettelyt'::text, 'hanke_organisaatiot'::text,
    'dokumentit'::text, 'hanke_johdot'::text, 'hanke_vaihtoehdot'::text,
    'hanke_kuvat'::text, 'paatokset'::text, 'hanke_rakentamisvaiheet'::text,
    'tehohavainnot'::text
  ])
);

REVOKE ALL ON tehohavainnot FROM PUBLIC;
GRANT SELECT ON tehohavainnot TO anon, authenticated, service_role;
