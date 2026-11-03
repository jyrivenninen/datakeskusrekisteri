-- LUONNOS — älä aja ennen diff-hyväksyntää.
-- Korjaus auditista: EI GRANT authenticatedille; pg_default_acl antaa
-- uusille funktioille EXECUTE anon/authenticated/PUBLIC → REVOKE pakollinen.
--
-- Jokaisen CREATE FUNCTION julkaise_* jälkeen:
--   REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, agentti;
--   GRANT EXECUTE ON FUNCTION … TO service_role;
-- julkaise_agentti_ehdotus: REVOKE … agentti; GRANT EXECUTE TO service_role
--   (agenttirooli suljetaan; ei GRANT agentille).
--
-- DROP/CREATE-järjestys (PostgREST overload):
--   1) DROP FUNCTION IF EXISTS julkaise_ehdotetut_tiedot(text,uuid,jsonb,jsonb,uuid,text,jsonb,boolean);
--   2) CREATE FUNCTION … p_tehohavainnot jsonb DEFAULT NULL;
--   3) REVOKE ALL … FROM PUBLIC, anon, authenticated, agentti;
--   4) GRANT EXECUTE … TO service_role;
--   5) NOTIFY pgrst, 'reload schema';

ALTER TABLE tehohavainnot
  ADD COLUMN IF NOT EXISTS korvaava_id uuid REFERENCES tehohavainnot (id);

COMMENT ON COLUMN tehohavainnot.korvaava_id IS
  'Kun tila=korvattu: viittaus uuteen voimassa-havaintoon.';

-- ---------------------------------------------------------------------------
-- Muutettavat funktiot (yhteenveto)
-- ---------------------------------------------------------------------------
-- 1) julkaise_ehdotetut_tiedot
--    NYT:  (p_tyyppi text, p_hanke_id uuid, p_hanke jsonb, p_lahteet jsonb,
--           p_ehdotus_id uuid, p_kasittelija text,
--           p_vaihtoehdot jsonb DEFAULT '[]', p_paivita_ehdotus boolean DEFAULT true)
--    UUSI: + p_tehohavainnot jsonb DEFAULT NULL
--    DROP: DROP FUNCTION IF EXISTS public.julkaise_ehdotetut_tiedot(
--            text, uuid, jsonb, jsonb, uuid, text, jsonb, boolean);
--    GRANT: REVOKE ALL … FROM PUBLIC, anon, authenticated, agentti;
--           GRANT EXECUTE … TO service_role;
--    merkitty: vain 'ihmisen_vahvistama'|'koneen_ehdottama';
--              ihmisen_vahvistama vaatii p_kasittelija (ylläpitäjä) — C myöhemmin.
--
-- 2) julkaise_agentti_ehdotus
--    NYT/UUSI: (p_ehdotus_id uuid) — kutsuu sisäisesti julkaise_ehdotetut_tiedot
--              (tarkista body) TAI kirjoittaa omalla polulla.
--    Pakottaa merkitty='koneen_ehdottama' (ohittaa JSON lahde.merkitty).
--    GRANT: REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role;
--           GRANT EXECUTE … TO agentti;
--
-- 3) julkaise_kentta_tyhjennys (p_ehdotus_id uuid, p_kasittelija text)
--    Lisää teho_erittelematon_mw tyhjennyslistaan tarvittaessa.
--    GRANT: service_role only (REVOKE PUBLIC/anon/authenticated/agentti).
--
-- 4) julkaise_hanketason_tyhjennykset (p_ehdotus_id uuid, p_kasittelija text)
--    Sama GRANT-malli.
--
-- 5) kirjaa_julkaistu_muutos() — trigger-funktio, ei PostgREST-kutsu.
--    UNION: + teho_erittelematon_mw
--    GRANT: service_role (tai vain trigger-omistaja); EI anon/authenticated.
--
-- Katalogitarkistus jokaisen jälkeen:
--   SELECT has_function_privilege('anon','…','EXECUTE'),          -- false
--          has_function_privilege('authenticated','…','EXECUTE'), -- false
--          has_function_privilege('service_role','…','EXECUTE');  -- true
--          -- agentti: true vain julkaise_agentti_ehdotus

-- ---------------------------------------------------------------------------
-- INSERT-silmukka p_tehohavainnot (ote julkaise_ehdotetut_tiedot-runkoon)
-- ---------------------------------------------------------------------------
/*
  IF p_tehohavainnot IS NOT NULL THEN
    IF jsonb_typeof(p_tehohavainnot) <> 'array' THEN
      RAISE EXCEPTION 'p_tehohavainnot on oltava taulukko tai NULL';
    END IF;
    FOR v_th IN SELECT value FROM jsonb_array_elements(p_tehohavainnot) LOOP
      -- poista_id → tila='ei_tue'
      -- validointi laji/kohde/rajaus + lahde
      v_merkitty := COALESCE(NULLIF(v_th_lahde ->> 'merkitty', ''), 'ihmisen_vahvistama');
      IF v_merkitty NOT IN ('ihmisen_vahvistama', 'koneen_ehdottama') THEN
        RAISE EXCEPTION 'p_tehohavainnot: merkitty virheellinen';
      END IF;
      -- agenttipolku (julkaise_agentti_ehdotus) asettaa aina koneen_ehdottama ENNEN tätä
      INSERT INTO tehohavainnot (...) RETURNING id INTO v_th_id;
      INSERT INTO kentta_lahteet (taulu,rivi_id,kentta,...) VALUES
        ('tehohavainnot', v_th_id, 'havainto', ...);
      -- korvaa_id → tila=korvattu, korvaava_id=v_th_id
      v_laskenta_muuttui := true;
    END LOOP;
  END IF;

  IF v_laskenta_muuttui THEN
    -- EI triggeriä tehohavainnot-taululle.
    -- Yksi syöterivi erässä: erillinen RPC kirjaa_laskentatapa_tarkennettu
    -- (ylläpitäjä) TAI eksplisiittinen INSERT julkaistut_muutokset tässä RPC:ssä
    -- vain kun p_kirjaa_laskentatapa boolean DEFAULT false = true.
    -- Ehdotus: erillinen funktio + manuaalinen kutsu backfill-erän jälkeen,
    -- ei automaattia jokaisesta havainto-INSERTistä.
  END IF;
*/

-- ---------------------------------------------------------------------------
-- DEFAULT PRIVILEGES (ehdotus — älä aja tässä migraatiossa ilman erillistä päätöstä)
-- ---------------------------------------------------------------------------
/*
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

-- Rikkoutuu ilman eksplisiittistä GRANT:ia:
--   - kirjaa_sivukatselu (anon EXECUTE tarvitaan)
--   - muutosehdotukset INSERT (anon/authenticated lomakkeelle)
--   - julkaise_agentti_ehdotus (agentti EXECUTE)
--   - kaikki uudet julkinen-luku -näkymät/taulut (SELECT anon OK, jos
--     REVOKE koskee vain I/U/D/T — SELECT säilyy default ACL:ssä erikseen)
--   - mahdolliset uudet RPC:t ilman GRANT-riviä migraatiossa
*/

-- Testit (DO + TESTI_OK + rollback) hyväksynnän jälkeen — ei tässä.
