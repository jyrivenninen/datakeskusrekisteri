-- IT-teho ja laitoksen teho, rakentamisvaiheet, maakunnan lähdepakko,
-- HTML-entiteetit ja tehojonot. hanke_vaihtoehdot jää YVA-vaihtoehdoille.

COMMENT ON COLUMN hankkeet.it_teho_mw IS
  'Datakeskuksen IT-kuorma megawatteina. Vain jos lähde sanoo IT capacity tai IT load. Aina pienempi tai yhtä suuri kuin teho_mw, kun molemmat on merkitty. Erittelemätön megawattiluku merkitään vain yhteen kenttään.';

COMMENT ON COLUMN hankkeet.teho_mw IS
  'Koko laitoksen sähköteho megawatteina. Erittelemätön megawattiluku, jota lähde ei kutsu IT-kuormaksi, merkitään vain tähän kenttään.';

COMMENT ON COLUMN hankkeet.maakunta IS
  'Maakunta johdetaan kunnasta (kunnat-taulu). Kenttä ei vaadi omaa lähdettä.';

-- Olemassa olevat rivit, joilla IT-teho on suurempi kuin teho, jäävät.
-- Tarkistus koskee vain teho-sarakkeiden kirjoitusta, joten muu päivitys onnistuu.
CREATE OR REPLACE FUNCTION tarkista_it_teho_ei_yli_tehoa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.it_teho_mw IS NULL
    OR NEW.teho_mw IS NULL
    OR NEW.it_teho_mw <= NEW.teho_mw THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.it_teho_mw IS NOT DISTINCT FROM OLD.it_teho_mw
    AND NEW.teho_mw IS NOT DISTINCT FROM OLD.teho_mw THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'IT-teho (%) ei voi olla suurempi kuin laitoksen teho (%)',
    NEW.it_teho_mw, NEW.teho_mw
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_hankkeet_it_teho_suhde
BEFORE INSERT OR UPDATE OF it_teho_mw, teho_mw ON hankkeet
FOR EACH ROW
EXECUTE FUNCTION tarkista_it_teho_ei_yli_tehoa();

CREATE TRIGGER trg_hanke_vaihtoehdot_it_teho_suhde
BEFORE INSERT OR UPDATE OF it_teho_mw, teho_mw ON hanke_vaihtoehdot
FOR EACH ROW
EXECUTE FUNCTION tarkista_it_teho_ei_yli_tehoa();

CREATE OR REPLACE FUNCTION hanke_puuttuvat_lahteet(h hankkeet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  IF (h.sijainti_lat IS NOT NULL OR h.sijainti_alue IS NOT NULL)
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'sijainti') THEN
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
  IF h.kaavatunnus IS NOT NULL
    AND NOT lahde_on_olemassa('hankkeet', h.id, 'kaavatunnus') THEN
    puuttuvat := puuttuvat || 'kaavatunnus';
  END IF;
  IF h.kortteli IS NOT NULL AND NOT lahde_on_olemassa('hankkeet', h.id, 'kortteli') THEN
    puuttuvat := puuttuvat || 'kortteli';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE TABLE hanke_rakentamisvaiheet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hanke_id uuid NOT NULL REFERENCES hankkeet (id) ON DELETE RESTRICT,
  jarjestys integer NOT NULL,
  nimi text NOT NULL,
  it_teho_mw numeric(12, 3),
  teho_mw numeric(12, 3),
  tila text NOT NULL,
  julkaistu boolean NOT NULL DEFAULT true,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_rakentamisvaiheet_jarjestys_positiivinen CHECK (jarjestys > 0),
  CONSTRAINT hanke_rakentamisvaiheet_jarjestys_uniikki UNIQUE (hanke_id, jarjestys),
  CONSTRAINT hanke_rakentamisvaiheet_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0),
  CONSTRAINT hanke_rakentamisvaiheet_tila_tarkistus CHECK (
    tila IN ('suunniteltu', 'rakenteilla', 'kaytossa')
  ),
  CONSTRAINT hanke_rakentamisvaiheet_teho_mw_positiivinen CHECK (
    teho_mw IS NULL OR teho_mw > 0
  ),
  CONSTRAINT hanke_rakentamisvaiheet_it_teho_mw_positiivinen CHECK (
    it_teho_mw IS NULL OR it_teho_mw > 0
  ),
  CONSTRAINT hanke_rakentamisvaiheet_it_teho_ei_yli_tehoa CHECK (
    it_teho_mw IS NULL OR teho_mw IS NULL OR it_teho_mw <= teho_mw
  )
);

CREATE TRIGGER trg_hanke_rakentamisvaiheet_paivitetty
BEFORE UPDATE ON hanke_rakentamisvaiheet
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

