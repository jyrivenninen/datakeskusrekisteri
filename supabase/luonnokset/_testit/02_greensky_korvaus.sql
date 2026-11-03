-- 02 Greensky-korvaus: huhtikuun yli 100 -> korvattu, korvaava_id = syyskuun 200;
-- n. 50 -> korvattu, korvaava_id = noin 100. Perutaan TESTI_OK:lla.

DO $t02$
DECLARE
  v_green uuid;
  v_obs_huhti uuid;
  v_new_syys uuid;
  v_obs_50 uuid;
  v_new_100 uuid;
  v_ok boolean;
BEGIN
  SELECT id INTO v_green FROM hankkeet WHERE nimi ILIKE '%Greensky%' AND julkaistu LIMIT 1;
  IF v_green IS NULL THEN
    RAISE EXCEPTION 'TESTI_FAIL: Greensky puuttuu';
  END IF;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_green, 'IT', 'koko_hanke', 'tarkka', 100, 'voimassa', '2026-04-01')
  RETURNING id INTO v_obs_huhti;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_green, 'IT', 'koko_hanke', 'tarkka', 200, 'voimassa', '2026-09-01')
  RETURNING id INTO v_new_syys;

  UPDATE tehohavainnot SET tila = 'korvattu', korvaava_id = v_new_syys WHERE id = v_obs_huhti;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_green, 'IT', 'vaihe', 'noin', 50, 'voimassa', '2026-04-15')
  RETURNING id INTO v_obs_50;

  INSERT INTO tehohavainnot (hanke_id, laji, kohde, rajaus, mw, tila, havainto_pvm)
  VALUES (v_green, 'IT', 'vaihe', 'noin', 100, 'voimassa', '2026-09-15')
  RETURNING id INTO v_new_100;

  UPDATE tehohavainnot SET tila = 'korvattu', korvaava_id = v_new_100 WHERE id = v_obs_50;

  SELECT
    (SELECT tila = 'korvattu' AND korvaava_id = v_new_syys FROM tehohavainnot WHERE id = v_obs_huhti)
    AND (SELECT tila = 'korvattu' AND korvaava_id = v_new_100 FROM tehohavainnot WHERE id = v_obs_50)
  INTO v_ok;

  DELETE FROM tehohavainnot WHERE id IN (v_obs_huhti, v_new_syys, v_obs_50, v_new_100);

  IF NOT v_ok THEN
    RAISE EXCEPTION 'TESTI_FAIL: korvausketju';
  END IF;

  RAISE EXCEPTION 'TESTI_OK: {"greensky":%, "huhti_korvattu":%, "syys":%, "vaihe50_korvattu":%, "vaihe100":%}',
    v_green, v_obs_huhti, v_new_syys, v_obs_50, v_new_100;
END
$t02$;
