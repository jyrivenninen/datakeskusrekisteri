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
    'mallikutsut'
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