CREATE INDEX hanke_rakentamisvaiheet_hanke_id_idx
  ON hanke_rakentamisvaiheet (hanke_id);

COMMENT ON TABLE hanke_rakentamisvaiheet IS
  'Hankkeen peräkkäiset rakentamisvaiheet. YVA-vaihtoehdot (hanke_vaihtoehdot) ovat toisensa poissulkevia suunnitelmia; rakentamisvaiheet seuraavat toisiaan. Hanketason it_teho_mw ja teho_mw jäävät koko hankkeen luvuiksi, kun lähde sellaisen sanoo.';

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
      'paatokset',
      'hanke_rakentamisvaiheet'
    )
  );

CREATE OR REPLACE FUNCTION hanke_rakentamisvaihe_puuttuvat_lahteet(r hanke_rakentamisvaiheet)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[] := ARRAY[]::text[];
BEGIN
  IF NOT lahde_on_olemassa('hanke_rakentamisvaiheet', r.id, 'nimi') THEN
    puuttuvat := puuttuvat || 'nimi';
  END IF;
  IF NOT lahde_on_olemassa('hanke_rakentamisvaiheet', r.id, 'tila') THEN
    puuttuvat := puuttuvat || 'tila';
  END IF;
  IF r.it_teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_rakentamisvaiheet', r.id, 'it_teho_mw') THEN
    puuttuvat := puuttuvat || 'it_teho_mw';
  END IF;
  IF r.teho_mw IS NOT NULL
    AND NOT lahde_on_olemassa('hanke_rakentamisvaiheet', r.id, 'teho_mw') THEN
    puuttuvat := puuttuvat || 'teho_mw';
  END IF;
  RETURN puuttuvat;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_hanke_rakentamisvaiheen_lahteet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  puuttuvat text[];
BEGIN
  puuttuvat := hanke_rakentamisvaihe_puuttuvat_lahteet(NEW);
  IF cardinality(puuttuvat) > 0 THEN
    RAISE EXCEPTION 'Hanke_rakentamisvaiheet-rivin faktakentilta puuttuu lahde: %',
      array_to_string(puuttuvat, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_hanke_rakentamisvaiheet_lahteet
AFTER INSERT OR UPDATE ON hanke_rakentamisvaiheet
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_hanke_rakentamisvaiheen_lahteet();

CREATE TRIGGER trg_hanke_rakentamisvaiheet_poista_lahteet
BEFORE DELETE ON hanke_rakentamisvaiheet
FOR EACH ROW
EXECUTE FUNCTION poista_rivin_lahteet();

CREATE OR REPLACE FUNCTION tarkista_rakentamisvaiheen_lahde_kytkenta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  vaihe hanke_rakentamisvaiheet;
  puuttuvat text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.taulu = 'hanke_rakentamisvaiheet' THEN
      SELECT * INTO vaihe FROM hanke_rakentamisvaiheet WHERE id = OLD.rivi_id;
      IF FOUND THEN
        puuttuvat := hanke_rakentamisvaihe_puuttuvat_lahteet(vaihe);
        IF cardinality(puuttuvat) > 0 THEN
          RAISE EXCEPTION 'Hanke_rakentamisvaiheet-rivin faktakentilta puuttuu lahde: %',
            array_to_string(puuttuvat, ', ')
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.taulu = 'hanke_rakentamisvaiheet' AND NOT EXISTS (
    SELECT 1 FROM hanke_rakentamisvaiheet WHERE id = NEW.rivi_id
  ) THEN
    RAISE EXCEPTION 'kentta_lahteet: rakentamisvaihetta % ei ole', NEW.rivi_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_kentta_lahteet_rakentamisvaihe
AFTER INSERT OR DELETE OR UPDATE ON kentta_lahteet
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION tarkista_rakentamisvaiheen_lahde_kytkenta();

ALTER TABLE hanke_rakentamisvaiheet ENABLE ROW LEVEL SECURITY;

CREATE POLICY hanke_rakentamisvaiheet_julkinen_luku
ON hanke_rakentamisvaiheet
FOR SELECT
TO anon, authenticated
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_rakentamisvaiheet.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_rakentamisvaiheet_agentti_luku
ON hanke_rakentamisvaiheet
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_rakentamisvaiheet.hanke_id
      AND h.julkaistu
  )
);

REVOKE ALL ON hanke_rakentamisvaiheet FROM anon, authenticated, agentti;
GRANT SELECT ON hanke_rakentamisvaiheet TO anon, authenticated, agentti;

