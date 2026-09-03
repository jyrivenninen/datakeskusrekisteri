-- Viranomaispäätökset hankkeittain. Faktakentät: kuvaus, pvm, paattava_organisaatio_id.
-- Viimeisin päätös = suurin pvm julkaistuista riveistä.

CREATE TABLE paatokset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  kuvaus text NOT NULL,
  pvm date NOT NULL,
  paattava_organisaatio_id uuid NOT NULL REFERENCES organisaatiot (id) ON DELETE RESTRICT,
  dokumentti_id uuid REFERENCES dokumentit (id) ON DELETE RESTRICT,
  menettely_id uuid REFERENCES hanke_menettelyt (id) ON DELETE RESTRICT,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paatokset_kuvaus_ei_tyhja CHECK (char_length(trim(kuvaus)) > 0)
);

CREATE TRIGGER trg_paatokset_paivitetty
BEFORE UPDATE ON paatokset
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX paatokset_hanke_id_idx ON paatokset (hanke_id);
CREATE INDEX paatokset_pvm_idx ON paatokset (hanke_id, pvm DESC);

COMMENT ON TABLE paatokset IS
  'Julkaistu viranomaispäätös tai vastaava viranomaisratkaisu. Ei korvaa hankkeet.vaihe-kenttää.';
COMMENT ON COLUMN paatokset.pvm IS
  'Päätöksen tai ratkaisun päivä lähteessä. Ei sama kuin kentta_lahteet.vahvistettu_pvm.';
COMMENT ON COLUMN paatokset.dokumentti_id IS
  'Valinnainen linkki asiakirjarekisteriin. Lähde voi olla myös suoraan kentta_lahteet-rivillä.';
COMMENT ON COLUMN paatokset.menettely_id IS
  'Valinnainen kytkentä hanke_menettelyt-riviin.';

CREATE OR REPLACE FUNCTION tarkista_paatos_kytkenta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = NEW.paattava_organisaatio_id
      AND o.julkaistu
  ) THEN
    RAISE EXCEPTION 'paatokset viittaa julkaisemattomaan organisaatioon'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.menettely_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hanke_menettelyt m
    WHERE m.id = NEW.menettely_id
      AND m.hanke_id = NEW.hanke_id
  ) THEN
    RAISE EXCEPTION 'paatoksen menettely ei kuulu hankkeeseen'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.dokumentti_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM dokumentit d
    WHERE d.id = NEW.dokumentti_id
      AND (d.hanke_id IS NULL OR d.hanke_id = NEW.hanke_id)
  ) THEN
    RAISE EXCEPTION 'paatoksen dokumentti ei kuulu hankkeeseen'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_paatokset_kytkenta
BEFORE INSERT OR UPDATE ON paatokset
FOR EACH ROW
EXECUTE FUNCTION tarkista_paatos_kytkenta();

ALTER TABLE kentta_lahteet
  DROP CONSTRAINT kentta_lahteet_taulu_tarkistus;

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_taulu_tarkistus CHECK (
    taulu IN (
      'hankkeet',
      'maaraajat',
      'organisaatiot',
      'yhteyshenkilot',
      'hanke_kunnat',
      'hanke_menettelyt',
      'hanke_organisaatiot',
      'dokumentit',
      'hanke_johdot',
      'hanke_vaihtoehdot',
      'hanke_kuvat',
      'paatokset'
    )
  );

CREATE OR REPLACE FUNCTION paatos_puuttuvat_lahteet(p paatokset)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('paatokset', p.id, 'kuvaus') THEN
    puuttuvat := puuttuvat || 'kuvaus';
  END IF;
  IF NOT lahde_on_olemassa('paatokset', p.id, 'pvm') THEN
    puuttuvat := puuttuvat || 'pvm';
  END IF;
  IF NOT lahde_on_olemassa('paatokset', p.id, 'paattava_organisaatio_id') THEN
    puuttuvat := puuttuvat || 'paattava_organisaatio_id';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_paatoksen_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := paatos_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Paatoksen faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_paatokset_lahteet
