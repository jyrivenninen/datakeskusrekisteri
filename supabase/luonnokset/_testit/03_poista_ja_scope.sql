-- 03 poista_id (ei_tue) ja korvaa_id toisen hankkeen havaintoon (pitää epäonnistua);
-- huono JSON -dokumentointi. Perutaan TESTI_OK:lla.

DO $t03$
DECLARE
  v_aurora uuid;
  v_other uuid;
  v_obs uuid;
  v_obs_other uuid;
  v_scope_fail boolean;
  v_bad_json text := '{ei_json';
BEGIN
  SELECT id INTO v_aurora FROM hankkeet WHERE nimi ILIKE 'Aurora Core%' AND julkaistu LIMIT 1;
  SELECT id INTO v_other FROM hankkeet WHERE julkaistu AND id IS DISTINCT FROM v_aurora LIMIT 1;
  IF v_aurora IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'TESTI_FAIL: aurora/other';
  END IF;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_aurora, 'IT', 'moduuli', 'tarkka', 1.5, 'voimassa', CURRENT_DATE)
  RETURNING id INTO v_obs;
  UPDATE tehohavainnot SET tila = 'ei_tue' WHERE id = v_obs; -- poista_id-simulaatio

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_other, 'IT', 'moduuli', 'tarkka', 9, 'voimassa', CURRENT_DATE)
  RETURNING id INTO v_obs_other;

  -- Korvaa_id toisen hankkeen havaintoon: rivin hanke_id ≠ Aurora → scope-virhe odotettu
  v_scope_fail := NOT EXISTS (
    SELECT 1 FROM tehohavainnot t WHERE t.id = v_obs_other AND t.hanke_id = v_aurora
  );

  -- Huono JSON: ei parsita; dokumentoidaan että CAST epäonnistuisi
  BEGIN
    PERFORM v_bad_json::jsonb;
    RAISE EXCEPTION 'TESTI_FAIL: huono JSON ei kaatunut';
  EXCEPTION WHEN invalid_text_representation OR invalid_json_text THEN
    NULL; -- odotettu
  END;

  DELETE FROM tehohavainnot WHERE id IN (v_obs, v_obs_other);

  IF NOT v_scope_fail THEN
    RAISE EXCEPTION 'TESTI_FAIL: scope';
  END IF;

  RAISE EXCEPTION 'TESTI_OK: {"poista_tila":"ei_tue", "scope_fail":%, "huono_json":"kaatoi"}',
    v_scope_fail;
END
$t03$;
