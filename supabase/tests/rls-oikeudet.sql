-- RLS- ja GRANT-todiste. Aja postgres-roolilla (supabase db query).
-- Ei muuta dataa: INSERT tehdään transaktiossa, joka perutaan.

DO $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO hankkeet (nimi, kunta, vaihe, julkaistu)
    VALUES ('RLS-testi älä julkaise', 'Testikunta', 'esiselvitys', true)
    RETURNING id INTO v_id;
    RAISE EXCEPTION 'service_role pystyi lisäämään rivin hankkeet-tauluun';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE agentti;
    INSERT INTO hankkeet (nimi, kunta, vaihe, julkaistu)
    VALUES ('RLS-testi agentti älä julkaise', 'Testikunta', 'esiselvitys', true);
    RAISE EXCEPTION 'agentti pystyi lisäämään rivin hankkeet-tauluun';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE agentti;
    PERFORM julkaise_ehdotetut_tiedot(
      'taydennys',
      gen_random_uuid(),
      '{}'::jsonb,
      '[]'::jsonb,
      gen_random_uuid(),
      'rls-testi'
    );
    RAISE EXCEPTION 'agentti pystyi kutsumaan julkaise_ehdotetut_tiedot';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  n integer;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM lahdeajot;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  n integer;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dokumentti_tiivisteet',
    'rajapinta_tiivisteet',
    'mallikutsut',
    'palautteet'
  ]
  LOOP
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      RAISE EXCEPTION 'anon sai lukea % (% riviä)', t, n;
    EXCEPTION
      WHEN insufficient_privilege THEN
        NULL;
      WHEN undefined_table THEN
        NULL;
      WHEN OTHERS THEN
        IF SQLSTATE = '42501' THEN
          NULL;
        ELSE
          RAISE;
        END IF;
    END;
    RESET ROLE;
  END LOOP;
END;
$$;

SELECT 'rls_ok' AS tulos;
