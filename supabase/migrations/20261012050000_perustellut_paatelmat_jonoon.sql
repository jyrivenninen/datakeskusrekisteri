-- Kolme perusteltua päätelmää, joita ei vielä ole dokumenttirekisterissä.
-- Espoo, Forssa, Lohja, Kirkkonummi, Vihti ja Hamina ovat jo rekisterissä.
-- Pyhäjoella on vain kuulutus, ei itse päätelmää.

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES
(
  'taydennys',
  '50366424-dc69-49ab-abbf-f5a933cb82db',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'perusteltu-paatelma',
    'julkaisija', 'Lupa- ja valvontavirasto',
    'julkaisija_lainaus', 'Lupa- ja valvontavirasto',
    'lahde_tyyppi', 'viranomaisasiakirja',
    'sitovuustaso', 'virallinen',
    'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/kouvolan-datakeskus-hyperco-data-systems-oy-kouvola',
    'asiakirjat', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://www.ymparisto.fi/sites/default/files/documents/Yhteysviranomaisen%20perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20YVA-selostuksesta%2C%20Kouvolan%20datakeskus%2C%20Kouvola.pdf',
        'otsikko', 'Yhteysviranomaisen perusteltu päätelmä YVA-selostuksesta, Hyperco Data Systems Oy, Kouvolan datakeskus, 1.6.2026',
        'laji', 'muu',
        'muoto', 'pdf',
        'lainaus', 'Yhteysviranomaisen perusteltu päätelmä YVA-selostuksesta, Hyperco Data Systems Oy, Kouvolan datakeskus, 1.6.2026'
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/kouvolan-datakeskus-hyperco-data-systems-oy-kouvola',
  'Perusteltu päätelmä 1.6.2026, diaari LVV-U/42667/2026. Julkaisija on Lupa- ja valvontavirasto.'
),
(
  'taydennys',
  'a6f9c60a-c91a-453f-9236-1d012b383ccc',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'perusteltu-paatelma',
    'julkaisija', 'Lupa- ja valvontavirasto',
    'julkaisija_lainaus', 'Lupa- ja valvontavirasto',
    'lahde_tyyppi', 'viranomaisasiakirja',
    'sitovuustaso', 'virallinen',
    'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/pyhajoen-datakeskus-pyhajoki',
    'asiakirjat', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20YVA-selostus%20Pyh%C3%A4joen%20datakeskus.pdf',
        'otsikko', 'Yhteysviranomaisen perusteltu päätelmä YVA-selostuksesta, Pyhäjoen datakeskus, Pyhäjoki 17.6.2026',
        'laji', 'muu',
        'muoto', 'pdf',
        'lainaus', 'Yhteysviranomaisen perusteltu päätelmä YVA-selostuksesta, Pyhäjoen datakeskus, Pyhäjoki 17.6.2026'
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/pyhajoen-datakeskus-pyhajoki',
  'Perusteltu päätelmä 17.6.2026, diaari LVV-U/53982/2026. Rekisterissä oli ennestään vain kuulutus. Julkaisija on Lupa- ja valvontavirasto.'
),
(
  'taydennys',
  '084e16dd-61a0-4e58-b9a6-bec30552f705',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'perusteltu-paatelma',
    'julkaisija', 'Lupa- ja valvontavirasto',
    'julkaisija_lainaus', 'Lupa- ja valvontavirasto',
    'lahde_tyyppi', 'viranomaisasiakirja',
    'sitovuustaso', 'virallinen',
    'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/jarvenpaan-palvelinkeskus',
    'asiakirjat', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20J%C3%A4rvenp%C3%A4%C3%A4%20datakeskus%2016.9.26.pdf',
        'otsikko', 'Yhteysviranomaisen perusteltu päätelmä, (korjattu 16.9.2026 / sivulla 9 yleiskaavan luonnonsuojelualue-merkintä korjattu luonnonsuojelullisesti arvokkaaksi alueeksi) Järvenpään datakeskus',
        'laji', 'muu',
        'muoto', 'pdf',
        'lainaus', 'Yhteysviranomaisen perusteltu päätelmä, (korjattu 16.9.2026 / sivulla 9 yleiskaavan luonnonsuojelualue-merkintä korjattu luonnonsuojelullisesti arvokkaaksi alueeksi) Järvenpään datakeskus'
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/jarvenpaan-palvelinkeskus',
  'Perusteltu päätelmä 7.9.2026, korjattu 16.9.2026, diaari LVV-U/21665/2026. Aiempi PDF-osoite ei vastannut. Julkaisija on Lupa- ja valvontavirasto.'
);

DO $$
DECLARE
  v_jonossa integer;
  v_rekisterissa integer;
BEGIN
  SELECT count(*) INTO v_jonossa
  FROM muutosehdotukset
  WHERE tila = 'odottaa'
    AND sisalto->>'huomio' = 'perusteltu-paatelma'
    AND hanke_id IN (
      '50366424-dc69-49ab-abbf-f5a933cb82db',
      'a6f9c60a-c91a-453f-9236-1d012b383ccc',
      '084e16dd-61a0-4e58-b9a6-bec30552f705'
    );

  SELECT count(*) INTO v_rekisterissa
  FROM dokumentit
  WHERE url IN (
    'https://www.ymparisto.fi/sites/default/files/documents/Yhteysviranomaisen%20perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20YVA-selostuksesta%2C%20Kouvolan%20datakeskus%2C%20Kouvola.pdf',
    'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20YVA-selostus%20Pyh%C3%A4joen%20datakeskus.pdf',
    'https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20J%C3%A4rvenp%C3%A4%C3%A4%20datakeskus%2016.9.26.pdf'
  );

  IF v_jonossa <> 3 OR v_rekisterissa <> 0 THEN
    RAISE EXCEPTION 'Perusteltujen päätelmien jono ei täsmää: jonossa %, rekisterissä %', v_jonossa, v_rekisterissa;
  END IF;
END $$;
