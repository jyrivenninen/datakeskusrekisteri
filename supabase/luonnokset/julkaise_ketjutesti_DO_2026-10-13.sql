-- §3c KETJUTESTI (luonnos / ajettavaksi SQL Editorissa tai execute_sql).
-- Sisältää INSERT/UPDATE/DDL migraation EXECUTE-lohkon sisällä; päättyy
-- RAISE EXCEPTION 'TESTI_OK: <json>' → rollback.
-- ÄLÄ aja tuotantoon ilman erillistä päätöstä julkaise_*-migraatioista.
--
-- Tämä tiedosto on paikanpitäjä: täysi Aurora/Greensky/korvaa_id -ketju
-- rakennetaan live-funktioiden + luonnos-CREATE:n päälle kun §3 ajo
-- hyväksytään. Käytä siihen supabase/luonnokset/20261019000000_*.sql
-- ja _uusi.sql -tiedostoja.
--
-- Vähimmäistarkistus (ajettava erikseen, ei muuta dataa pysyvästi):
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='hankkeet'
    AND column_name IN (
      'teho_erittelematon_mw','teho_mw','it_teho_mw','pinta_ala_ha','kaava_ala_ha',
      'nimi','kunta','maakunta','kaavatunnus','kortteli'
    );
  IF position('teho_erittelematon_mw' in v_cols) = 0 THEN
    RAISE EXCEPTION 'teho_erittelematon_mw puuttuu';
  END IF;
  RAISE EXCEPTION 'TESTI_OK: %', json_build_object(
    'cols', v_cols,
    'huom', 'täysi julkaise-ketju vielä ajamatta (ODOTTAA)'
  );
END $$;
