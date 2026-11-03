-- LUONNOS — älä aja. B2: teho_erittelematon_mw + tehohavainnot.
-- Versioehdotus: suurempi kuin etähistorian suurin (nyt 20261014100000).
--
-- Järjestys:
--   1) teho_erittelematon_mw (sisältö tiedostosta 20261016200000, ei ajettu)
--   2) tämä tehohavainnot-taulu + triggerit + kirjoitusoikeudet
--   3) julkaise_*-RPC:t (erillinen migraatio, kaava_ala_ha-malli)
--
-- Lähteet: EI tehohavainnot.lahde_id. Käytä kentta_lahteet(
--   taulu='tehohavainnot', rivi_id=havainto.id, kentta='havainto').

-- ---------------------------------------------------------------------------
-- 0) Erittelemätön hanketason kenttä (tiivistelmä 20261016200000:sta)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 1) tehohavainnot
-- ---------------------------------------------------------------------------
-- rajaus:
--   tarkka  = yksi mw
--   noin    = yksi mw, "noin" / "approximately"
--   alaraja = yksi mw, "yli" / "ainakin" / "vähintään" / "at least" / "more than"
--   ylaraja = yksi mw, "jopa" / "enintään" / "up to" / "at most"
--   vali    = mw_min + mw_max (esim. 600–1000, 250–500, 500–600)
--
-- kohde: ei 'plot' — tontti-/plot-vaihe kirjataan kohde='vaihe'.

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

-- Uniikki: yksi voimassa oleva koko_hanke per (hanke, laji, rajaus).
-- Sallii samalle lajille sekä alarajan että ylärajan (esim. yli 200 + jopa 500).
-- vali on oma rajaus → yksi väli per laji.
CREATE UNIQUE INDEX IF NOT EXISTS tehohavainnot_yksi_koko_hanke_laji_rajaus
  ON tehohavainnot (hanke_id, laji, rajaus)
  WHERE tila = 'voimassa' AND kohde = 'koko_hanke';

COMMENT ON TABLE tehohavainnot IS
  'Tehohavainto: vaihe, tavoite, lupa, moduuli, asennettu, aiempi suunnitelma. '
  'Ei YVA-vaihtoehto (hanke_vaihtoehdot). Lähteet kentta_lahteet-taulussa.';
COMMENT ON COLUMN tehohavainnot.havainto_pvm IS
  'Lähteen / asiakirjan päiväys jos tiedossa; muuten NULL.';
COMMENT ON COLUMN tehohavainnot.haettu_pvm IS
  'Milloin havainto kirjattiin rekisteriin.';
COMMENT ON COLUMN tehohavainnot.rajaus IS
  'tarkka | noin | alaraja (yli/ainakin/vähintään) | ylaraja (jopa/enintään/up to) | vali';
COMMENT ON COLUMN tehohavainnot.kohde IS
  'koko_hanke | vaihe | tavoite | moduuli | asennettu | lupa | aiempi_suunnitelma. '
  'Plot-/tonttivaihe → vaihe.';

ALTER TABLE tehohavainnot ENABLE ROW LEVEL SECURITY;

CREATE POLICY tehohavainnot_julkinen_luku
ON tehohavainnot FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_id AND h.julkaistu AND h.yhdistetty_kohde_id IS NULL
  )
);

-- ---------------------------------------------------------------------------
-- 2) Lähdepakko (DEFERRABLE)
-- ---------------------------------------------------------------------------
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

-- Laajenna kentta_lahteet.taulu CHECK (nyt EI sisällä tehohavainnot).
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
-- kentta='havainto': ei erillistä CHECK/enumia (vain ei-tyhjä). Lähdepakko yllä.

-- ---------------------------------------------------------------------------
-- 3) Kirjoitusoikeudet
-- ---------------------------------------------------------------------------
-- service_role / agentti: EI suoraa INSERT/UPDATE/DELETE tehohavainnot-tauluun
-- (sama malli kuin hankkeet). Kirjoitus vain SECURITY DEFINER -RPC:llä.
--
-- Agentti (julkaise_agentti_ehdotus tms.):
--   - saa luoda/päivittää tehohavainnon + kentta_lahteet-rivin
--   - merkitty pakotetaan 'koneen_ehdottama'
--   - ei saa asettaa ihmisen_vahvistama eikä kuittaustapaa
--
-- Ihmisen kuittaus:
--   - vain UI → kuitaa_kentta_lahteet (tai vastaava) kuittaustapa yksittain|era
--   - ei agenttipolusta
--
-- GRANT-esimerkki (tarkista olemassa olevat roolit ennen ajoa):
--   REVOKE INSERT, UPDATE, DELETE ON tehohavainnot FROM PUBLIC, anon, authenticated;
--   -- service_role: vain SELECT (kuten hankkeet); mutaatiot RPC:n kautta
--   GRANT SELECT ON tehohavainnot TO anon, authenticated, service_role;

REVOKE ALL ON tehohavainnot FROM PUBLIC;
GRANT SELECT ON tehohavainnot TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) julkaise_*-RPC (erillinen migraatio; kaava_ala_ha-malli)
-- ---------------------------------------------------------------------------
-- julkaise_ehdotetut_tiedot / julkaise_agentti_ehdotus:
--   - p_hanke voi sisältää teho_erittelematon_mw (kuten kaava_ala_ha)
--   - p_tehohavainnot jsonb[] (uusi, valinnainen):
--       [{mw, mw_min, mw_max, laji, kohde, rajaus, havainto_pvm, haettu_pvm,
--         lahde: {lahde_url, lainaus, lahde_tyyppi, …}}]
--   - agenttipolku: INSERT tehohavainnot + kentta_lahteet, merkitty=koneen_ehdottama
--   - ihmisen hyväksyntä: sama, mutta merkitty/kuittaustapa UI-kuittauksesta
--   - trg_hankkeet_lahteet: lisää teho_erittelematon_mw lähdepakkoon
--   - trg_tehohavainnot_lahteet: vaatii lähteen samassa transaktiossa (DEFERRABLE)
--
-- JSON API v1 (additiivinen):
--   GET /api/.../hanke → uusi valinnainen kenttä "tehohavainnot": [...]
--   Vanha kuluttaja jättää kentän huomiotta.
--   Dokumentoi: OpenAPI + agents/data/b2-tehohavainnot-json-esimerkit-*.json
--   Suodatin/laskuri: vain hanketaso + kohde=koko_hanke (ei vaihe/tavoite/lupa/…).

-- ---------------------------------------------------------------------------
-- 5) UI-sääntö (dokumentaatio; koodi erikseen)
-- ---------------------------------------------------------------------------
-- Suodatinluokka: "Koko hankkeen tehoa ei merkitty" (ei "Tehoa ei merkitty").
-- Luettelokortti / hankesivu: vaihe-, tavoite-, lupa-, moduuli- ja asennettu-
-- havainnot omalla rivillään (esim. "lupa noin 80 MW (IT)"), ei summaan.
--
-- Koko-suodatin / karttahalo / "Teho (suurin ensin)":
--   hanketaso: it_teho_mw → teho_mw → teho_erittelematon_mw
--   + tehohavainnot joissa kohde='koko_hanke' ja tila='voimassa'
--     (vali → min–max; tarkka/noin/alaraja/ylaraja → mw)
--   EI: vaihe, tavoite, lupa, moduuli, asennettu, aiempi_suunnitelma
-- YVA-vaihtoehdot pysyvät hanke_vaihtoehdoissa (min–max erikseen).
