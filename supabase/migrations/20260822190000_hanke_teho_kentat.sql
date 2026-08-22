-- Jokelan syöttö paljasti, että teho ja generaattorit eivät ole yksi luku.
-- Uudet kentät ovat atomisia; epävarmuus jää kentta_lahteet.luottamus-kenttään.

ALTER TABLE hankkeet
  ADD COLUMN pinta_ala_ha numeric(10, 2),
  ADD COLUMN it_teho_mw numeric(12, 3),
  ADD COLUMN sahkonkaytto_twh_a numeric(10, 3),
  ADD COLUMN generaattorit_kaytossa_max_lkm integer,
  ADD COLUMN generaattori_polttoaineteho_mw numeric(12, 3);

ALTER TABLE hankkeet
  ADD CONSTRAINT hankkeet_pinta_ala_ha_positiivinen
    CHECK (pinta_ala_ha IS NULL OR pinta_ala_ha > 0),
  ADD CONSTRAINT hankkeet_it_teho_mw_positiivinen
    CHECK (it_teho_mw IS NULL OR it_teho_mw > 0),
  ADD CONSTRAINT hankkeet_sahkonkaytto_twh_a_positiivinen
    CHECK (sahkonkaytto_twh_a IS NULL OR sahkonkaytto_twh_a > 0),
  ADD CONSTRAINT hankkeet_generaattorit_kaytossa_max_lkm_ei_neg
    CHECK (
      generaattorit_kaytossa_max_lkm IS NULL
      OR generaattorit_kaytossa_max_lkm >= 0
    ),
  ADD CONSTRAINT hankkeet_generaattori_polttoaineteho_mw_positiivinen
    CHECK (
      generaattori_polttoaineteho_mw IS NULL
      OR generaattori_polttoaineteho_mw > 0
    ),
  ADD CONSTRAINT hankkeet_generaattorit_kaytossa_ei_yli_lkm
    CHECK (
      generaattorit_lkm IS NULL
      OR generaattorit_kaytossa_max_lkm IS NULL
      OR generaattorit_kaytossa_max_lkm <= generaattorit_lkm
    );

COMMENT ON COLUMN hankkeet.teho_mw IS
  'Yleinen teholuku vain jos lähde ei erittele IT-tehoa. Erittelemätön arvo.';
COMMENT ON COLUMN hankkeet.it_teho_mw IS
  'Datakeskuksen IT-teho megawatteina, jos lähde käyttää tätä termiä.';
COMMENT ON COLUMN hankkeet.pinta_ala_ha IS
  'Hankealueen pinta-ala hehtaareina.';
COMMENT ON COLUMN hankkeet.sahkonkaytto_twh_a IS
  'Arvioitu vuotuinen sähkönkäyttö terawattitunteina vuodessa.';
COMMENT ON COLUMN hankkeet.generaattorit_kaytossa_max_lkm IS
  'Kuinka monta generaattoria voi olla käytössä yhtä aikaa.';
COMMENT ON COLUMN hankkeet.generaattori_polttoaineteho_mw IS
  'Yhden varavoimageneraattorin polttoaineteho megawatteina.';

CREATE OR REPLACE FUNCTION hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF h.nimi IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'nimi') THEN
    puuttuvat := puuttuvat || 'nimi';
  END IF;
  IF h.kunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kunta') THEN
    puuttuvat := puuttuvat || 'kunta';
  END IF;
  IF h.vaihe IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'vaihe') THEN
    puuttuvat := puuttuvat || 'vaihe';
  END IF;
  IF h.maakunta IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'maakunta') THEN
    puuttuvat := puuttuvat || 'maakunta';
  END IF;
  IF h.sijainti_lat IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
    puuttuvat := puuttuvat || 'sijainti';
  END IF;
  IF h.teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'teho_mw') THEN
    puuttuvat := puuttuvat || 'teho_mw';
  END IF;
  IF h.it_teho_mw IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'it_teho_mw') THEN
    puuttuvat := puuttuvat || 'it_teho_mw';
  END IF;
  IF h.pinta_ala_ha IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'pinta_ala_ha') THEN
    puuttuvat := puuttuvat || 'pinta_ala_ha';
  END IF;
  IF h.sahkonkaytto_twh_a IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sahkonkaytto_twh_a') THEN
    puuttuvat := puuttuvat || 'sahkonkaytto_twh_a';
  END IF;
  IF h.generaattorit_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_lkm';
  END IF;
  IF h.generaattorit_kaytossa_max_lkm IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattorit_kaytossa_max_lkm') THEN
    puuttuvat := puuttuvat || 'generaattorit_kaytossa_max_lkm';
  END IF;
  IF h.generaattori_polttoaineteho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'generaattori_polttoaineteho_mw') THEN
    puuttuvat := puuttuvat || 'generaattori_polttoaineteho_mw';
  END IF;
  IF h.toimija_organisaatio_id IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'toimija_organisaatio_id') THEN
    puuttuvat := puuttuvat || 'toimija_organisaatio_id';
  END IF;
  IF h.yva_diaarinumero IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'yva_diaarinumero') THEN
    puuttuvat := puuttuvat || 'yva_diaarinumero';
  END IF;
  RETURN puuttuvat;
END;
$$;
