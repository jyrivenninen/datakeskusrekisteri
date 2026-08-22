-- Ylläpitäjät ja julkinen ilmoituslomake → muutosehdotukset.

CREATE TABLE yllapitajat (
  kayttaja_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nimi text NOT NULL,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT yllapitajat_nimi_ei_tyhja CHECK (char_length(trim(nimi)) > 0)
);

COMMENT ON TABLE yllapitajat IS
  'Supabase Auth -käyttäjät, joilla on oikeus käsitellä muutosehdotuksia. Ensimmäinen rivi lisätään hallintapaneelista.';

ALTER TABLE yllapitajat ENABLE ROW LEVEL SECURITY;

CREATE POLICY yllapitajat_oma_luku
ON yllapitajat
FOR SELECT
TO authenticated
USING (kayttaja_id = auth.uid());

CREATE OR REPLACE FUNCTION onko_yllapitaja()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM yllapitajat WHERE kayttaja_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION onko_yllapitaja() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION onko_yllapitaja() TO authenticated;

CREATE POLICY muutosehdotukset_lomake_lisays
ON muutosehdotukset
FOR INSERT
TO anon, authenticated
WITH CHECK (
  tila = 'odottaa'
  AND ehdottaja_tyyppi = 'lomake'
  AND kasitelty_pvm IS NULL
  AND kasittelija IS NULL
);

CREATE POLICY muutosehdotukset_yllapito_luku
ON muutosehdotukset
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY muutosehdotukset_yllapito_paivitys
ON muutosehdotukset
FOR UPDATE
TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

GRANT INSERT ON muutosehdotukset TO anon, authenticated;
GRANT SELECT, UPDATE ON muutosehdotukset TO authenticated;
GRANT SELECT ON yllapitajat TO authenticated;

-- Hyväksyntä yhdellä transaktiolla (hanke + lähteet). Kutsutaan service_role-avaimella.
CREATE OR REPLACE FUNCTION julkaise_ehdotetut_tiedot(
  p_tyyppi text,
  p_hanke_id uuid,
  p_hanke jsonb,
  p_lahteet jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hanke_id uuid;
  v_lahde jsonb;
BEGIN
  IF p_tyyppi = 'uusi_hanke' THEN
    INSERT INTO hankkeet (
      nimi,
      kunta,
      maakunta,
      vaihe,
      yva_diaarinumero,
      it_teho_mw,
      pinta_ala_ha,
      sahkonkaytto_twh_a,
      generaattorit_lkm,
      generaattorit_kaytossa_max_lkm,
      generaattori_polttoaineteho_mw,
      toimija_organisaatio_id,
      julkaistu
    )
    VALUES (
      p_hanke ->> 'nimi',
      p_hanke ->> 'kunta',
      NULLIF(p_hanke ->> 'maakunta', ''),
      p_hanke ->> 'vaihe',
      NULLIF(p_hanke ->> 'yva_diaarinumero', ''),
      NULLIF(p_hanke ->> 'it_teho_mw', '')::numeric,
      NULLIF(p_hanke ->> 'pinta_ala_ha', '')::numeric,
      NULLIF(p_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
      NULLIF(p_hanke ->> 'generaattorit_lkm', '')::integer,
      NULLIF(p_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
      NULLIF(p_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
      NULLIF(p_hanke ->> 'toimija_organisaatio_id', '')::uuid,
      true
    )
    RETURNING id INTO v_hanke_id;
  ELSE
    IF p_hanke_id IS NULL THEN
      RAISE EXCEPTION 'Taydennykselta puuttuu hanke';
    END IF;
    v_hanke_id := p_hanke_id;
    UPDATE hankkeet
    SET
      nimi = COALESCE(NULLIF(p_hanke ->> 'nimi', ''), nimi),
      kunta = COALESCE(NULLIF(p_hanke ->> 'kunta', ''), kunta),
      maakunta = COALESCE(NULLIF(p_hanke ->> 'maakunta', ''), maakunta),
      vaihe = COALESCE(NULLIF(p_hanke ->> 'vaihe', ''), vaihe),
      yva_diaarinumero = COALESCE(NULLIF(p_hanke ->> 'yva_diaarinumero', ''), yva_diaarinumero),
      it_teho_mw = COALESCE(NULLIF(p_hanke ->> 'it_teho_mw', '')::numeric, it_teho_mw),
      pinta_ala_ha = COALESCE(NULLIF(p_hanke ->> 'pinta_ala_ha', '')::numeric, pinta_ala_ha),
      sahkonkaytto_twh_a = COALESCE(
        NULLIF(p_hanke ->> 'sahkonkaytto_twh_a', '')::numeric,
        sahkonkaytto_twh_a
      ),
      generaattorit_lkm = COALESCE(
        NULLIF(p_hanke ->> 'generaattorit_lkm', '')::integer,
        generaattorit_lkm
      ),
      generaattorit_kaytossa_max_lkm = COALESCE(
        NULLIF(p_hanke ->> 'generaattorit_kaytossa_max_lkm', '')::integer,
        generaattorit_kaytossa_max_lkm
      ),
      generaattori_polttoaineteho_mw = COALESCE(
        NULLIF(p_hanke ->> 'generaattori_polttoaineteho_mw', '')::numeric,
        generaattori_polttoaineteho_mw
      ),
      toimija_organisaatio_id = COALESCE(
        NULLIF(p_hanke ->> 'toimija_organisaatio_id', '')::uuid,
        toimija_organisaatio_id
      )
    WHERE id = v_hanke_id;
  END IF;

  FOR v_lahde IN SELECT value FROM jsonb_array_elements(p_lahteet)
  LOOP
    INSERT INTO kentta_lahteet (
      taulu,
      rivi_id,
      kentta,
      lahde_url,
      lahde_sivu,
      vahvistettu_pvm,
      luottamus,
      lainaus,
      merkitty
    )
    VALUES (
      'hankkeet',
      v_hanke_id,
      v_lahde ->> 'kentta',
      v_lahde ->> 'lahde_url',
      NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
      (v_lahde ->> 'vahvistettu_pvm')::date,
      v_lahde ->> 'luottamus',
      NULLIF(v_lahde ->> 'lainaus', ''),
      v_lahde ->> 'merkitty'
    );
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    hanke_id = v_hanke_id
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;

  RETURN v_hanke_id;
END;
$$;

REVOKE ALL ON FUNCTION julkaise_ehdotetut_tiedot(
  text, uuid, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION julkaise_ehdotetut_tiedot(
  text, uuid, jsonb, jsonb, uuid, text
) TO service_role;
