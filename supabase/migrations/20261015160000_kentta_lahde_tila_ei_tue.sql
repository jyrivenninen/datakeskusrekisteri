-- Lähde voi olla ei_tue: säilyy näkyvissä / asiakirjoissa, mutta ei
-- vaikuta valoon, varmistusprosenttiin eikä lähdepakkoon.

ALTER TABLE kentta_lahteet
  DROP CONSTRAINT IF EXISTS kentta_lahteet_tila_tarkistus;

ALTER TABLE kentta_lahteet
  DROP CONSTRAINT IF EXISTS kentta_lahteet_korvaava_tarkistus;

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_tila_tarkistus CHECK (
    tila IN ('voimassa', 'korvattu', 'ei_tue')
  );

ALTER TABLE kentta_lahteet
  ADD CONSTRAINT kentta_lahteet_korvaava_tarkistus CHECK (
    (tila = 'voimassa' AND korvaava_dokumentti_id IS NULL)
    OR (tila = 'korvattu' AND korvaava_dokumentti_id IS NOT NULL)
    OR (tila = 'ei_tue' AND korvaava_dokumentti_id IS NULL)
  );

COMMENT ON COLUMN kentta_lahteet.tila IS
  'voimassa täyttää kentän lähdevaatimuksen. korvattu / ei_tue jäävät '
  'näkyviin mutta eivät vaikuta valoon, varmistusprosenttiin eivätkä '
  'lähdepakkoon. Asiakirja säilyy hankkeen asiakirjoissa.';

-- Peruutus merkitsee tila=ei_tue (ei vain koneen_ehdottama).
CREATE OR REPLACE FUNCTION peruuta_kentta_lahde_kuittaus(
  p_lahde_idt uuid[],
  p_kasittelija text,
  p_huomautus text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lkm integer := 0;
  v_rivi record;
  v_huom text;
BEGIN
  IF p_lahde_idt IS NULL OR cardinality(p_lahde_idt) = 0 THEN
    RETURN 0;
  END IF;

  v_huom := NULLIF(btrim(COALESCE(p_huomautus, '')), '');

  FOR v_rivi IN
    SELECT
      kl.id,
      kl.taulu,
      kl.rivi_id,
      kl.kentta,
      kl.lahde_url,
      kl.lainaus,
      kl.lahde_sivu,
      kl.kuittaustapa,
      kl.eratunniste,
      kl.luottamus,
      kl.tila,
      kl.merkitty
    FROM kentta_lahteet kl
    WHERE kl.id = ANY (p_lahde_idt)
      AND kl.tila IS DISTINCT FROM 'korvattu'
      AND kl.tila IS DISTINCT FROM 'ei_tue'
  LOOP
    UPDATE kentta_lahteet
    SET
      tila = 'ei_tue',
      merkitty = 'koneen_ehdottama',
      merkitty_pvm = now(),
      kuittaustapa = NULL,
      eratunniste = NULL
    WHERE id = v_rivi.id;

    INSERT INTO muutosehdotukset (
      tyyppi,
      hanke_id,
      ehdottaja_tyyppi,
      ehdottaja_tunniste,
      lahde_url,
      huomautus,
      tila,
      kasittelija,
      kasitelty_pvm,
      sisalto
    ) VALUES (
      'korjaus',
      CASE WHEN v_rivi.taulu = 'hankkeet' THEN v_rivi.rivi_id ELSE NULL END,
      'yllapitaja',
      'kuittaus_peruutus',
      v_rivi.lahde_url,
      COALESCE(
        v_huom,
        format(
          'Lähde merkitty ei_tue (%s.%s). Asiakirja säilyy, ei vaikuta valoon eikä varmistukseen.',
          v_rivi.taulu,
          v_rivi.kentta
        )
      ),
      'hyvaksytty',
      p_kasittelija,
      now(),
      jsonb_build_object(
        'kuittaus_peruutus',
        jsonb_build_object(
          'lahde_id', v_rivi.id,
          'taulu', v_rivi.taulu,
          'rivi_id', v_rivi.rivi_id,
          'kentta', v_rivi.kentta,
          'lahde_url', v_rivi.lahde_url,
          'lainaus', v_rivi.lainaus,
          'lahde_sivu', v_rivi.lahde_sivu,
          'vanha_tila', v_rivi.tila,
          'vanha_merkitty', v_rivi.merkitty,
          'vanha_kuittaustapa', v_rivi.kuittaustapa,
          'vanha_eratunniste', v_rivi.eratunniste,
          'vanha_luottamus', v_rivi.luottamus,
          'uusi_tila', 'ei_tue',
          'kasittelija', p_kasittelija,
          'huomautus', v_huom
        )
      )
    );

    v_lkm := v_lkm + 1;
  END LOOP;

  RETURN v_lkm;
END;
$$;

COMMENT ON FUNCTION peruuta_kentta_lahde_kuittaus(uuid[], text, text) IS
  'Merkitsee lähteen tila=ei_tue (pois valosta ja varmistuksesta). Asiakirja säilyy.';
