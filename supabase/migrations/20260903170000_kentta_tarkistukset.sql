-- Tyhjä faktakenttä voi olla tarkistettu ilman julkista lähdettä.
-- Ei muuta hanke_puuttuvat_lahteet-triggeriä: arvollinen kenttä vaatii yhä
-- kentta_lahteet-rivin. Tämä taulu on vain NULL-kentille.
-- Ei poisto-oikeutta. Päivitys UPSERT:llä hyväksynnän kautta.

CREATE TABLE kentta_tarkistukset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taulu text NOT NULL,
  rivi_id uuid NOT NULL,
  kentta text NOT NULL,
  tulos text NOT NULL,
  vahvistettu_pvm date NOT NULL,
  merkitty text NOT NULL,
  merkitty_pvm timestamptz NOT NULL DEFAULT now(),
  huomautus text,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kentta_tarkistukset_taulu_tarkistus CHECK (
    taulu IN (
      'hankkeet',
      'hanke_vaihtoehdot'
    )
  ),
  CONSTRAINT kentta_tarkistukset_kentta_ei_tyhja CHECK (char_length(trim(kentta)) > 0),
  CONSTRAINT kentta_tarkistukset_tulos_tarkistus CHECK (
    tulos IN ('ei_julkista_lahdetta')
  ),
  CONSTRAINT kentta_tarkistukset_merkitty_tarkistus CHECK (
    merkitty IN ('koneen_ehdottama', 'ihmisen_vahvistama')
  ),
  CONSTRAINT kentta_tarkistukset_huomautus_ei_tyhja CHECK (
    huomautus IS NULL OR char_length(trim(huomautus)) > 0
  ),
  CONSTRAINT kentta_tarkistukset_kentta_kerran UNIQUE (taulu, rivi_id, kentta)
);

CREATE INDEX kentta_tarkistukset_kohde_idx
  ON kentta_tarkistukset (taulu, rivi_id, kentta);

COMMENT ON TABLE kentta_tarkistukset IS
  'Tarkistus tyhjälle kentälle: julkista lähdettä ei ole. Ei ole faktaväite eikä korvaa kentta_lahteet-riviä.';
COMMENT ON COLUMN kentta_tarkistukset.tulos IS
  'ei_julkista_lahdetta = kenttä on käyty läpi, arvoa ei merkitty.';
COMMENT ON COLUMN kentta_tarkistukset.vahvistettu_pvm IS
  'Milloin tarkistus tehtiin rekisterissä. 7A.4 käyttää tätä, jotta sama tyhjä kenttä ei nouse uudelleen.';

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
    OR (tyyppi IN ('taydennys', 'korjaus', 'kuva', 'kentta_tarkistus') AND hanke_id IS NOT NULL)
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

