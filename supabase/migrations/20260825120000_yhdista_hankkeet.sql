-- Yhdistä kaksi julkaistua hanketta: puuttuvat faktat lähteineen,
-- liitokset säilytettävään, toinen pois julkisesta listasta. Ei poista rivejä.

ALTER TABLE hankkeet
  ADD COLUMN yhdistetty_kohde_id uuid REFERENCES hankkeet (id) ON DELETE RESTRICT;

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_yhdistetty_ei_itseensa CHECK (
    yhdistetty_kohde_id IS NULL OR yhdistetty_kohde_id <> id
  );

COMMENT ON COLUMN hankkeet.yhdistetty_kohde_id IS
  'Julkaisematon rivi osoittaa yhdistämisen jälkeen säilytettyyn hankkeeseen.';

CREATE TABLE hanke_ohjaukset (
  vanha_id uuid PRIMARY KEY REFERENCES hankkeet (id) ON DELETE RESTRICT,
  uusi_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_ohjaukset_ei_itseensa CHECK (vanha_id <> uusi_id)
);

COMMENT ON TABLE hanke_ohjaukset IS
  'Julkinen ohjaus yhdistetyn hankkeen vanhasta tunnisteesta uuteen.';

ALTER TABLE hanke_ohjaukset ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_ohjaukset_julkinen_luku
ON hanke_ohjaukset
FOR SELECT
TO anon, authenticated
USING (true);

GRANT SELECT ON hanke_ohjaukset TO anon, authenticated;

CREATE FUNCTION yhdista_kopioi_hanke_lahteet(
  p_kohde uuid,
  p_lahde uuid,
  p_kentta text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO kentta_lahteet (
    taulu, rivi_id, kentta, lahde_url, lahde_sivu, lahde_laji,
    vahvistettu_pvm, luottamus, lainaus, merkitty, merkitty_pvm, dokumentti_id
  )
  SELECT
    'hankkeet',
    p_kohde,
    l.kentta,
    l.lahde_url,
    l.lahde_sivu,
    l.lahde_laji,
    l.vahvistettu_pvm,
    l.luottamus,
    l.lainaus,
    'ihmisen_vahvistama',
    now(),
    l.dokumentti_id
  FROM kentta_lahteet l
  WHERE l.taulu = 'hankkeet'
    AND l.rivi_id = p_lahde
    AND l.kentta = p_kentta
  ON CONFLICT ON CONSTRAINT kentta_lahteet_sama_lahde_kerran DO NOTHING;
END;
$$;

CREATE FUNCTION yhdista_hankkeet(
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
  IF char_length(trim(p_perustelu)) < 12 THEN
    RAISE EXCEPTION 'Kirjaa miksi hankkeet yhdistetaan (vahintaan 12 merkkia).';
  END IF;

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

  -- Puuttuvat faktat ja niiden lähteet. Ei ylikirjoiteta säilytettyä arvoa.
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

  -- Menettelyviitteet samaan lajiin säilytettävällä, sitten siirto.
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
    yhdistetty_kohde_id = p_sailytettava
  WHERE id = p_siirrettava;

  INSERT INTO hanke_ohjaukset (vanha_id, uusi_id)
  VALUES (p_siirrettava, p_sailytettava);

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
    sisalto = jsonb_set(
      jsonb_set(
        COALESCE(sisalto, '{}'::jsonb),
        '{ristiriita,ei_uudelleen}',
        'true'::jsonb
      ),
      '{ristiriita,ei_uudelleen_perustelu}',
      to_jsonb(trim(p_perustelu))
    )
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotuksen merkinta kasitellyksi epaonnistui.';
  END IF;

  RETURN p_sailytettava;
END;
$$;

COMMENT ON FUNCTION yhdista_hankkeet(uuid, uuid, uuid, text, text) IS
  'Yllapidon yhdistaminen. Taydentaa puuttuvat kentat lahteenen, siirtää liitokset, ei poista riveja.';

REVOKE ALL ON FUNCTION yhdista_kopioi_hanke_lahteet(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yhdista_hankkeet(uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yhdista_kopioi_hanke_lahteet(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION yhdista_hankkeet(uuid, uuid, uuid, text, text) TO service_role;
