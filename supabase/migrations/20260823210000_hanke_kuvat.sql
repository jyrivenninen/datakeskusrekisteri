-- Hankkeen valokuvat URL-osoitteesta. Julkaisu vain hyväksynnän tai
-- ylläpitäjän kautta; lähde pakollinen kuva_url-, kuvateksti- ja kuvaaja-kentille.

CREATE TABLE hanke_kuvat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  kuva_url text NOT NULL,
  kuvateksti text NOT NULL,
  kuvaaja text NOT NULL,
  jarjestys integer NOT NULL DEFAULT 0,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_kuvat_url_https CHECK (kuva_url ~ '^https://'),
  CONSTRAINT hanke_kuvat_kuvateksti_ei_tyhja CHECK (char_length(trim(kuvateksti)) > 0),
  CONSTRAINT hanke_kuvat_kuvaaja_ei_tyhja CHECK (char_length(trim(kuvaaja)) > 0),
  CONSTRAINT hanke_kuvat_jarjestys_ei_negatiivinen CHECK (jarjestys >= 0)
);

CREATE TRIGGER trg_hanke_kuvat_paivitetty
BEFORE UPDATE ON hanke_kuvat
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_kuvat_hanke_id_idx ON hanke_kuvat (hanke_id, jarjestys);

COMMENT ON TABLE hanke_kuvat IS
  'Hankkeen galleriakuvat. Tiedosto haetaan kuva_url-osoitteesta; rekisteri ei tallenna kuvatiedostoa.';
COMMENT ON COLUMN hanke_kuvat.kuva_url IS
  'Julkinen https-osoite kuvatiedostoon. Lähde merkitään kentta_lahteet-tauluun.';
COMMENT ON COLUMN hanke_kuvat.kuvaaja IS
  'Valokuvaajan tai kuvan oikeudenhaltijan nimi lähteen mukaan.';

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
      'hanke_kuvat'
    )
  );

CREATE OR REPLACE FUNCTION hanke_kuva_puuttuvat_lahteet(r hanke_kuvat)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_kuvat', r.id, 'kuva_url') THEN
    puuttuvat := puuttuvat || 'kuva_url';
  END IF;
  IF NOT lahde_on_olemassa('hanke_kuvat', r.id, 'kuvateksti') THEN
    puuttuvat := puuttuvat || 'kuvateksti';
  END IF;
  IF NOT lahde_on_olemassa('hanke_kuvat', r.id, 'kuvaaja') THEN
    puuttuvat := puuttuvat || 'kuvaaja';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_hanke_kuvan_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_kuva_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_kuvat-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_kuvat_lahteet
AFTER INSERT OR UPDATE ON hanke_kuvat
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_kuvan_lahteet();

CREATE TRIGGER trg_hanke_kuvat_poista_lahteet
BEFORE DELETE ON hanke_kuvat
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_tyyppi_tarkistus;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_tyyppi_tarkistus CHECK (
    tyyppi IN ('uusi_hanke', 'taydennys', 'korjaus', 'kuva')
  );

ALTER TABLE muutosehdotukset
  DROP CONSTRAINT muutosehdotukset_uusi_ilman_hanketta;

ALTER TABLE muutosehdotukset
  ADD CONSTRAINT muutosehdotukset_uusi_ilman_hanketta CHECK (
    (tyyppi = 'uusi_hanke' AND hanke_id IS NULL)
    OR (tyyppi IN ('taydennys', 'korjaus', 'kuva') AND hanke_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION tarkista_kentta_lahteen_rivi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  END IF;

  RETURN NULL;
END;
$$;

CREATE FUNCTION julkaise_hanke_kuvat(
  p_hanke_id uuid,
  p_kuvat jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kuva jsonb;
  v_lahde jsonb;
  v_kuva_id uuid;
  v_jarjestys integer;
BEGIN
  IF p_hanke_id IS NULL THEN
    RAISE EXCEPTION 'Kuvaehdotuksella on oltava hanke';
  END IF;
  IF jsonb_typeof(COALESCE(p_kuvat, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_kuvat, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Kuvaehdotuksessa ei ole kuvia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hankkeet WHERE id = p_hanke_id AND julkaistu) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  SELECT COALESCE(MAX(jarjestys), -1) + 1 INTO v_jarjestys
  FROM hanke_kuvat
  WHERE hanke_id = p_hanke_id;

  FOR v_kuva IN SELECT value FROM jsonb_array_elements(p_kuvat)
  LOOP
    IF NULLIF(btrim(COALESCE(v_kuva ->> 'kuva_url', '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(v_kuva ->> 'kuvateksti', '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(v_kuva ->> 'kuvaaja', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Kuvasta puuttuu osoite, kuvateksti tai kuvaaja';
    END IF;

    INSERT INTO hanke_kuvat (
      hanke_id, kuva_url, kuvateksti, kuvaaja, jarjestys, julkaistu
    )
    VALUES (
      p_hanke_id,
      btrim(v_kuva ->> 'kuva_url'),
      btrim(v_kuva ->> 'kuvateksti'),
      btrim(v_kuva ->> 'kuvaaja'),
      v_jarjestys,
      true
    )
    RETURNING id INTO v_kuva_id;

    v_jarjestys := v_jarjestys + 1;

    FOR v_lahde IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_kuva -> 'lahteet', '[]'::jsonb))
    LOOP
      IF v_lahde ->> 'kentta' NOT IN ('kuva_url', 'kuvateksti', 'kuvaaja') THEN
        RAISE EXCEPTION 'Kuvan kentta ei ole sallittu: %', v_lahde ->> 'kentta';
      END IF;
      INSERT INTO kentta_lahteet (
        taulu, rivi_id, kentta, lahde_url, lahde_sivu,
        vahvistettu_pvm, luottamus, lainaus, merkitty
      )
      VALUES (
        'hanke_kuvat',
        v_kuva_id,
        v_lahde ->> 'kentta',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty'
      );
    END LOOP;
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    hanke_id = p_hanke_id
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;

  RETURN p_hanke_id;
END;
$$;

REVOKE ALL ON FUNCTION julkaise_hanke_kuvat(uuid, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION julkaise_hanke_kuvat(uuid, jsonb, uuid, text)
  TO service_role;

ALTER TABLE hanke_kuvat ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_kuvat_julkinen_luku
ON hanke_kuvat
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_kuvat.hanke_id
      AND h.julkaistu
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
);

REVOKE ALL ON hanke_kuvat FROM anon, authenticated;
GRANT SELECT ON hanke_kuvat TO anon, authenticated;