CREATE FUNCTION hanke_kentta_on_tyhja(p_hanke hankkeet, p_kentta text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN CASE p_kentta
    WHEN 'maakunta' THEN p_hanke.maakunta IS NULL
    WHEN 'sijainti' THEN
      p_hanke.sijainti_lat IS NULL
      AND p_hanke.sijainti_lon IS NULL
      AND p_hanke.sijainti_alue IS NULL
    WHEN 'teho_mw' THEN p_hanke.teho_mw IS NULL
    WHEN 'it_teho_mw' THEN p_hanke.it_teho_mw IS NULL
    WHEN 'pinta_ala_ha' THEN p_hanke.pinta_ala_ha IS NULL
    WHEN 'sahkonkaytto_twh_a' THEN p_hanke.sahkonkaytto_twh_a IS NULL
    WHEN 'generaattorit_lkm' THEN p_hanke.generaattorit_lkm IS NULL
    WHEN 'generaattorit_kaytossa_max_lkm' THEN p_hanke.generaattorit_kaytossa_max_lkm IS NULL
    WHEN 'generaattori_polttoaineteho_mw' THEN p_hanke.generaattori_polttoaineteho_mw IS NULL
    WHEN 'toimija_organisaatio_id' THEN p_hanke.toimija_organisaatio_id IS NULL
    WHEN 'yva_diaarinumero' THEN p_hanke.yva_diaarinumero IS NULL
    WHEN 'kaavatunnus' THEN p_hanke.kaavatunnus IS NULL
    WHEN 'kortteli' THEN p_hanke.kortteli IS NULL
    ELSE NULL
  END;
END;
$$;

COMMENT ON FUNCTION hanke_kentta_on_tyhja(hankkeet, text) IS
  'TRUE jos ehdollinen hankekenttä on tyhjä. NULL jos kenttää ei saa merkitä lähteettömäksi (nimi, kunta, vaihe).';

CREATE FUNCTION julkaise_kentta_tarkistus(
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
  v_taulu text;
  v_rivi_id uuid;
  v_kentta text;
  v_tulos text;
  v_huomautus text;
  v_hanke hankkeet%ROWTYPE;
  v_tyhja boolean;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'kentta_tarkistus'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  v_taulu := v_ehdotus.sisalto #>> '{tarkistus,taulu}';
  v_rivi_id := NULLIF(v_ehdotus.sisalto #>> '{tarkistus,rivi_id}', '')::uuid;
  v_kentta := NULLIF(btrim(COALESCE(v_ehdotus.sisalto #>> '{tarkistus,kentta}', '')), '');
  v_tulos := COALESCE(v_ehdotus.sisalto #>> '{tarkistus,tulos}', 'ei_julkista_lahdetta');
  v_huomautus := NULLIF(btrim(COALESCE(v_ehdotus.sisalto #>> '{tarkistus,huomautus}', '')), '');

  IF v_taulu IS DISTINCT FROM 'hankkeet' THEN
    RAISE EXCEPTION 'Tarkistus on toistaiseksi vain hankekentille.';
  END IF;
  IF v_rivi_id IS NULL OR v_kentta IS NULL THEN
    RAISE EXCEPTION 'Tarkistukselta puuttuu kenttä.';
  END IF;
  IF v_tulos IS DISTINCT FROM 'ei_julkista_lahdetta' THEN
    RAISE EXCEPTION 'Tulos ei ole sallittu.';
  END IF;
  IF v_ehdotus.hanke_id IS DISTINCT FROM v_rivi_id THEN
    RAISE EXCEPTION 'Tarkistuksen hanke ei täsmää.';
  END IF;

  SELECT * INTO v_hanke
  FROM hankkeet
  WHERE id = v_rivi_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanketta ei löytynyt.';
  END IF;

  v_tyhja := hanke_kentta_on_tyhja(v_hanke, v_kentta);
  IF v_tyhja IS NULL THEN
    RAISE EXCEPTION 'Kenttää ei voi merkitä ilman lähdettä.';
  END IF;
  IF NOT v_tyhja THEN
    RAISE EXCEPTION 'Kentässä on jo arvo; merkitse lähde, älä lähteettömyyttä.';
  END IF;

  INSERT INTO kentta_tarkistukset (
    taulu, rivi_id, kentta, tulos, vahvistettu_pvm, merkitty, huomautus
  )
  VALUES (
    v_taulu,
    v_rivi_id,
    v_kentta,
    v_tulos,
    CURRENT_DATE,
    'ihmisen_vahvistama',
    v_huomautus
  )
  ON CONFLICT (taulu, rivi_id, kentta) DO UPDATE
  SET
    tulos = EXCLUDED.tulos,
    vahvistettu_pvm = EXCLUDED.vahvistettu_pvm,
    merkitty = EXCLUDED.merkitty,
    merkitty_pvm = now(),
    huomautus = EXCLUDED.huomautus;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$$;

COMMENT ON FUNCTION julkaise_kentta_tarkistus(uuid, text) IS
  'Hyväksyy kentta_tarkistus-ehdotuksen. Ei kirjoita hankkeet-taulun arvoja. Agentti ei kutsu tätä.';

ALTER TABLE kentta_tarkistukset ENABLE ROW LEVEL SECURITY;

CREATE POLICY kentta_tarkistukset_julkinen_luku
ON kentta_tarkistukset
FOR SELECT
TO anon, authenticated
USING (
  taulu = 'hankkeet'
  AND EXISTS (
    SELECT 1 FROM hankkeet h WHERE h.id = rivi_id AND h.julkaistu
  )
);

REVOKE ALL ON kentta_tarkistukset FROM anon, authenticated;
GRANT SELECT ON kentta_tarkistukset TO anon, authenticated;

REVOKE ALL ON FUNCTION julkaise_kentta_tarkistus(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION julkaise_kentta_tarkistus(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION hanke_kentta_on_tyhja(hankkeet, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hanke_kentta_on_tyhja(hankkeet, text) TO service_role;
