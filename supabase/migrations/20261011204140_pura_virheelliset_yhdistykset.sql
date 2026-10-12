-- Pura yhdistykset, jotka eivät täytä yhdistyssääntöä.
-- Säilytetään: FR Malakakangas (sama toimija + sama kaavoitusaloite-asiakirja).
-- Puretaan 6: Arcem/Regant, FCDC/DayOne, Glesys The Deck, Kouvola Hiivuri,
-- Parkano Asemanseutu, Solano-duplikaatti.

CREATE OR REPLACE FUNCTION _pura_yhdistys_ja_huomauta(
  p_yhdistetty uuid,
  p_kohde uuid,
  p_toinen_nimi text,
  p_vanha_perustelu text,
  p_lahde_url text,
  p_lainaus text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_teksti text;
  v_olemassa text;
  v_perustelu text;
  v_yhdistetty_nimi text;
  v_kohde_nimi text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = p_yhdistetty AND yhdistetty_kohde_id = p_kohde
  ) THEN
    RAISE EXCEPTION 'Yhdistystä ei löydy: % → %', p_yhdistetty, p_kohde;
  END IF;

  SELECT nimi INTO v_yhdistetty_nimi FROM hankkeet WHERE id = p_yhdistetty;
  SELECT nimi INTO v_kohde_nimi FROM hankkeet WHERE id = p_kohde;
  v_perustelu := NULLIF(btrim(COALESCE(p_vanha_perustelu, '')), '');

  DELETE FROM hanke_ohjaukset WHERE vanha_id = p_yhdistetty;

  UPDATE hankkeet
  SET
    yhdistetty_kohde_id = NULL,
    julkaistu = true,
    poistettu_perustelu = NULL,
    poistettu_pvm = NULL,
    poistettu_kasittelija = NULL
  WHERE id = p_yhdistetty;

  IF v_perustelu IS NULL THEN
    v_teksti := format(
      'Rekisterissä on myös hanke «%s». Hankkeet pidetään erillään: yhdistys purettu, koska se ei täyttänyt sääntöä (sama toimija + kaavatunnus/YVA/asiakirja, tai jatkumoasiakirja).',
      COALESCE(NULLIF(btrim(p_toinen_nimi), ''), v_kohde_nimi)
    );
  ELSE
    v_teksti := format(
      'Rekisterissä on myös hanke «%s». Hankkeet pidetään erillään: yhdistys purettu, koska se ei täyttänyt sääntöä (sama toimija + kaavatunnus/YVA/asiakirja, tai jatkumoasiakirja). Vanha yhdistysperustelu: %s',
      COALESCE(NULLIF(btrim(p_toinen_nimi), ''), v_kohde_nimi),
      v_perustelu
    );
  END IF;

  SELECT huomautus INTO v_olemassa FROM hankkeet WHERE id = p_yhdistetty;
  UPDATE hankkeet
  SET huomautus = CASE
    WHEN NULLIF(btrim(COALESCE(v_olemassa, '')), '') IS NULL THEN v_teksti
    ELSE btrim(v_olemassa) || E'\n\n' || v_teksti
  END
  WHERE id = p_yhdistetty;

  PERFORM tallenna_kentta_lahde(
    'hankkeet', p_yhdistetty, 'huomautus',
    p_lahde_url, NULL, CURRENT_DATE, 'epavarma', p_lainaus,
    'ihmisen_vahvistama', 'html'
  );

  IF v_perustelu IS NULL THEN
    v_teksti := format(
      'Rekisterissä on myös hanke «%s». Hankkeet pidetään erillään: aiempi yhdistys purettu, koska se ei täyttänyt sääntöä (sama toimija + kaavatunnus/YVA/asiakirja, tai jatkumoasiakirja).',
      v_yhdistetty_nimi
    );
  ELSE
    v_teksti := format(
      'Rekisterissä on myös hanke «%s». Hankkeet pidetään erillään: aiempi yhdistys purettu, koska se ei täyttänyt sääntöä (sama toimija + kaavatunnus/YVA/asiakirja, tai jatkumoasiakirja). Vanha yhdistysperustelu: %s',
      v_yhdistetty_nimi,
      v_perustelu
    );
  END IF;

  SELECT huomautus INTO v_olemassa FROM hankkeet WHERE id = p_kohde;
  UPDATE hankkeet
  SET huomautus = CASE
    WHEN NULLIF(btrim(COALESCE(v_olemassa, '')), '') IS NULL THEN v_teksti
    ELSE btrim(v_olemassa) || E'\n\n' || v_teksti
  END
  WHERE id = p_kohde;

  PERFORM tallenna_kentta_lahde(
    'hankkeet', p_kohde, 'huomautus',
    p_lahde_url, NULL, CURRENT_DATE, 'epavarma', p_lainaus,
    'ihmisen_vahvistama', 'html'
  );
