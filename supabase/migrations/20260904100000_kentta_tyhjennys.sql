-- Kentän tyhjennys: poista virheellinen julkaistu arvo ja lähteet. Vain ihmisen hyväksyntä.

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN (
      'uusi_hanke',
      'taydennys',
      'korjaus',
      'kuva',
      'kentta_tarkistus',
      'kentta_tyhjennys',
      'paatos',
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto'
    )
  );

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_uusi_ilman_hanketta;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_uusi_ilman_hanketta CHECK (
    (
      tyyppi = 'uusi_hanke'
      AND (
        (tila = 'odottaa' AND hanke_id IS NULL)
        OR (tila = 'hyvaksytty' AND hanke_id IS NOT NULL)
        OR (tila = 'hylatty' AND hanke_id IS NULL)
      )
    )
    OR (
      tyyppi IN (
        'taydennys',
        'korjaus',
        'kuva',
        'kentta_tarkistus',
        'kentta_tyhjennys',
        'paatos'
      )
      AND hanke_id IS NOT NULL
    )
    OR tyyppi IN (
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto'
    )
  );

CREATE FUNCTION kentta_tyhjennys_sallittu(p_kentta text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_kentta IN (
    'maakunta',
    'sijainti',
    'sijainti_lat',
    'sijainti_lon',
    'sijainti_alue_tyyppi',
    'teho_mw',
    'it_teho_mw',
    'pinta_ala_ha',
    'sahkonkaytto_twh_a',
    'generaattorit_lkm',
    'generaattorit_kaytossa_max_lkm',
    'generaattori_polttoaineteho_mw',
    'toimija_organisaatio_id',
    'toimija_nimi',
    'yva_diaarinumero',
    'kaavatunnus',
    'kortteli'
  );
$$;

CREATE FUNCTION julkaise_kentta_tyhjennys(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_kentta text;
  v_lahde_kentta text;
  v_perustelu text;
  v_merkitse boolean;
  v_hanke hankkeet%ROWTYPE;
  v_rivi_id uuid;
  v_taulu text;
BEGIN
  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei löytynyt';
  END IF;
  IF v_ehdotus.tila <> 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotus on jo käsitelty';
  END IF;
  IF v_ehdotus.tyyppi <> 'kentta_tyhjennys' THEN
    RAISE EXCEPTION 'Ei kentta_tyhjennys-ehdotus';
  END IF;
  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Tyhjennys vaatii hankkeen';
  END IF;

  v_kentta := NULLIF(btrim(COALESCE(v_ehdotus.sisalto #>> '{tyhjennys,kentta}', '')), '');
  v_perustelu := NULLIF(btrim(COALESCE(v_ehdotus.sisalto #>> '{tyhjennys,perustelu}', '')), '');
  v_merkitse := COALESCE((v_ehdotus.sisalto #>> '{tyhjennys,merkitse_ei_lahdetta}')::boolean, false);
  v_taulu := COALESCE(NULLIF(v_ehdotus.sisalto #>> '{tyhjennys,taulu}', ''), 'hankkeet');
  v_rivi_id := COALESCE(
    NULLIF(v_ehdotus.sisalto #>> '{tyhjennys,rivi_id}', '')::uuid,
    v_ehdotus.hanke_id
  );

  IF v_kentta IS NULL THEN
    RAISE EXCEPTION 'Tyhjennys: kentta puuttuu';
  END IF;
  IF v_taulu <> 'hankkeet' THEN
    RAISE EXCEPTION 'Tyhjennys tuettu vain hankkeet-taululle';
  END IF;
  IF NOT kentta_tyhjennys_sallittu(v_kentta) THEN
    RAISE EXCEPTION 'Kenttää % ei voi tyhjentää', v_kentta;
  END IF;
  IF v_perustelu IS NULL OR char_length(v_perustelu) < 12 THEN
    RAISE EXCEPTION 'Perustelu vaaditaan (vähintään 12 merkkiä)';
  END IF;

  v_lahde_kentta := agentti_lahde_kentta(v_kentta);

  SELECT * INTO v_hanke
  FROM hankkeet
  WHERE id = v_rivi_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_hanke.julkaistu THEN
    RAISE EXCEPTION 'Hanketta ei löytynyt tai se ei ole julkaistu';
  END IF;

  IF v_ehdotus.hanke_id IS DISTINCT FROM v_rivi_id THEN
    RAISE EXCEPTION 'Tyhjennys: hanke_id ei täsmää';
  END IF;

  IF v_kentta IN ('sijainti', 'sijainti_lat', 'sijainti_lon', 'sijainti_alue_tyyppi') THEN
    UPDATE hankkeet
    SET
      sijainti_lat = NULL,
      sijainti_lon = NULL,
      sijainti_alue_tyyppi = NULL
    WHERE id = v_rivi_id;
    v_lahde_kentta := 'sijainti';
  ELSIF v_kentta IN ('toimija_nimi', 'toimija_organisaatio_id') THEN
    UPDATE hankkeet
    SET toimija_organisaatio_id = NULL
    WHERE id = v_rivi_id;
    v_lahde_kentta := 'toimija_organisaatio_id';
  ELSE
    UPDATE hankkeet
    SET
      maakunta = CASE WHEN v_kentta = 'maakunta' THEN NULL ELSE maakunta END,
      teho_mw = CASE WHEN v_kentta = 'teho_mw' THEN NULL ELSE teho_mw END,
      it_teho_mw = CASE WHEN v_kentta = 'it_teho_mw' THEN NULL ELSE it_teho_mw END,
      pinta_ala_ha = CASE WHEN v_kentta = 'pinta_ala_ha' THEN NULL ELSE pinta_ala_ha END,
      sahkonkaytto_twh_a = CASE WHEN v_kentta = 'sahkonkaytto_twh_a' THEN NULL ELSE sahkonkaytto_twh_a END,
      generaattorit_lkm = CASE WHEN v_kentta = 'generaattorit_lkm' THEN NULL ELSE generaattorit_lkm END,
      generaattorit_kaytossa_max_lkm = CASE
        WHEN v_kentta = 'generaattorit_kaytossa_max_lkm' THEN NULL
        ELSE generaattorit_kaytossa_max_lkm
      END,
      generaattori_polttoaineteho_mw = CASE
        WHEN v_kentta = 'generaattori_polttoaineteho_mw' THEN NULL
        ELSE generaattori_polttoaineteho_mw
      END,
      yva_diaarinumero = CASE WHEN v_kentta = 'yva_diaarinumero' THEN NULL ELSE yva_diaarinumero END,
      kaavatunnus = CASE WHEN v_kentta = 'kaavatunnus' THEN NULL ELSE kaavatunnus END,
      kortteli = CASE WHEN v_kentta = 'kortteli' THEN NULL ELSE kortteli END
    WHERE id = v_rivi_id;
  END IF;

  DELETE FROM kentta_lahteet
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_rivi_id
    AND kentta = v_lahde_kentta;

  DELETE FROM kentta_tarkistukset
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_rivi_id
    AND kentta = v_lahde_kentta;

  IF v_merkitse THEN
    INSERT INTO kentta_tarkistukset (
      taulu, rivi_id, kentta, tulos, vahvistettu_pvm, merkitty, huomautus
    )
    VALUES (
      'hankkeet',
      v_rivi_id,
      v_lahde_kentta,
      'ei_julkista_lahdetta',
      CURRENT_DATE,
      'ihmisen_vahvistama',
      v_perustelu
    )
    ON CONFLICT (taulu, rivi_id, kentta) DO UPDATE
    SET
      tulos = EXCLUDED.tulos,
      vahvistettu_pvm = EXCLUDED.vahvistettu_pvm,
      merkitty = EXCLUDED.merkitty,
      merkitty_pvm = now(),
      huomautus = EXCLUDED.huomautus;
  END IF;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    perustelu = v_perustelu
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$$;

COMMENT ON FUNCTION julkaise_kentta_tyhjennys(uuid, text) IS
  'Hyväksyy kentta_tyhjennys-ehdotuksen: NULL arvo, poistaa lähteet. Agentti ei kutsu.';

REVOKE ALL ON FUNCTION julkaise_kentta_tyhjennys(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_kentta_tyhjennys(uuid, text) TO service_role;
