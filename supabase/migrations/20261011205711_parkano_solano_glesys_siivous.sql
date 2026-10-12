-- Parkano Asemanseutu → Parkanon Asemanseudun datakeskus (KH § 144–145)
-- Solano: kaavatunnus asiakirjasta samaan kirjoitusasuun → sama_kaavatunnus
-- Glesys: ei yhteistä nimeävää lähdettä → erilleen + markkinointinimi-huomautus
-- Kouvola Hiivuri / Arcem Salo / FCDC Lahti: huomautukset toisesta hankkeesta
-- Idempotentti: jo tehdyt yhdistykset ohitetaan.

-- ---------------------------------------------------------------------------
-- 1. Parkano
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_ehdotus uuid;
  v_jo_yhdistetty boolean;
BEGIN
  SELECT yhdistetty_kohde_id = '1243fe99-03ca-4956-9696-262f39967ce1'
  INTO v_jo_yhdistetty
  FROM hankkeet
  WHERE id = '24185fd8-e1da-495d-ac9a-a33808bc86df';

  IF COALESCE(v_jo_yhdistetty, false) THEN
    RAISE NOTICE 'Parkano Asemanseutu on jo yhdistetty — ohitetaan.';
  ELSE
    DELETE FROM kentta_lahteet
    WHERE taulu = 'hankkeet'
      AND rivi_id = '24185fd8-e1da-495d-ac9a-a33808bc86df'
      AND kentta = 'huomautus'
      AND lahde_url ILIKE '%vakerinmaki%';

    UPDATE hankkeet SET huomautus = NULL
    WHERE id = '24185fd8-e1da-495d-ac9a-a33808bc86df';

    -- Tyhjennä kuntakeskus-geokoodi ennen yhdistystä (muuten se kopioituu).
    UPDATE hankkeet
    SET
      sijainti_lat = NULL,
      sijainti_lon = NULL,
      sijainti_alue = NULL,
      sijainti_alue_tyyppi = NULL
    WHERE id = '24185fd8-e1da-495d-ac9a-a33808bc86df';

    DELETE FROM kentta_lahteet
    WHERE taulu = 'hankkeet'
      AND rivi_id = '24185fd8-e1da-495d-ac9a-a33808bc86df'
      AND kentta IN ('sijainti', 'sijainti_lat', 'sijainti_lon');

    INSERT INTO muutosehdotukset (
      tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url
    ) VALUES (
      'ristiriita_havainto',
      '1243fe99-03ca-4956-9696-262f39967ce1',
      'yllapitaja',
      'yllapito',
      jsonb_build_object(
        'kentat', '{}'::jsonb,
        'ristiriita', jsonb_build_object(
          'saanto', 'samannimi_kunnassa',
          'avain', 'samannimi_kunnassa:1243fe99-03ca-4956-9696-262f39967ce1:24185fd8-e1da-495d-ac9a-a33808bc86df'
        )
      ),
      'odottaa',
      'https://parkanod10.oncloudos.com/kokous/2026541-14.PDF'
    )
    RETURNING id INTO v_ehdotus;

    PERFORM yhdista_hankkeet(
      '1243fe99-03ca-4956-9696-262f39967ce1',
      '24185fd8-e1da-495d-ac9a-a33808bc86df',
      v_ehdotus,
      'yllapito',
      'Sama Enertia Oy:n Asemanseudun hanke. KH 16.6.2026 § 144–145 käsittelee suunnitteluvarausta Asemanseutu 581-421-51-2 ja Parkanon Asemanseudun datakeskuksen kaavoitusaloitetta. Säilytetään rivi, jolla on viranomaisasiakirjat.',
      'https://parkanod10.oncloudos.com/kokous/2026541-14.PDF',
      'asiakirja_molemmat'
    );
  END IF;
END;
$$;

-- KH § 135 Vakerinmäki kuuluu Pohjan Voima -hankkeelle
UPDATE dokumentit
SET hanke_id = 'cd73475f-cc0a-47ef-bd9f-e42a34fead90'
WHERE id = '124d7004-d605-42c7-a59d-47b05d4c09e2'
  AND hanke_id IS DISTINCT FROM 'cd73475f-cc0a-47ef-bd9f-e42a34fead90';

-- Vakerinmäen huomautus ei enää viittaa erilliseen Asemanseutu-riviin
UPDATE hankkeet
SET huomautus = NULLIF(
  btrim(
    regexp_replace(
      COALESCE(huomautus, ''),
      E'(^|\\n\\n)Rekisterissä on myös hanke «Parkano Asemanseutu»\\.[^\\n]*(?:\\n(?!\\n)[^\\n]*)*',
      '',
      'g'
    )
  ),
  ''
)
WHERE id = 'cd73475f-cc0a-47ef-bd9f-e42a34fead90';