DROP POLICY kentta_lahteet_julkinen_luku ON kentta_lahteet;
DROP POLICY kentta_lahteet_agentti_luku ON kentta_lahteet;

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
  OR (taulu = 'hanke_rakentamisvaiheet' AND EXISTS (
    SELECT 1 FROM hanke_rakentamisvaiheet v
    JOIN hankkeet h ON h.id = v.hanke_id
    WHERE v.id = rivi_id AND v.julkaistu AND h.julkaistu
  ))
);

CREATE POLICY kentta_lahteet_agentti_luku
ON kentta_lahteet
FOR SELECT
TO agentti
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
  OR (taulu = 'hanke_rakentamisvaiheet' AND EXISTS (
    SELECT 1 FROM hanke_rakentamisvaiheet v
    JOIN hankkeet h ON h.id = v.hanke_id
    WHERE v.id = rivi_id AND v.julkaistu AND h.julkaistu
  ))
);

CREATE OR REPLACE FUNCTION pura_html_entiteetit(p_teksti text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  t text := p_teksti;
  osuma text[];
  koodi int;
  hex text;
  i int;
  merkki text;
  kierros int := 0;
  nimetyt jsonb := jsonb_build_object(
    'amp', '&',
    'lt', '<',
    'gt', '>',
    'quot', '"',
    'apos', '''',
    'nbsp', ' ',
    'auml', 'ä',
    'ouml', 'ö',
    'uuml', 'ü',
    'aring', 'å',
    'Auml', 'Ä',
    'Ouml', 'Ö',
    'Uuml', 'Ü',
    'Aring', 'Å',
    'raquo', '»',
    'laquo', '«',
    'ndash', '–',
    'mdash', '—'
  );
BEGIN
  IF t IS NULL OR position('&' IN t) = 0 THEN
    RETURN t;
  END IF;

  WHILE kierros < 3 AND t ~ '&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);' LOOP
    kierros := kierros + 1;

    WHILE t ~ '&#[0-9]+;' LOOP
      osuma := regexp_match(t, '&#([0-9]+);');
      EXIT WHEN osuma IS NULL;
      koodi := osuma[1]::int;
      EXIT WHEN koodi < 1 OR koodi > 1114111;
      t := regexp_replace(t, '&#' || osuma[1] || ';', chr(koodi));
    END LOOP;

    WHILE t ~ '&#x[0-9A-Fa-f]+;' LOOP
      osuma := regexp_match(t, '&#x([0-9A-Fa-f]+);');
      EXIT WHEN osuma IS NULL;
      hex := lower(osuma[1]);
      koodi := 0;
      FOR i IN 1..length(hex) LOOP
        merkki := substr(hex, i, 1);
        koodi := koodi * 16 + position(merkki IN '0123456789abcdef') - 1;
      END LOOP;
      EXIT WHEN koodi < 1 OR koodi > 1114111;
      t := regexp_replace(t, '&#x' || osuma[1] || ';', chr(koodi), 'i');
    END LOOP;

    WHILE t ~ '&[A-Za-z][A-Za-z0-9]+;' LOOP
      osuma := regexp_match(t, '&([A-Za-z][A-Za-z0-9]+);');
      EXIT WHEN osuma IS NULL OR NOT nimetyt ? osuma[1];
      t := replace(t, '&' || osuma[1] || ';', nimetyt ->> osuma[1]);
    END LOOP;
  END LOOP;

  RETURN t;
END;
$$;

CREATE OR REPLACE FUNCTION dokumentit_pura_otsikon_entiteetit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.otsikko IS NOT NULL THEN
    NEW.otsikko := pura_html_entiteetit(NEW.otsikko);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dokumentit_otsikko_entiteetit
BEFORE INSERT OR UPDATE OF otsikko ON dokumentit
FOR EACH ROW
EXECUTE FUNCTION dokumentit_pura_otsikon_entiteetit();

UPDATE dokumentit
SET otsikko = pura_html_entiteetit(otsikko)
WHERE otsikko ~ '&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);';

DELETE FROM kentta_lahteet
WHERE taulu = 'hankkeet'
  AND kentta = 'maakunta'
  AND lahde_url ILIKE '%wikipedia.org%';

INSERT INTO muutosehdotukset (
  tyyppi,
  hanke_id,
  ehdottaja_tyyppi,
  ehdottaja_tunniste,
  sisalto,
  tila,
  lahde_url,
  huomautus
)
SELECT
  'korjaus',
  p.id,
  'yllapitaja',
  'ylläpito',
  jsonb_build_object('kentat', '{}'::jsonb, 'huomio', 'erittelemattoman tehon kenttavalinta'),
  'odottaa',
  p.lahde_url,
  'Erittelemätön teho odottaa: molemmissa kentissä on sama luku samasta lähteestä. Luku jää yhteen kenttään. Valitse kenttä lähteen sanan mukaan. Jos lähde sanoo IT capacity tai IT load, kenttä on it_teho_mw. Muuten teho_mw. Toista kenttää ei tyhjennetä ennen kuin sana on luettu.'
FROM (
  SELECT DISTINCT ON (h.id) h.id, t.lahde_url
  FROM hankkeet h
  JOIN kentta_lahteet t
    ON t.taulu = 'hankkeet' AND t.rivi_id = h.id AND t.kentta = 'teho_mw'
  JOIN kentta_lahteet i
    ON i.taulu = 'hankkeet'
    AND i.rivi_id = h.id
    AND i.kentta = 'it_teho_mw'
    AND i.lahde_url = t.lahde_url
  WHERE h.julkaistu
    AND h.yhdistetty_kohde_id IS NULL
    AND h.teho_mw IS NOT NULL
    AND h.it_teho_mw IS NOT NULL
    AND h.teho_mw = h.it_teho_mw
  ORDER BY h.id, t.lahde_url
) p;

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
SELECT
  'korjaus',
  h.id,
  'yllapitaja',
  'ylläpito',
  jsonb_build_object('kentat', '{}'::jsonb, 'huomio', 'rakentamisvaihe'),
  'odottaa',
  (
    SELECT k.lahde_url
    FROM kentta_lahteet k
    WHERE k.taulu = 'hankkeet' AND k.rivi_id = h.id AND k.kentta = 'teho_mw'
    ORDER BY k.luotu_pvm
    LIMIT 1
  ),
  CASE h.nimi
    WHEN 'Lahden datakeskus, Kiveriö (DayOne)' THEN
      'Rakentamisvaihe odottaa: teho 50 on ensimmäisen rakennuksen IT-teho, ei koko laitoksen sähkötehoa. IT-teho 128 on täyden rakentamisen luku. Kirjaa vaiheet tauluun hanke_rakentamisvaiheet, kun lähde on luettu. Hanketason luku jää koko hankkeen luvuksi vain jos lähde sen sanoo. Hyväksy-painike ei vielä luo vaiheriviä.'
    WHEN 'Forssan datakeskus' THEN
      'Rakentamisvaihe odottaa: teho 81 ja IT-teho 450 ovat sama kuvio kuin vaihe ja tavoite. IT-teho on suurempi kuin teho. Älä korjaa lukuja tästä jonosta automaattisesti. Lue lähde ja kirjaa rakentamisvaihe, jos 81 MW on vaiheen luku. Hyväksy-painike ei vielä luo vaiheriviä.'
    WHEN 'Campus Oulu, Kaapelitie 4 (Rusko)' THEN
      'Rakentamisvaihe odottaa: 8 MW on ensimmäinen vaihe, 300 MW on kampuksen laajennusvara. Laskuri käyttää nyt 8 MW:a. Kirjaa ensimmäinen vaihe tauluun hanke_rakentamisvaiheet. Tavoitetta ja vaihetta ei lasketa yhteen. Hyväksy-painike ei vielä luo vaiheriviä.'
    WHEN 'Espoon datakeskusalue' THEN
      'Rakentamisvaihe odottaa: 265 ja 172,8 on merkitty samasta YVA-ohjelmasta, lainaukset ovat tyhjiä. Lähde pitää lukea ennen kuin luvut jaetaan rakentamisvaiheisiin. Älä täytä lainausta tästä jonosta. Hyväksy-painike ei vielä luo vaiheriviä.'
  END
FROM hankkeet h
WHERE h.julkaistu
  AND h.nimi IN (
    'Lahden datakeskus, Kiveriö (DayOne)',
    'Forssan datakeskus',
    'Campus Oulu, Kaapelitie 4 (Rusko)',
    'Espoon datakeskusalue'
  );

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
SELECT
  'korjaus',
  h.id,
  'yllapitaja',
  'ylläpito',
  jsonb_build_object('kentat', '{}'::jsonb, 'huomio', 'wikipedia-it-teho'),
  'odottaa',
  k.lahde_url,
  'Wikipedia-IT-teho odottaa: IT-teho nojaa Wikipediaan (lainaus: Power 7.1 MW). Lähderiviä ei poisteta automaattisesti. Korvaa toimijan tai viranomaisen lähteellä tai tyhjennä, jos lukua ei voi vahvistaa.'
FROM hankkeet h
JOIN kentta_lahteet k
  ON k.taulu = 'hankkeet'
  AND k.rivi_id = h.id
  AND k.kentta = 'it_teho_mw'
  AND k.lahde_url ILIKE '%wikipedia.org%'
WHERE h.nimi = 'LUMI-AI-datakeskus'
  AND h.julkaistu;
