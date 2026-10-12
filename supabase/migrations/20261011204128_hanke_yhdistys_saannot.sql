-- Yhdistyssääntö: sama toimija + (kaavatunnus | YVA | asiakirja molemmille)
-- TAI jatkumoasiakirja. Lähde-URL ja perustelu pakollisia.
-- Pelkkä sijainti ei riitä eri toimijoilla.

CREATE OR REPLACE FUNCTION tarkista_hanke_yhdistys_saannot(
  p_a uuid,
  p_b uuid,
  p_lahde_url text,
  p_perustelu text,
  p_vahvistus_tyyppi text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a hankkeet%ROWTYPE;
  v_b hankkeet%ROWTYPE;
  v_tyyppi text;
  v_url text;
BEGIN
  v_url := NULLIF(btrim(COALESCE(p_lahde_url, '')), '');
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'Yhdistys vaatii lähde-URL:n (asiakirja tai muu todiste).';
  END IF;
  IF lahde_url_on_kielletty(v_url) THEN
    RAISE EXCEPTION 'Lähde-URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
  IF char_length(btrim(COALESCE(p_perustelu, ''))) < 12 THEN
    RAISE EXCEPTION 'Kirjaa miksi hankkeet yhdistetään (vahintaan 12 merkkia).';
  END IF;

  v_tyyppi := NULLIF(btrim(COALESCE(p_vahvistus_tyyppi, '')), '');
  IF v_tyyppi IS NULL OR v_tyyppi NOT IN (
    'sama_kaavatunnus',
    'sama_yva',
    'asiakirja_molemmat',
    'jatkumo_asiakirja'
  ) THEN
    RAISE EXCEPTION
      'Vahvistustyyppi puuttuu tai ei ole sallittu (sama_kaavatunnus | sama_yva | asiakirja_molemmat | jatkumo_asiakirja).';
  END IF;

  SELECT * INTO v_a FROM hankkeet WHERE id = p_a;
  SELECT * INTO v_b FROM hankkeet WHERE id = p_b;
  IF v_a.id IS NULL OR v_b.id IS NULL THEN
    RAISE EXCEPTION 'Hanketta ei loytynyt.';
  END IF;

  IF v_tyyppi = 'jatkumo_asiakirja' THEN
    RETURN;
  END IF;

  IF v_a.toimija_organisaatio_id IS NULL
     OR v_b.toimija_organisaatio_id IS NULL
     OR v_a.toimija_organisaatio_id IS DISTINCT FROM v_b.toimija_organisaatio_id
  THEN
    RAISE EXCEPTION
      'Eri toimijat: yhdistys vaatii jatkumoasiakirjan (vahvistustyyppi jatkumo_asiakirja) ja lähde-URL:n. Pelkkä sijainti ei riitä.';
  END IF;

  IF v_tyyppi = 'sama_kaavatunnus' THEN
    IF NULLIF(btrim(COALESCE(v_a.kaavatunnus, '')), '') IS NULL
       OR v_a.kaavatunnus IS DISTINCT FROM v_b.kaavatunnus
    THEN
      RAISE EXCEPTION 'sama_kaavatunnus vaatii saman ei-tyhjän kaavatunnuksen molemmilla.';
    END IF;
    RETURN;
  END IF;

  IF v_tyyppi = 'sama_yva' THEN
    IF NULLIF(btrim(COALESCE(v_a.yva_diaarinumero, '')), '') IS NULL
       OR v_a.yva_diaarinumero IS DISTINCT FROM v_b.yva_diaarinumero
    THEN
      RAISE EXCEPTION 'sama_yva vaatii saman ei-tyhjän YVA-diaarinumeron molemmilla.';
    END IF;
    RETURN;
  END IF;

  -- asiakirja_molemmat: sama toimija + lähde-URL (ihminen/vahvistus takaa sisällön)
  RETURN;
END;
$$;

COMMENT ON FUNCTION tarkista_hanke_yhdistys_saannot(uuid, uuid, text, text, text) IS
  'Estää hankeyhdistyksen ilman lähde-URL:ää ja sääntöjen mukaista vahvistusta.';

REVOKE ALL ON FUNCTION tarkista_hanke_yhdistys_saannot(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION tarkista_hanke_yhdistys_saannot(uuid, uuid, text, text, text)
  TO service_role;

-- Vanha allekirjoitus: ohjaa uuteen (estää ohituksen)
CREATE OR REPLACE FUNCTION yhdista_hankkeet(
  p_sailytettava uuid,
  p_siirrettava uuid,
  p_ehdotus_id uuid,
  p_kasittelija text,
  p_perustelu text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'Yhdistys vaatii lahde_url ja vahvistus_tyyppi. Kayta yhdista_hankkeet(..., p_lahde_url, p_vahvistus_tyyppi).';
END;
$$;

CREATE OR REPLACE FUNCTION yhdista_hankkeet(
  p_sailytettava uuid,
  p_siirrettava uuid,
  p_ehdotus_id uuid,
  p_kasittelija text,
  p_perustelu text,
  p_lahde_url text,
  p_vahvistus_tyyppi text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kohde hankkeet;
  v_lahde hankkeet;
  v_ehdotus muutosehdotukset;
  v_lkm integer;
  v_max integer;
BEGIN
  IF p_sailytettava IS NULL OR p_siirrettava IS NULL OR p_sailytettava = p_siirrettava THEN
    RAISE EXCEPTION 'Yhdistettavat hankkeet puuttuvat tai ovat samat.';
  END IF;
  IF char_length(trim(p_kasittelija)) = 0 THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  PERFORM tarkista_hanke_yhdistys_saannot(
    p_sailytettava,
    p_siirrettava,
    p_lahde_url,
    p_perustelu,
    p_vahvistus_tyyppi
  );

  SELECT * INTO v_ehdotus FROM muutosehdotukset WHERE id = p_ehdotus_id FOR UPDATE;
  IF NOT FOUND OR v_ehdotus.tila <> 'odottaa' OR v_ehdotus.tyyppi <> 'ristiriita_havainto' THEN
    RAISE EXCEPTION 'Yhdistaminen vaatii odottavan ristiriitahavainnon.';
  END IF;

  SELECT * INTO v_kohde FROM hankkeet WHERE id = p_sailytettava FOR UPDATE;
  SELECT * INTO v_lahde FROM hankkeet WHERE id = p_siirrettava FOR UPDATE;
  IF v_kohde.id IS NULL OR v_lahde.id IS NULL THEN
    RAISE EXCEPTION 'Hanketta ei loytynyt.';
  END IF;
  IF NOT v_kohde.julkaistu OR NOT v_lahde.julkaistu THEN
    RAISE EXCEPTION 'Vain kaksi julkaistua hanketta voi yhdistaa.';
  END IF;
  IF v_lahde.yhdistetty_kohde_id IS NOT NULL OR v_kohde.yhdistetty_kohde_id IS NOT NULL THEN
    RAISE EXCEPTION 'Hanke on jo yhdistetty.';
  END IF;

  IF v_kohde.maakunta IS NULL AND v_lahde.maakunta IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'maakunta');
    UPDATE hankkeet SET maakunta = v_lahde.maakunta WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.kunta_id IS NULL AND v_lahde.kunta_id IS NOT NULL THEN
    UPDATE hankkeet SET kunta_id = v_lahde.kunta_id WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.teho_mw IS NULL AND v_lahde.teho_mw IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'teho_mw');
    UPDATE hankkeet SET teho_mw = v_lahde.teho_mw WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.it_teho_mw IS NULL AND v_lahde.it_teho_mw IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'it_teho_mw');
    UPDATE hankkeet SET it_teho_mw = v_lahde.it_teho_mw WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.pinta_ala_ha IS NULL AND v_lahde.pinta_ala_ha IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'pinta_ala_ha');
    UPDATE hankkeet SET pinta_ala_ha = v_lahde.pinta_ala_ha WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.sahkonkaytto_twh_a IS NULL AND v_lahde.sahkonkaytto_twh_a IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'sahkonkaytto_twh_a');
    UPDATE hankkeet SET sahkonkaytto_twh_a = v_lahde.sahkonkaytto_twh_a WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.generaattorit_lkm IS NULL AND v_lahde.generaattorit_lkm IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'generaattorit_lkm');
    UPDATE hankkeet SET generaattorit_lkm = v_lahde.generaattorit_lkm WHERE id = p_sailytettava;
  END IF;
  SELECT generaattorit_lkm, generaattorit_kaytossa_max_lkm
    INTO v_lkm, v_max
  FROM hankkeet WHERE id = p_sailytettava;
  IF v_max IS NULL AND v_lahde.generaattorit_kaytossa_max_lkm IS NOT NULL
     AND (v_lkm IS NULL OR v_lahde.generaattorit_kaytossa_max_lkm <= v_lkm) THEN
    PERFORM yhdista_kopioi_hanke_lahteet(
      p_sailytettava, p_siirrettava, 'generaattorit_kaytossa_max_lkm'
    );
    UPDATE hankkeet
    SET generaattorit_kaytossa_max_lkm = v_lahde.generaattorit_kaytossa_max_lkm
    WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.generaattori_polttoaineteho_mw IS NULL
     AND v_lahde.generaattori_polttoaineteho_mw IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(
      p_sailytettava, p_siirrettava, 'generaattori_polttoaineteho_mw'
    );
    UPDATE hankkeet
    SET generaattori_polttoaineteho_mw = v_lahde.generaattori_polttoaineteho_mw
    WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.toimija_organisaatio_id IS NULL
     AND v_lahde.toimija_organisaatio_id IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(
      p_sailytettava, p_siirrettava, 'toimija_organisaatio_id'
    );
    UPDATE hankkeet
    SET toimija_organisaatio_id = v_lahde.toimija_organisaatio_id
    WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.yva_diaarinumero IS NULL AND v_lahde.yva_diaarinumero IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'yva_diaarinumero');
    UPDATE hankkeet SET yva_diaarinumero = v_lahde.yva_diaarinumero WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.kaavatunnus IS NULL AND v_lahde.kaavatunnus IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'kaavatunnus');
    UPDATE hankkeet SET kaavatunnus = v_lahde.kaavatunnus WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.kortteli IS NULL AND v_lahde.kortteli IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'kortteli');
    UPDATE hankkeet SET kortteli = v_lahde.kortteli WHERE id = p_sailytettava;
  END IF;
  IF v_kohde.sijainti_lat IS NULL AND v_lahde.sijainti_lat IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'sijainti');
    UPDATE hankkeet SET
      sijainti_lat = v_lahde.sijainti_lat,
      sijainti_lon = v_lahde.sijainti_lon,
      sijainti_alue = v_lahde.sijainti_alue,
      sijainti_alue_tyyppi = v_lahde.sijainti_alue_tyyppi
    WHERE id = p_sailytettava;
  ELSIF v_kohde.sijainti_alue IS NULL AND v_lahde.sijainti_alue IS NOT NULL THEN
    PERFORM yhdista_kopioi_hanke_lahteet(p_sailytettava, p_siirrettava, 'sijainti');
    UPDATE hankkeet SET
      sijainti_alue = v_lahde.sijainti_alue,
      sijainti_alue_tyyppi = COALESCE(v_kohde.sijainti_alue_tyyppi, v_lahde.sijainti_alue_tyyppi)
    WHERE id = p_sailytettava;
  END IF;

  UPDATE maaraajat m
  SET menettely_id = t.id
  FROM hanke_menettelyt s
  JOIN hanke_menettelyt t
    ON t.hanke_id = p_sailytettava AND t.laji = s.laji
  WHERE s.hanke_id = p_siirrettava
    AND m.menettely_id = s.id;

  UPDATE dokumentit d
  SET menettely_id = t.id
  FROM hanke_menettelyt s
  JOIN hanke_menettelyt t
    ON t.hanke_id = p_sailytettava AND t.laji = s.laji
  WHERE s.hanke_id = p_siirrettava
    AND d.menettely_id = s.id;

  UPDATE hanke_johdot j
  SET menettely_id = t.id
  FROM hanke_menettelyt s
  JOIN hanke_menettelyt t
    ON t.hanke_id = p_sailytettava AND t.laji = s.laji
  WHERE s.hanke_id = p_siirrettava
    AND j.menettely_id = s.id;

  UPDATE hanke_menettelyt s
  SET hanke_id = p_sailytettava
  WHERE s.hanke_id = p_siirrettava
    AND NOT EXISTS (
      SELECT 1 FROM hanke_menettelyt t
      WHERE t.hanke_id = p_sailytettava AND t.laji = s.laji
    );

  UPDATE hanke_kunnat s
  SET hanke_id = p_sailytettava
  WHERE s.hanke_id = p_siirrettava
    AND NOT EXISTS (
      SELECT 1 FROM hanke_kunnat t
      WHERE t.hanke_id = p_sailytettava
        AND t.kunta = s.kunta
        AND t.rooli = s.rooli
    );

  UPDATE hanke_organisaatiot s
  SET hanke_id = p_sailytettava
  WHERE s.hanke_id = p_siirrettava
    AND NOT EXISTS (
      SELECT 1 FROM hanke_organisaatiot t
      WHERE t.hanke_id = p_sailytettava
        AND t.organisaatio_id = s.organisaatio_id
        AND t.rooli = s.rooli
    );

  UPDATE hanke_vaihtoehdot s
  SET hanke_id = p_sailytettava
  WHERE s.hanke_id = p_siirrettava
    AND NOT EXISTS (
      SELECT 1 FROM hanke_vaihtoehdot t
      WHERE t.hanke_id = p_sailytettava AND t.tunnus = s.tunnus
    );

  UPDATE hanke_kuvat s
  SET hanke_id = p_sailytettava
  WHERE s.hanke_id = p_siirrettava
    AND NOT EXISTS (
      SELECT 1 FROM hanke_kuvat t
      WHERE t.hanke_id = p_sailytettava AND t.kuva_url = s.kuva_url
    );

  UPDATE maaraajat SET hanke_id = p_sailytettava WHERE hanke_id = p_siirrettava;
  UPDATE hanke_johdot SET hanke_id = p_sailytettava WHERE hanke_id = p_siirrettava;
  UPDATE dokumentit SET hanke_id = p_sailytettava WHERE hanke_id = p_siirrettava;
  UPDATE yhteyshenkilot SET hanke_id = p_sailytettava WHERE hanke_id = p_siirrettava;
  UPDATE muutosehdotukset
  SET hanke_id = p_sailytettava
  WHERE hanke_id = p_siirrettava
    AND id <> p_ehdotus_id;

  UPDATE hankkeet
  SET
    julkaistu = false,
    yhdistetty_kohde_id = p_sailytettava,
    poistettu_perustelu = btrim(p_perustelu),
    poistettu_pvm = now(),
    poistettu_kasittelija = btrim(p_kasittelija)
  WHERE id = p_siirrettava;

  INSERT INTO hanke_ohjaukset (vanha_id, uusi_id)
  VALUES (p_siirrettava, p_sailytettava)
  ON CONFLICT (vanha_id) DO UPDATE SET uusi_id = EXCLUDED.uusi_id;

  UPDATE hanke_ohjaukset
  SET uusi_id = p_sailytettava
  WHERE uusi_id = p_siirrettava;

  UPDATE hankkeet
  SET yhdistetty_kohde_id = p_sailytettava
  WHERE yhdistetty_kohde_id = p_siirrettava;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    perustelu = trim(p_perustelu),
    hanke_id = p_sailytettava,
    lahde_url = COALESCE(NULLIF(btrim(p_lahde_url), ''), lahde_url),
    sisalto = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(sisalto, '{}'::jsonb),
            '{ristiriita,ei_uudelleen}',
            'true'::jsonb
          ),
          '{ristiriita,ei_uudelleen_perustelu}',
          to_jsonb(trim(p_perustelu))
        ),
        '{yhdistys,lahde_url}',
        to_jsonb(btrim(p_lahde_url))
      ),
      '{yhdistys,vahvistus_tyyppi}',
      to_jsonb(btrim(p_vahvistus_tyyppi))
    )
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotuksen merkinta kasitellyksi epaonnistui.';
  END IF;

  RETURN p_sailytettava;