DELETE FROM kentta_lahteet
WHERE taulu = 'hankkeet'
  AND rivi_id = 'cd73475f-cc0a-47ef-bd9f-e42a34fead90'
  AND kentta = 'huomautus'
  AND NOT EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = 'cd73475f-cc0a-47ef-bd9f-e42a34fead90'
      AND h.huomautus IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 2. Solano
-- Kaavaselostus: «Kaavan nimi: Uusi-Olkkolan datakeskuksen asemakaava»
-- ja samassa tekstissä «Uusi-Olkkolan asemakaavan korttelin 4200» = sama kaava.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_ehdotus uuid;
  v_jo_yhdistetty boolean;
BEGIN
  SELECT yhdistetty_kohde_id = 'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5'
  INTO v_jo_yhdistetty
  FROM hankkeet
  WHERE id = '9f8d3420-f59c-463e-8292-6c6cb900280c';

  IF COALESCE(v_jo_yhdistetty, false) THEN
    RAISE NOTICE 'Solano-duplikaatti on jo yhdistetty — ohitetaan.';
  ELSE
    UPDATE hankkeet
    SET kaavatunnus = 'Uusi-Olkkolan datakeskuksen asemakaava'
    WHERE id = '9f8d3420-f59c-463e-8292-6c6cb900280c'
      AND kaavatunnus IS DISTINCT FROM 'Uusi-Olkkolan datakeskuksen asemakaava';

    PERFORM tallenna_kentta_lahde(
      'hankkeet',
      '9f8d3420-f59c-463e-8292-6c6cb900280c',
      'kaavatunnus',
      'https://www.pyhajarvi.fi/sites/default/files/liitetiedostot/20260310_UusiOlkkolaAK_selostus_luonnos.pdf',
      NULL,
      CURRENT_DATE,
      'epavarma',
      'Kaavan nimi: Uusi-Olkkolan datakeskuksen asemakaava. Asemakaavalla muodostuu Uusi-Olkkolan asemakaavan korttelin 4200 yhdyskuntateknisen huollon alue sekä metsätalousaluetta.',
      'ihmisen_vahvistama',
      'dokumentti'
    );

    IF NOT EXISTS (
      SELECT 1 FROM hankkeet a
      JOIN hankkeet b ON true
      WHERE a.id = 'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5'
        AND b.id = '9f8d3420-f59c-463e-8292-6c6cb900280c'
        AND a.kaavatunnus = b.kaavatunnus
        AND a.kaavatunnus = 'Uusi-Olkkolan datakeskuksen asemakaava'
    ) THEN
      RAISE EXCEPTION 'Solano-kaavatunnukset eivät täsmää korjauksen jälkeen — yhdistystä ei tehdä.';
    END IF;

    INSERT INTO muutosehdotukset (
      tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url
    ) VALUES (
      'ristiriita_havainto',
      'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5',
      'yllapitaja',
      'yllapito',
      jsonb_build_object(
        'kentat', '{}'::jsonb,
        'ristiriita', jsonb_build_object(
          'saanto', 'samannimi_kunnassa',
          'avain', 'samannimi_kunnassa:a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5:9f8d3420-f59c-463e-8292-6c6cb900280c'
        )
      ),
      'odottaa',
      'https://www.pyhajarvi.fi/sites/default/files/liitetiedostot/20260310_UusiOlkkolaAK_selostus_luonnos.pdf'
    )
    RETURNING id INTO v_ehdotus;

    PERFORM yhdista_hankkeet(
      'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5',
      '9f8d3420-f59c-463e-8292-6c6cb900280c',
      v_ehdotus,
      'yllapito',
      'Sama Solano Uusi-Olkkola -hanke. Kaavaselostuksen kaavan nimi on Uusi-Olkkolan datakeskuksen asemakaava; lyhyempi kirjoitusasu viittaa samaan kaavaan. Säilytetään rivi, jolla on 11 dokumenttia.',
      'https://www.pyhajarvi.fi/sites/default/files/liitetiedostot/20260310_UusiOlkkolaAK_selostus_luonnos.pdf',
      'sama_kaavatunnus'
    );
  END IF;
END;
$$;