END;
$$;

DO $$
BEGIN
  -- 1 Arcem → Regant
  PERFORM _pura_yhdistys_ja_huomauta(
    'd82fd857-6213-4d48-bc85-38c489650724',
    '2cc81bd1-3359-4058-81ff-a60ffa651b0d',
    'Regant Salo, Riikki',
    'Yhteenveto: Fyysisesti kyse on samasta tontista ja datakeskukselle suunnitellusta sijoituspaikasta, mutta Arcemin hanke on peruttu ja Regantin Riikki-hanke on korvannut sen.',
    'https://www.sss.fi/2025/11/salossa-viritellaan-toista-datakeskusta-norjalainen-yhtio-varasi-hehtaaritolkulla-maata-halikosta/',
    'Kaupunki on varannut Riikin teollisuusalueelta Halikosta 7,6 hehtaaria maata norjalaiselle Arcem AS:lle.'
  );

  -- 2 FCDC Lahti → DayOne
  PERFORM _pura_yhdistys_ja_huomauta(
    'ab2e473c-c702-4930-a676-b357085ae8da',
    'f0b6d05e-24f5-443e-9365-f840f7e8d933',
    'Lahden datakeskus, Kiveriö (DayOne)',
    'sama hanke kyseessä',
    'https://www.datacentermap.com/finland/lahti/',
    'FCDC Lahti / Lahti data center listings'
  );

  -- 3 Glesys The Deck → Tampereen datakeskus (sama toimija, ei yhteistä kaavaa/YVA/asiakirjaa molemmille nimille)
  PERFORM _pura_yhdistys_ja_huomauta(
    'd374672c-48e9-4594-831b-7fd189e4c66d',
    '89863bd0-e42b-407b-8c23-53bf89a96e8f',
    'Glesys, Tampereen datakeskus',
    'Koordinaattien pieni 15 metrin heitto johtuu vain siitä, mihin kohtaan saman kiinteistön katolle tai sisäänkäynnille merkit on asetettu. Kyseessä on sama Glesysin omistama, noin 0,5 megawatin kapasiteetilla toimiva moderni konesali Tampere - Glesys.',
    'https://glesys.fi/sijainnit/laitetilat/tampere/',
    'Tampereen datakeskus sijaitsee Tampereen ydinkeskustassa aivan juna-aseman läheisyydessä.'
  );

  -- 4 Kouvola Hiivuri → Hyperco
  PERFORM _pura_yhdistys_ja_huomauta(
    '7b3a83b9-5f2f-499c-b3c5-096ffdfd99ab',
    '50366424-dc69-49ab-abbf-f5a933cb82db',
    'Kouvolan datakeskus, Hyperco Data Systems Oy',
    'Sama hanke eri nimeyksellä. Yhdistetään.',
    'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/kouvolan-datakeskus-hyperco-data-systems',
    'Kouvolan datakeskus, Hyperco Data Systems'
  );

  -- 5 Parkano Asemanseutu → Vakerinmäki
  PERFORM _pura_yhdistys_ja_huomauta(
    '24185fd8-e1da-495d-ac9a-a33808bc86df',
    'cd73475f-cc0a-47ef-bd9f-e42a34fead90',
    'Pohjan Voima Parkano, Vakerinmäki',
    'Sama hanke kyseessä',
    'https://vakerinmaki.fi/',
    'Suunnittelemme energiaintensiivisen toiminnan aluetta Parkanoon'
  );

  -- 6 Solano-duplikaatti → Solano
  PERFORM _pura_yhdistys_ja_huomauta(
    '9f8d3420-f59c-463e-8292-6c6cb900280c',
    'a9d15de9-8c35-46b4-aca8-8bc3c1fc0cf5',
    'Solano Pyhäjärvi, Uusi-Olkkola',
    'Sama nimi ja kunta: kaksi julkaistua Solano Pyhäjärvi Uusi-Olkkola -riviä. Säilytetään vanhempi a9d15de9.',
    'https://www.pyhajarvi.fi/sites/default/files/liitetiedostot/20260310_UusiOlkkolaAK_selostus_luonnos.pdf',
    'Asemakaava-alue on kooltaan noin 93 hehtaaria.'
  );
END;
$$;

DROP FUNCTION _pura_yhdistys_ja_huomauta(uuid, uuid, text, text, text, text);
