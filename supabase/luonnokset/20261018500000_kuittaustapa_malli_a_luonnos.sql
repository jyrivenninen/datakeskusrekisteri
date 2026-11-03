-- LUONNOS — malli A. Älä aja ennen kuin UI-muutos menee samaan deployhin.
-- Edellyttää: kuittaustapa-sarake olemassa; B2 ei vaadita.
--
-- Malli A:
--   UI kutsuu kuitaa_* käyttäjän authenticated-sessiolla (ei service_role).
--   RPC tarkistaa onko_yllapitaja() heti alussa.
--   Trigger vaatii auth.uid() + onko_yllapitaja() + kuittaustapa yksittain|era.
--   service_role ei voi asettaa ihmisen_vahvistama + kuittaustapa.
--   Vanha rivi: OLD.merkitty_pvm < 2026-10-12 10:07:10+00 poikkeus.

CREATE OR REPLACE FUNCTION tarkista_kuittaustapa_ihmisen_vahvistama()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cutover timestamptz := timestamptz '2026-10-12 10:07:10+00';
BEGIN
  IF NEW.merkitty IS DISTINCT FROM 'ihmisen_vahvistama' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.merkitty IS NOT DISTINCT FROM 'ihmisen_vahvistama'
    AND OLD.merkitty_pvm IS NOT NULL
    AND OLD.merkitty_pvm < cutover
  THEN
    IF OLD.merkitty IS NOT DISTINCT FROM NEW.merkitty
      AND OLD.kuittaustapa IS NOT DISTINCT FROM NEW.kuittaustapa
    THEN
      RETURN NEW;
    END IF;
    IF NEW.kuittaustapa IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.kuittaustapa IS NULL
    OR NEW.kuittaustapa NOT IN ('yksittain', 'era')
  THEN
    RAISE EXCEPTION
      'ihmisen_vahvistama vaatii kuittaustapa yksittain tai era (cutover %)',
      cutover
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NULL OR NOT onko_yllapitaja() THEN
    RAISE EXCEPTION
      'ihmisen_vahvistama vaatii kirjautuneen ylläpitäjän (auth.uid + onko_yllapitaja)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kentta_lahteet_kuittaustapa ON kentta_lahteet;
CREATE TRIGGER trg_kentta_lahteet_kuittaustapa
BEFORE INSERT OR UPDATE OF merkitty, kuittaustapa ON kentta_lahteet
FOR EACH ROW
EXECUTE FUNCTION tarkista_kuittaustapa_ihmisen_vahvistama();

-- RPC: ylläpitotarkistus heti alussa (allekirjoitus = tuotannon nykyinen)
CREATE OR REPLACE FUNCTION kuitaa_kentta_lahteet(
  p_lahde_idt uuid[],
  p_kasittelija text,
  p_luottamus text DEFAULT 'vahvistettu'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer;
BEGIN
  IF NOT onko_yllapitaja() THEN
    RAISE EXCEPTION 'kuitaa_kentta_lahteet: ei ylläpitäjä' USING ERRCODE = '42501';
  END IF;
  IF p_luottamus NOT IN ('vahvistettu', 'epavarma') THEN
    RAISE EXCEPTION 'Kuittauksen luottamus ei ole sallittu';
  END IF;
  IF p_lahde_idt IS NULL OR cardinality(p_lahde_idt) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE kentta_lahteet
  SET
    merkitty = 'ihmisen_vahvistama',
    luottamus = p_luottamus,
    merkitty_pvm = now(),
    kuittaustapa = 'yksittain',
    eratunniste = NULL
  WHERE id = ANY (p_lahde_idt)
    AND merkitty = 'koneen_ehdottama'
    AND tila IS DISTINCT FROM 'korvattu';

  GET DIAGNOSTICS v_lkm = ROW_COUNT;
  RETURN v_lkm;
END;
$$;

-- Sama alkuun kuitaa_hanke_kentat(...): IF NOT onko_yllapitaja() THEN RAISE ...
GRANT EXECUTE ON FUNCTION kuitaa_kentta_lahteet(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION kuitaa_hanke_kentat(uuid, text[], text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Rollback-testit (BEGIN … ROLLBACK; SET LOCAL lock_timeout = '3s')
-- ---------------------------------------------------------------------------
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
--
-- -- 1) ylläpitäjä authenticated: OK (set_config jwt + SET LOCAL ROLE authenticated)
-- -- 2) ei-ylläpitäjä authenticated: FAIL 42501
-- -- 3) service_role (auth.uid NULL): FAIL 42501
-- -- 4) vanha rivi OLD-poikkeus: OK
--
-- ROLLBACK;
