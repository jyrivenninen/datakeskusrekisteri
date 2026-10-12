-- 1) Peru Suosaari → HE7 -yhdistys
-- 2) Siirrä erän 3 Suosaari-asiakirjat ja kaavan_laatija takaisin Suosaarelle

DO $$
DECLARE
  v_suosaari uuid := '772df07e-88a7-409c-8516-a748b4c86276';
  v_he7 uuid := '662b4e66-3864-431f-8c28-fcd7abd87174';
  n_dok int;
  n_org int;
  n_ehdotus int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = v_suosaari
      AND yhdistetty_kohde_id = v_he7
  ) THEN
    -- Idempotentti uudelleenajo: jos jo purettu, tarkista vain siirrot
    IF EXISTS (
      SELECT 1 FROM hankkeet
      WHERE id = v_suosaari
        AND yhdistetty_kohde_id IS NULL
    ) AND (
      SELECT count(*) FROM dokumentit
      WHERE hanke_id = v_suosaari AND url LIKE '%20251365%'
    ) = 6 THEN
      RAISE NOTICE 'Suosaari jo erotettu ja kirjaukset paikallaan.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Suosaari ei ole yhdistetty HE7:ään (tai id väärä).';
  END IF;

  UPDATE hankkeet
  SET yhdistetty_kohde_id = NULL
  WHERE id = v_suosaari
    AND yhdistetty_kohde_id = v_he7;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yhdistyksen purku epäonnistui.';
  END IF;

  UPDATE dokumentit
  SET hanke_id = v_suosaari
  WHERE hanke_id = v_he7
    AND url IN (
      'https://espoo.oncloudos.com/kokous/20251365-8-283774.PDF',
      'https://espoo.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=20251365-8',
      'https://espoo.oncloudos.com/kokous/20251365-8-283175.PDF',
      'https://espoo.oncloudos.com/kokous/20251365-8-283782.PDF',
      'https://espoo.oncloudos.com/kokous/20251365-8-283173.PDF',
      'https://espoo.oncloudos.com/kokous/20251365-8-283174.PDF'
    );
  GET DIAGNOSTICS n_dok = ROW_COUNT;
  IF n_dok <> 6 THEN
    RAISE EXCEPTION 'Odotettiin 6 asiakirjaa, päivittyi %', n_dok;
  END IF;

  UPDATE hanke_organisaatiot
  SET hanke_id = v_suosaari
  WHERE id = '7822dc8d-7ce2-400c-bfa7-457ec89ef20d'
    AND hanke_id = v_he7
    AND rooli = 'kaavan_laatija';
  GET DIAGNOSTICS n_org = ROW_COUNT;
  IF n_org <> 1 THEN
    RAISE EXCEPTION 'Odotettiin 1 organisaatioriviä, päivittyi %', n_org;
  END IF;

  UPDATE muutosehdotukset
  SET
    hanke_id = v_suosaari,
    huomautus = CASE
      WHEN ehdottaja_tunniste = 'grok_lahdeselvitys_era3_laatijat_asiakirja'
        THEN replace(
          huomautus,
          'Grok-aineiston Suosaari-id oli yhdistetty Equinix HE7:ään.',
          'Kirjaus siirretty takaisin Suosaari-hankkeelle; HE7-yhdistys purettu.'
        )
      ELSE huomautus
    END
  WHERE ehdottaja_tunniste LIKE 'grok_lahdeselvitys_era3%'
    AND hanke_id = v_he7
    AND (
      lahde_url LIKE '%20251365%'
      OR huomautus ILIKE '%Suosaari%'
    );
  GET DIAGNOSTICS n_ehdotus = ROW_COUNT;
  IF n_ehdotus < 7 THEN
    RAISE EXCEPTION 'Odotettiin vähintään 7 ehdotusta, päivittyi %', n_ehdotus;
  END IF;

  RAISE NOTICE 'Suosaari erotettu: dok=%, org=%, ehdotus=%', n_dok, n_org, n_ehdotus;
END;
$$;