-- Vanhentunut purku-huomautus säilytetyltä Solano-riviltä
UPDATE hankkeet
SET huomautus = NULLIF(
  btrim(
    regexp_replace(
      COALESCE(huomautus, ''),
      E'(^|\\n\\n)Rekisterissä on myös hanke «Solano Pyhäjärvi, Uusi-Olkkola»\\.[^\\n]*(?:\\n(?!\\n)[^\\n]*)*',
      '',
      'g'
    )
  ),
  ''
)
WHERE id = 'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5';

DELETE FROM kentta_lahteet
WHERE taulu = 'hankkeet'
  AND rivi_id = 'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5'
  AND kentta = 'huomautus'
  AND NOT EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = 'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5'
      AND h.huomautus IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- 3. Glesys: ei lähdettä jossa molemmat nimet → erilleen, markkinointinimi
-- ---------------------------------------------------------------------------

UPDATE hankkeet
SET huomautus =
  '«The Deck» on markkinointinimi (datacentermap.com). Glesysin omissa sivuissa kohde on «Tampereen datakeskus» / Tampere data center (Pakkahuoneenaukio 2). Rekisterissä on myös hanke «Glesys, Tampereen datakeskus» (~15 m, sama toimija). Hankkeet pidetään erillään: lähteissä ei ole asiakirjaa tai hanketoimijan sivua, jossa molemmat nimet esiintyvät.'
WHERE id = 'd374672c-48e9-4594-831b-7fd189e4c66d';

DO $$
BEGIN
  PERFORM tallenna_kentta_lahde(
    'hankkeet',
    'd374672c-48e9-4594-831b-7fd189e4c66d',
    'huomautus',
    'https://www.datacentermap.com/finland/tampere/',
    NULL,
    CURRENT_DATE,
    'epavarma',
    'Glesys - The Deck Glesys Pakkahuoneenaukio 2 33100 Tampere',
    'ihmisen_vahvistama',
    'html'
  );

  UPDATE hankkeet
  SET huomautus =
    'Rekisterissä on myös hanke «Glesys, The Deck» (~15 m, sama toimija, Pakkahuoneenaukio 2). «The Deck» on markkinointinimi kolmannen osapuolen listauksessa; Glesysin omissa sivuissa nimi on Tampereen datakeskus. Hankkeet pidetään erillään, koska lähteissä ei ole asiakirjaa tai hanketoimijan sivua, jossa molemmat nimet esiintyvät.'
  WHERE id = '89863bd0-e42b-407b-8c23-53bf89a96e8f';

  PERFORM tallenna_kentta_lahde(
    'hankkeet',
    '89863bd0-e42b-407b-8c23-53bf89a96e8f',
    'huomautus',
    'https://glesys.fi/sijainnit/laitetilat/tampere/',
    NULL,
    CURRENT_DATE,
    'epavarma',
    'Tampereen datakeskus sijaitsee Tampereen ydinkeskustassa aivan juna-aseman läheisyydessä.',
    'ihmisen_vahvistama',
    'html'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Varmistus: erilleen jätetyillä on huomautus toisesta hankkeesta
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = '7b3a83b9-5f2f-499c-b3c5-096ffdfd99ab'
      AND huomautus ILIKE '%Hyperco Data Systems%'
  ) THEN
    RAISE EXCEPTION 'Kouvola Hiivuri: puuttuu huomautus Hyperco-hankkeesta';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = '50366424-dc69-49ab-abbf-f5a933cb82db'
      AND huomautus ILIKE '%Hiivuri%'
  ) THEN
    RAISE EXCEPTION 'Hyperco Data Systems: puuttuu huomautus Hiivuri-hankkeesta';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = 'd82fd857-6213-4d48-bc85-38c489650724'
      AND huomautus ILIKE '%Regant Salo, Riikki%'
  ) THEN
    RAISE EXCEPTION 'Arcem Salo: puuttuu huomautus Regant-hankkeesta';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = '2cc81bd1-3359-4058-81ff-a60ffa651b0d'
      AND huomautus ILIKE '%Arcem Salo, Riikki%'
  ) THEN
    RAISE EXCEPTION 'Regant Salo: puuttuu huomautus Arcem-hankkeesta';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = 'ab2e473c-c702-4930-a676-b357085ae8da'
      AND huomautus ILIKE '%DayOne%'
  ) THEN
    RAISE EXCEPTION 'FCDC Lahti: puuttuu huomautus DayOne-hankkeesta';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = 'f0b6d05e-24f5-443e-9365-f840f7e8d933'
      AND huomautus ILIKE '%FCDC Lahti%'
  ) THEN
    RAISE EXCEPTION 'DayOne Lahti: puuttuu huomautus FCDC-hankkeesta';
  END IF;
END;
$$;
