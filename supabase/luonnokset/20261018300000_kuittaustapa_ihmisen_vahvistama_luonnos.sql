-- LUONNOS — odottaa hyväksyntää. Älä aja tuotantoon.
-- Versio > 20261014100000 (ja B2-luonnoksen jälkeen jos B2 ajataan ensin).
--
-- merkitty='ihmisen_vahvistama' vaatii:
--   1) kuittaustapa IN ('yksittain','era')
--   2) auth.uid() IS NOT NULL  (ihmisen JWT; service_role / MCP ilman käyttäjää eivät läpäise)
-- Poikkeus: vanhat rivit OLD.merkitty_pvm < 2026-10-12 10:07:10+00.
--
-- Tehokkuus ja rajoitus:
--   Suojaa vahingossa tehdyltä service_role-/MCP-UPDATE:lta ja skripteiltä,
--   jotka nostavat merkittyä ilman UI-istuntoa. Ei suojaa SQL-oikeudelliselta
--   toimijalta, joka voi DISABLE TRIGGER / DROP FUNCTION / SET ROLE.

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

  -- Vanha poikkeus: vain UPDATE, OLD.merkitty_pvm (ei NEW)
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
    -- Vanha rivi: saa pitää NULL-kuittaustavan
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

  -- Ihmisen JWT pakollinen. SECURITY DEFINER ei vaihda auth.uid():ta:
  -- kutsuja authenticated → uid löytyy; service_role / MCP → NULL → FAIL.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'ihmisen_vahvistama vaatii kirjautuneen käyttäjän (auth.uid())'
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

COMMENT ON FUNCTION tarkista_kuittaustapa_ihmisen_vahvistama() IS
  'Estää ihmisen_vahvistama ilman kuittaustapaa ja ilman auth.uid():ta cutoverin jälkeen.';

-- kuitaa_kentta_lahteet: GRANT myös authenticated (UI JWT).
-- GRANT EXECUTE ON FUNCTION kuitaa_kentta_lahteet(uuid[], text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Rollback-testit (BEGIN … ROLLBACK; ei tuotantoon)
-- ---------------------------------------------------------------------------
-- BEGIN;
--
-- -- (c) Vanha rivi OLD-poikkeus: OK
-- UPDATE kentta_lahteet
-- SET kuittaustapa = NULL
-- WHERE id = (
--   SELECT id FROM kentta_lahteet
--   WHERE merkitty = 'ihmisen_vahvistama'
--     AND merkitty_pvm < timestamptz '2026-10-12 10:07:10+00'
--   LIMIT 1
-- );
-- -- odotus: onnistuu (tai 0 riviä)
--
-- -- (a) service_role-skripti / MCP ilman JWT: FAIL
-- -- (istunto service_role, auth.uid() IS NULL)
-- UPDATE kentta_lahteet
-- SET merkitty = 'ihmisen_vahvistama', merkitty_pvm = now(), kuittaustapa = 'yksittain'
-- WHERE merkitty = 'koneen_ehdottama' AND tila = 'voimassa'
-- LIMIT 1;
-- -- odotus: EXCEPTION 42501
--
-- -- (b) Simuloitu authenticated-JWT + kuitaa_kentta_lahteet: OK
-- SELECT set_config(
--   'request.jwt.claims',
--   json_build_object(
--     'sub', '<olemassa_oleva_auth_users.id>',
--     'role', 'authenticated'
--   )::text,
--   true
-- );
-- SET LOCAL ROLE authenticated;
-- SELECT kuitaa_kentta_lahteet(
--   ARRAY['<koneen_ehdottama_lahde_id>'::uuid],
--   'rollback-testi',
--   'vahvistettu'
-- );
-- -- odotus: palauttaa 1; rivi merkitty=ihmisen_vahvistama, kuittaustapa=yksittain
--
-- ROLLBACK;
