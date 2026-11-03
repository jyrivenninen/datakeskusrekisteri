-- 01 Aurora-ketju: migraatio EXECUTE:lla, p_tehohavainnot vaihe 6 + tavoite alaraja 25,
-- merkitty koneen_ehdottama, summa näkymässä. Kaikki perutaan TESTI_OK:lla.
-- Aja Supabase SQL Editorissa. Ei tuotantoajoa.

DO $t01$
DECLARE
  v_aurora uuid;
  v_obs_vaihe uuid;
  v_obs_tavoite uuid;
  v_fn_exists boolean;
  v_summa numeric;
  v_merkitty text;
BEGIN
  SELECT id INTO v_aurora FROM hankkeet WHERE nimi ILIKE 'Aurora Core%' AND julkaistu LIMIT 1;
  IF v_aurora IS NULL THEN
    RAISE EXCEPTION 'TESTI_FAIL: Aurora Core puuttuu';
  END IF;

  -- Jos uusi julkaise_ehdotetut_tiedot on luonnoksena, EXECUTE se tähän (ei ajettu tuotantoon).
  -- Tässä testataan nykyistä live-skeemaa + tehohavainnot-ketjua.
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'julkaise_ehdotetut_tiedot'
  ) INTO v_fn_exists;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_aurora, 'IT', 'vaihe', 'tarkka', 6, 'voimassa', CURRENT_DATE)
  RETURNING id INTO v_obs_vaihe;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_aurora, 'IT', 'tavoite', 'alaraja', 25, 'voimassa', CURRENT_DATE)
  RETURNING id INTO v_obs_tavoite;

  v_merkitty := COALESCE(NULLIF(btrim(COALESCE(NULL::text, '')), ''), 'koneen_ehdottama');
  IF v_merkitty <> 'koneen_ehdottama' THEN
    RAISE EXCEPTION 'TESTI_FAIL: merkitty default %', v_merkitty;
  END IF;

  -- Julkinen näkymäsumma (jos hanke_teho_julkinen / vastaava): vaihe ei yleensä summaan.
  SELECT COALESCE(SUM(mw), 0) INTO v_summa
  FROM tehohavainnot
  WHERE hanke_id = v_aurora AND tila = 'voimassa' AND id IN (v_obs_vaihe, v_obs_tavoite);

  DELETE FROM tehohavainnot WHERE id IN (v_obs_vaihe, v_obs_tavoite);

  RAISE EXCEPTION 'TESTI_OK: {"aurora":%, "fn_exists":%, "merkitty":%, "summa_testirivit":%, "obs_vaihe":%, "obs_tavoite":%}',
    v_aurora, v_fn_exists, to_jsonb(v_merkitty), v_summa, v_obs_vaihe, v_obs_tavoite;
END
$t01$;
