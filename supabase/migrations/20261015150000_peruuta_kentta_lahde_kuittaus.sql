-- Peruuttaa ihmisen kuittauksen: merkitty → koneen_ehdottama, lähde säilyy.
-- Kirjaa tapahtuman muutosehdotukset-tauluun.

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
      kl.luottamus
    FROM kentta_lahteet kl
    WHERE kl.id = ANY (p_lahde_idt)
      AND kl.merkitty = 'ihmisen_vahvistama'
      AND kl.tila IS DISTINCT FROM 'korvattu'
  LOOP
    UPDATE kentta_lahteet
    SET
      merkitty = 'koneen_ehdottama',
      merkitty_pvm = now(),
      kuittaustapa = NULL,
      eratunniste = NULL
      -- luottamus säilyy; valo palaa keltaiseksi koska merkitty muuttuu
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
          'Kuittaus peruttu (%s.%s). Lähde säilyy, merkitty=koneen_ehdottama.',
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
          'vanha_kuittaustapa', v_rivi.kuittaustapa,
          'vanha_eratunniste', v_rivi.eratunniste,
          'vanha_luottamus', v_rivi.luottamus,
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
  'Peruuttaa ihmisen kuittauksen: merkitty=koneen_ehdottama, lähde säilyy, tapahtuma kirjataan.';

REVOKE ALL ON FUNCTION peruuta_kentta_lahde_kuittaus(uuid[], text, text)
  FROM PUBLIC, anon, authenticated, agentti;

GRANT EXECUTE ON FUNCTION peruuta_kentta_lahde_kuittaus(uuid[], text, text)
  TO service_role;
