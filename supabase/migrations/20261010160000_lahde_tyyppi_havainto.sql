-- Lähdetyypin domain-ehdotukset muutosehdotukset-jonoon ja ylläpidon julkaisu-RPC.

ALTER TABLE dokumentit
  ADD COLUMN IF NOT EXISTS lahde_metatiedot_kasitelty_pvm date;

COMMENT ON COLUMN dokumentit.lahde_metatiedot_kasitelty_pvm IS
  'Ylläpidon läpikäynnissä vahvistettu lahde_tyyppi, sitovuustaso ja tarvittaessa otsikko.';

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
      'maaraaja',
      'linkki_rikki',
      'ryhti_havainto',
      'kunta_havainto',
      'ytj_havainto',
      'mml_havainto',
      'dokumentti_muuttunut',
      'ristiriita_havainto',
      'lahteenvahvistus',
      'lahteenvahvistus_pyynto',
      'lahde_tyyppi_havainto'
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
        'paatos',
        'maaraaja',
        'lahteenvahvistus',
        'lahteenvahvistus_pyynto'
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
      'ristiriita_havainto',
      'lahde_tyyppi_havainto'
    )
  );

COMMENT ON CONSTRAINT muutosehdotukset_tyyppi_tarkistus ON muutosehdotukset IS
  'lahde_tyyppi_havainto = domain-sääntöjen ehdotus dokumentin lahde_tyyppi/sitovuustaso.';

CREATE OR REPLACE FUNCTION julkaise_dokumentti_lahde_metatiedot(
  p_dokumentti_id uuid,
  p_lahde_tyyppi text,
  p_sitovuustaso text,
  p_otsikko text,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dok dokumentit%ROWTYPE;
  v_otsikko text;
BEGIN
  IF p_lahde_tyyppi NOT IN (
    'paatos',
    'viranomaisasiakirja',
    'rekisteri',
    'hankkeen_oma',
    'media',
    'menetelma',
    'muu'
  ) THEN
    RAISE EXCEPTION 'lahde_tyyppi ei ole sallittu';
  END IF;
  IF p_sitovuustaso NOT IN ('sitova', 'virallinen', 'epavirallinen') THEN
    RAISE EXCEPTION 'sitovuustaso ei ole sallittu';
  END IF;

  SELECT * INTO v_dok
  FROM dokumentit
  WHERE id = p_dokumentti_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumenttia ei löytynyt';
  END IF;

  IF p_ehdotus_id IS NOT NULL THEN
    PERFORM 1
    FROM muutosehdotukset
    WHERE id = p_ehdotus_id
      AND tila = 'odottaa'
      AND tyyppi = 'lahde_tyyppi_havainto'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
    END IF;
  END IF;

  v_otsikko := NULLIF(btrim(COALESCE(p_otsikko, '')), '');

  UPDATE dokumentit
  SET
    lahde_tyyppi = p_lahde_tyyppi,
    sitovuustaso = p_sitovuustaso,
    otsikko = CASE
      WHEN v_otsikko IS NOT NULL AND v_otsikko <> url THEN v_otsikko
      ELSE otsikko
    END,
    otsikko_automaattinen = CASE
      WHEN v_otsikko IS NOT NULL AND v_otsikko <> url THEN false
      ELSE otsikko_automaattinen
    END,
    lahde_metatiedot_kasitelty_pvm = CURRENT_DATE
  WHERE id = p_dokumentti_id;

  IF v_otsikko IS NOT NULL AND v_otsikko <> v_dok.url THEN
    PERFORM tallenna_kentta_lahde(
      'dokumentit',
      p_dokumentti_id,
      'otsikko',
      v_dok.url,
      NULL,
      CURRENT_DATE,
      'vahvistettu',
      v_otsikko,
      'ihmisen_vahvistama',
      COALESCE(
        (
          SELECT kl.lahde_laji
          FROM kentta_lahteet kl
          WHERE kl.taulu = 'dokumentit'
            AND kl.rivi_id = p_dokumentti_id
            AND kl.kentta = 'otsikko'
          LIMIT 1
        ),
        'html'
      )
    );
  END IF;

  IF p_ehdotus_id IS NOT NULL THEN
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
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION julkaise_dokumentti_lahde_metatiedot(
  uuid, text, text, text, uuid, text
) FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION julkaise_dokumentti_lahde_metatiedot(
  uuid, text, text, text, uuid, text
) TO service_role;