AFTER INSERT OR UPDATE ON paatokset
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_paatoksen_lahteet();

CREATE TRIGGER trg_paatokset_poista_lahteet
BEFORE DELETE ON paatokset
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE OR REPLACE FUNCTION tarkista_kentta_lahteen_rivi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  hanke hankkeet;
  maaraika maaraajat;
  organisaatio organisaatiot;
  kunta_rivi hanke_kunnat;
  menettely hanke_menettelyt;
  hanke_org hanke_organisaatiot;
  dokumentti dokumentit;
  johto hanke_johdot;
  vaihtoehto hanke_vaihtoehdot;
  kuva hanke_kuvat;
  paatos paatokset;
  puuttuvat text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.taulu = 'hankkeet' THEN
      SELECT * INTO hanke FROM hankkeet WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_puuttuvat_lahteet(hanke);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hankkeen faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'maaraajat' THEN
      SELECT * INTO maaraika FROM maaraajat WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := maaraaja_puuttuvat_lahteet(maaraika);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Maaraajan faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'organisaatiot' THEN
      SELECT * INTO organisaatio FROM organisaatiot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := organisaatio_puuttuvat_lahteet(organisaatio);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Organisaation faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_kunnat' THEN
      SELECT * INTO kunta_rivi FROM hanke_kunnat WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_kunta_puuttuvat_lahteet(kunta_rivi);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_kunnat-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_menettelyt' THEN
      SELECT * INTO menettely FROM hanke_menettelyt WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_menettely_puuttuvat_lahteet(menettely);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_menettelyt-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_organisaatiot' THEN
      SELECT * INTO hanke_org FROM hanke_organisaatiot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_organisaatio_puuttuvat_lahteet(hanke_org);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_organisaatiot-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'dokumentit' THEN
      SELECT * INTO dokumentti FROM dokumentit WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := dokumentti_puuttuvat_lahteet(dokumentti);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Dokumentin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_johdot' THEN
      SELECT * INTO johto FROM hanke_johdot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_johto_puuttuvat_lahteet(johto);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_johdot-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_vaihtoehdot' THEN
      SELECT * INTO vaihtoehto FROM hanke_vaihtoehdot WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_vaihtoehto_puuttuvat_lahteet(vaihtoehto);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_vaihtoehdot-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'hanke_kuvat' THEN
      SELECT * INTO kuva FROM hanke_kuvat WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_kuva_puuttuvat_lahteet(kuva);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_kuvat-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF OLD.taulu = 'paatokset' THEN
      SELECT * INTO paatos FROM paatokset WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := paatos_puuttuvat_lahteet(paatos);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Paatoksen faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.taulu = 'hankkeet' AND NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanketta % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'maaraajat' AND NOT EXISTS (
    SELECT 1 FROM maaraajat WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: maaraikaa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'organisaatiot' AND NOT EXISTS (
    SELECT 1 FROM organisaatiot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: organisaatiota % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'yhteyshenkilot' AND NOT EXISTS (
    SELECT 1 FROM yhteyshenkilot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: yhteyshenkiloa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_kunnat' AND NOT EXISTS (
    SELECT 1 FROM hanke_kunnat WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_kuntaa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_menettelyt' AND NOT EXISTS (
    SELECT 1 FROM hanke_menettelyt WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_menettelya % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_organisaatiot' AND NOT EXISTS (
    SELECT 1 FROM hanke_organisaatiot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_organisaatiota % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'dokumentit' AND NOT EXISTS (
    SELECT 1 FROM dokumentit WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: dokumenttia % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_johdot' AND NOT EXISTS (
    SELECT 1 FROM hanke_johdot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_johtoa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_vaihtoehdot' AND NOT EXISTS (
    SELECT 1 FROM hanke_vaihtoehdot WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_vaihtoehtoa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'hanke_kuvat' AND NOT EXISTS (
    SELECT 1 FROM hanke_kuvat WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: hanke_kuvaa % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  ELSIF NEW.taulu = 'paatokset' AND NOT EXISTS (
    SELECT 1 FROM paatokset WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: paatosta % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NULL;
END;
$$;

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
    OR (tyyppi IN ('taydennys', 'korjaus', 'kuva', 'kentta_tarkistus', 'paatos') AND hanke_id IS NOT NULL)
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

CREATE FUNCTION julkaise_paatos(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset%ROWTYPE;
  v_paatos jsonb;
  v_lahteet jsonb;
  v_lahde jsonb;
  v_hanke_id uuid;
  v_paatos_id uuid;
  v_org_id uuid;
  v_org_lahde jsonb;
  v_kuvaus text;
  v_pvm date;
  v_dokumentti_id uuid;
  v_menettely_id uuid;
BEGIN
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Kasittelija puuttuu.';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa'
    AND tyyppi = 'paatos'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;

  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Paatosehdotukselta puuttuu hanke';
  END IF;

  v_paatos := COALESCE(v_ehdotus.sisalto -> 'paatos', '{}'::jsonb);
  v_lahteet := COALESCE(v_paatos -> 'lahteet', '[]'::jsonb);
  IF jsonb_typeof(v_lahteet) <> 'array' THEN
    RAISE EXCEPTION 'Paatoksen lahteet ovat virheelliset';
  END IF;

  v_kuvaus := NULLIF(btrim(COALESCE(v_paatos ->> 'kuvaus', '')), '');
  v_pvm := NULLIF(v_paatos ->> 'pvm', '')::date;
  v_org_id := NULLIF(v_paatos ->> 'paattava_organisaatio_id', '')::uuid;
  v_dokumentti_id := NULLIF(v_paatos ->> 'dokumentti_id', '')::uuid;
  v_menettely_id := NULLIF(v_paatos ->> 'menettely_id', '')::uuid;
  v_hanke_id := v_ehdotus.hanke_id;

  IF v_kuvaus IS NULL THEN
    RAISE EXCEPTION 'Paatokselta puuttuu kuvaus';
  END IF;
  IF v_pvm IS NULL THEN
    RAISE EXCEPTION 'Paatokselta puuttuu pvm';
  END IF;

  IF v_org_id IS NULL AND NULLIF(v_paatos ->> 'paattava_organisaatio_nimi', '') IS NOT NULL THEN
    INSERT INTO organisaatiot (nimi, tyyppi, julkaistu)
    VALUES (v_paatos ->> 'paattava_organisaatio_nimi', 'muu', true)
    RETURNING id INTO v_org_id;

    SELECT value INTO v_org_lahde
    FROM jsonb_array_elements(v_lahteet) AS t(value)
    WHERE t.value ->> 'kentta' = 'paattava_organisaatio_id'
    LIMIT 1;

    IF v_org_lahde IS NULL THEN
      RAISE EXCEPTION 'Paattavan organisaation nimelta puuttuu lahde';
    END IF;

    PERFORM tallenna_kentta_lahde(
      'organisaatiot',
      v_org_id,
      'nimi',
      v_org_lahde ->> 'lahde_url',
      NULLIF(v_org_lahde ->> 'lahde_sivu', '')::integer,
      (v_org_lahde ->> 'vahvistettu_pvm')::date,
      v_org_lahde ->> 'luottamus',
      NULLIF(v_org_lahde ->> 'lainaus', ''),
      v_org_lahde ->> 'merkitty',
      vaadi_lahde_laji(v_org_lahde)
    );
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Paatokselta puuttuu paattava organisaatio';
  END IF;

  INSERT INTO paatokset (
    hanke_id,
    kuvaus,
    pvm,
    paattava_organisaatio_id,
    dokumentti_id,
    menettely_id,
    julkaistu
  )
  VALUES (
    v_hanke_id,
    v_kuvaus,
    v_pvm,
    v_org_id,
    v_dokumentti_id,
    v_menettely_id,
    true
  )
  RETURNING id INTO v_paatos_id;

  FOR v_lahde IN SELECT value FROM jsonb_array_elements(v_lahteet)
  LOOP
    PERFORM tallenna_kentta_lahde(
      'paatokset',
      v_paatos_id,
      v_lahde ->> 'kentta',
      v_lahde ->> 'lahde_url',
      NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
      (v_lahde ->> 'vahvistettu_pvm')::date,
      v_lahde ->> 'luottamus',
      NULLIF(v_lahde ->> 'lainaus', ''),
      v_lahde ->> 'merkitty',
      vaadi_lahde_laji(v_lahde)
    );
  END LOOP;

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

  RETURN v_paatos_id;
END;
$$;

COMMENT ON FUNCTION julkaise_paatos(uuid, text) IS
  'Hyväksyy paatos-ehdotuksen. Agentti ei kutsu tätä.';

ALTER TABLE paatokset ENABLE ROW LEVEL SECURITY;

CREATE POLICY paatokset_julkinen_luku
ON paatokset
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = paatokset.hanke_id
      AND h.julkaistu
  )
  AND EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = paatokset.paattava_organisaatio_id
      AND o.julkaistu
  )
);

DROP POLICY kentta_lahteet_julkinen_luku ON kentta_lahteet;

CREATE POLICY kentta_lahteet_julkinen_luku
ON kentta_lahteet
FOR SELECT
TO anon, authenticated
USING (
  (taulu = 'hankkeet' AND EXISTS (
    SELECT 1 FROM hankkeet h WHERE h.id = rivi_id AND h.julkaistu
  ))
  OR (taulu = 'maaraajat' AND EXISTS (
    SELECT 1 FROM maaraajat m
    JOIN hankkeet h ON h.id = m.hanke_id
    WHERE m.id = rivi_id AND m.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'organisaatiot' AND EXISTS (
    SELECT 1 FROM organisaatiot o WHERE o.id = rivi_id AND o.julkaistu
  ))
  OR (taulu = 'yhteyshenkilot' AND EXISTS (
    SELECT 1 FROM yhteyshenkilot y WHERE y.id = rivi_id AND y.julkaistu
  ))
  OR (taulu = 'hanke_kunnat' AND EXISTS (
    SELECT 1 FROM hanke_kunnat k
    JOIN hankkeet h ON h.id = k.hanke_id
    WHERE k.id = rivi_id AND k.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_menettelyt' AND EXISTS (
    SELECT 1 FROM hanke_menettelyt m
    JOIN hankkeet h ON h.id = m.hanke_id
    WHERE m.id = rivi_id AND m.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_organisaatiot' AND EXISTS (
    SELECT 1 FROM hanke_organisaatiot r
    JOIN hankkeet h ON h.id = r.hanke_id
    JOIN organisaatiot o ON o.id = r.organisaatio_id
    WHERE r.id = rivi_id AND r.julkaistu AND h.julkaistu AND o.julkaistu
  ))
  OR (taulu = 'dokumentit' AND EXISTS (
    SELECT 1 FROM dokumentit d
    WHERE d.id = rivi_id AND d.julkaistu
  ))
  OR (taulu = 'hanke_johdot' AND EXISTS (
    SELECT 1 FROM hanke_johdot j
    JOIN hankkeet h ON h.id = j.hanke_id
    WHERE j.id = rivi_id AND j.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_vaihtoehdot' AND EXISTS (
    SELECT 1 FROM hanke_vaihtoehdot v
    JOIN hankkeet h ON h.id = v.hanke_id
    WHERE v.id = rivi_id AND v.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_kuvat' AND EXISTS (
    SELECT 1 FROM hanke_kuvat k
    JOIN hankkeet h ON h.id = k.hanke_id
    WHERE k.id = rivi_id AND k.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'paatokset' AND EXISTS (
    SELECT 1 FROM paatokset p
    JOIN hankkeet h ON h.id = p.hanke_id
    JOIN organisaatiot o ON o.id = p.paattava_organisaatio_id
    WHERE p.id = rivi_id AND p.julkaistu AND h.julkaistu AND o.julkaistu
  ))
);

REVOKE ALL ON paatokset FROM anon, authenticated;
GRANT SELECT ON paatokset TO anon, authenticated;

REVOKE ALL ON FUNCTION julkaise_paatos(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION julkaise_paatos(uuid, text) TO service_role;