END;
$$;

COMMENT ON FUNCTION yhdista_hankkeet(uuid, uuid, uuid, text, text, text, text) IS
  'Ylläpidon yhdistäminen. Vaatii lähde-URL:n ja vahvistustyypin (yhdistyssääntö).';

REVOKE ALL ON FUNCTION yhdista_hankkeet(uuid, uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION yhdista_hankkeet(uuid, uuid, uuid, text, text, text, text)
  TO service_role;

-- Duplikaattimerkintä (julkaisematon): sama sääntö
DROP FUNCTION IF EXISTS merkitse_hanke_duplikaatiksi(uuid, uuid, text, text);

CREATE FUNCTION merkitse_hanke_duplikaatiksi(
  p_duplikaatti uuid,
  p_kohde uuid,
  p_kasittelija text,
  p_perustelu text,
  p_lahde_url text,
  p_vahvistus_tyyppi text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_duplikaatti hankkeet%ROWTYPE;
  v_kohde hankkeet%ROWTYPE;
BEGIN
  IF p_duplikaatti IS NULL OR p_kohde IS NULL OR p_duplikaatti = p_kohde THEN
    RAISE EXCEPTION 'Duplikaatti ja kohde puuttuvat tai ovat samat.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  PERFORM tarkista_hanke_yhdistys_saannot(
    p_duplikaatti,
    p_kohde,
    p_lahde_url,
    p_perustelu,
    p_vahvistus_tyyppi
  );

  SELECT * INTO v_duplikaatti
  FROM hankkeet
  WHERE id = p_duplikaatti
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei loytynyt.';
  END IF;
  IF v_duplikaatti.julkaistu THEN
    RAISE EXCEPTION 'Julkaistua hanketta ei merkita duplikaatiksi talla toiminolla. Kayta yhdistamista.';
  END IF;
  IF v_duplikaatti.yhdistetty_kohde_id IS NOT NULL THEN
    RAISE EXCEPTION 'Hanke on jo merkitty poistetuksi.';
  END IF;

  SELECT * INTO v_kohde
  FROM hankkeet
  WHERE id = p_kohde;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kohdehanketta ei loytynyt.';
  END IF;
  IF v_kohde.yhdistetty_kohde_id IS NOT NULL THEN
    RAISE EXCEPTION 'Kohdehanke on itse poistettu eikä voi olla duplikaatin kohde.';
  END IF;

  UPDATE hankkeet
  SET
    yhdistetty_kohde_id = p_kohde,
    poistettu_perustelu = btrim(p_perustelu),
    poistettu_pvm = now(),
    poistettu_kasittelija = btrim(p_kasittelija)
  WHERE id = p_duplikaatti
    AND NOT julkaistu
    AND yhdistetty_kohde_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplikaatin merkinta epaonnistui.';
  END IF;

  UPDATE muutosehdotukset
  SET
    tila = 'hylatty',
    kasitelty_pvm = now(),
    kasittelija = btrim(p_kasittelija),
    perustelu = 'Hanke merkitty duplikaatiksi — ehdotus hylätty automaattisesti.'
  WHERE hanke_id = p_duplikaatti
    AND tila = 'odottaa';
END;
$$;

COMMENT ON FUNCTION merkitse_hanke_duplikaatiksi(uuid, uuid, text, text, text, text) IS
  'Merkitsee julkaisemattoman hankkeen duplikaatiksi. Vaatii yhdistyssäännön (lähde + tyyppi).';

REVOKE ALL ON FUNCTION merkitse_hanke_duplikaatiksi(uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION merkitse_hanke_duplikaatiksi(uuid, uuid, text, text, text, text)
  TO service_role;
