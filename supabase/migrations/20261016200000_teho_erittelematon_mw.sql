-- EHDOTUS — älä aja tuotantoon ennen kuin:
-- 1) julkaise_ehdotetut_tiedot / julkaise_agentti_ehdotus / tyhjennys-RPC:t
--    sisältävät teho_erittelematon_mw (kaava_ala_ha-migraation malli),
-- 2) rollback-testi + Aurora-ketju (kirjoitus→julkaisu→sivu/JSON/CSV) on OK,
-- 3) käyttäjä on hyväksynyt.
-- Erittelemätön ilmoitettu teho omaksi kentäksi (ei IT eikä kokonaislaitos).
--
-- Rollback-testi 12.10.2026: BEGIN; ADD COLUMN + Aurora UPDATE; SELECT OK; ROLLBACK;
-- → sarake ei jäänyt. RPC-päivitys vielä puuttuu tästä tiedostosta.

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
  'Ilmoitettu teho megawatteina, lajia erittelemättä. Käytä vain kun lähde ei sano IT-kuormaa eikä koko laitoksen tehoa. Ei saa olla täytettynä yhtä aikaa teho_mw- tai it_teho_mw-kentän kanssa.';

COMMENT ON COLUMN hankkeet.it_teho_mw IS
  'Datakeskuksen IT-kuorma megawatteina. Vain jos lähde sanoo IT capacity tai IT load. Aina pienempi tai yhtä suuri kuin teho_mw, kun molemmat on merkitty. Erittelemätön luku → teho_erittelematon_mw.';

COMMENT ON COLUMN hankkeet.teho_mw IS
  'Koko laitoksen sähköteho megawatteina. Vain jos lähde sanoo kokonais-, campus- tai total-tehoa. Erittelemätön luku → teho_erittelematon_mw.';

-- Yksi teholaji kerrallaan: erittelemätön ei saa olla rinnakkain IT/kokonais-kentän kanssa.
CREATE OR REPLACE FUNCTION tarkista_teho_erittelematon_yksin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.teho_erittelematon_mw IS NOT NULL
    AND (NEW.teho_mw IS NOT NULL OR NEW.it_teho_mw IS NOT NULL) THEN
    RAISE EXCEPTION
      'teho_erittelematon_mw ei voi olla täytetty samaan aikaan teho_mw- tai it_teho_mw-kentän kanssa'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hankkeet_teho_erittelematon_yksin ON hankkeet;
CREATE TRIGGER trg_hankkeet_teho_erittelematon_yksin
BEFORE INSERT OR UPDATE OF teho_mw, it_teho_mw, teho_erittelematon_mw ON hankkeet
FOR EACH ROW
EXECUTE FUNCTION tarkista_teho_erittelematon_yksin();

INSERT INTO faktakentta_sitovuus (taulu, kentta, luokka)
SELECT 'hankkeet', 'teho_erittelematon_mw', 'sitovuus_merkittaa'
WHERE NOT EXISTS (
  SELECT 1 FROM faktakentta_sitovuus
  WHERE taulu = 'hankkeet' AND kentta = 'teho_erittelematon_mw'
);

-- Lähdepakko: sama kuin muilla lukukentillä.
-- HUOM: julkaise_ehdotetut_tiedot / julkaise_agentti_ehdotus / tyhjennys-RPC:t
-- ja hanke_puuttuvat_lahteet on päivitettävä samalla kaavalla kuin
-- kaava_ala_ha (20261014100000) — kentän nimi teho_erittelematon_mw.
-- Tämä tiedosto ei sisällä koko RPC-uudelleenkirjoitusta; se tehdään
-- hyväksynnän jälkeen kaava_ala_ha-migraation mallilla.

CREATE OR REPLACE FUNCTION public.hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF h.nimi IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'nimi') THEN
    puuttuvat := array_append(puuttuvat, 'nimi');
  END IF;
  IF h.kunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kunta') THEN
    puuttuvat := array_append(puuttuvat, 'kunta');
  END IF;
  IF h.vaihe IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'vaihe') THEN
    puuttuvat := array_append(puuttuvat, 'vaihe');
  END IF;
  IF (h.sijainti_lat IS NOT NULL OR h.sijainti_alue IS NOT NULL)
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
    puuttuvat := array_append(puuttuvat, 'sijainti');
  END IF;
  IF h.teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'teho_mw');
  END IF;
  IF h.it_teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'it_teho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'it_teho_mw');
  END IF;
  IF h.teho_erittelematon_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_erittelematon_mw') THEN
    puuttuvat := array_append(puuttuvat, 'teho_erittelematon_mw');
  END IF;
  IF h.pinta_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'pinta_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'pinta_ala_ha');
  END IF;
  IF h.kaava_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaava_ala_ha') THEN
    puuttuvat := array_append(puuttuvat, 'kaava_ala_ha');
  END IF;
  IF h.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := array_append(puuttuvat, 'sahkonkaytto_twh_a');
  END IF;
  IF h.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_lkm');
  END IF;
  IF h.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := array_append(puuttuvat, 'generaattorit_kaytossa_max_lkm');
  END IF;
  IF h.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_polttoaineteho_mw');
  END IF;
  IF h.generaattori_yksikkoteho_mwe IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_yksikkoteho_mwe') THEN
    puuttuvat := array_append(puuttuvat, 'generaattori_yksikkoteho_mwe');
  END IF;
  IF h.diesel_vuosikulutus_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'diesel_vuosikulutus_maara') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_maara');
  END IF;
  IF h.diesel_vuosikulutus_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'diesel_vuosikulutus_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'diesel_vuosikulutus_yksikko');
  END IF;
  IF h.varavoima_paastot_t_co2e IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'varavoima_paastot_t_co2e') THEN
    puuttuvat := array_append(puuttuvat, 'varavoima_paastot_t_co2e');
  END IF;
  IF h.polttoainevarasto_maara IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'polttoainevarasto_maara') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_maara');
  END IF;
  IF h.polttoainevarasto_yksikko IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'polttoainevarasto_yksikko') THEN
    puuttuvat := array_append(puuttuvat, 'polttoainevarasto_yksikko');
  END IF;
  IF h.toimija_organisaatio_id IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'toimija_organisaatio_id') THEN
    puuttuvat := array_append(puuttuvat, 'toimija_organisaatio_id');
  END IF;
  IF h.yva_diaarinumero IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'yva_diaarinumero') THEN
    puuttuvat := array_append(puuttuvat, 'yva_diaarinumero');
  END IF;
  IF h.kaavatunnus IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaavatunnus') THEN
    puuttuvat := array_append(puuttuvat, 'kaavatunnus');
  END IF;
  IF h.kortteli IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kortteli') THEN
    puuttuvat := array_append(puuttuvat, 'kortteli');
  END IF;
  IF h.huomautus IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'huomautus') THEN
    puuttuvat := array_append(puuttuvat, 'huomautus');
  END IF;
  RETURN puuttuvat;
END;
$function$;
