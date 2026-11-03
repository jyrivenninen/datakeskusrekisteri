-- Ylläpidon pinta-ala-läpikäynti (12 riviä) + kaava_ala_ha-siirrot.
-- Aja: npx supabase db query --linked -f scripts/kasittele-pinta-ala-lapikaynti.sql

CREATE OR REPLACE FUNCTION tmp_dok(p_hanke uuid, p_url text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM dokumentit WHERE hanke_id = p_hanke AND url = p_url LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id INTO v_id FROM dokumentit WHERE url = p_url LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO dokumentit (
    hanke_id, url, otsikko, laji, muoto, julkaistu, lahde_tyyppi, sitovuustaso
  ) VALUES (
    p_hanke, p_url, p_url, 'verkkosivu', 'html', true, 'muu', 'epavirallinen'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION tmp_lapikaynti(
  p_hanke uuid, p_paatos text, p_huomautus text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO luvun_lapikaynti (taulu, rivi_id, kentta, paatos, kasittelija, huomautus, kasitelty_pvm)
  VALUES ('hankkeet', p_hanke, 'pinta_ala_ha', p_paatos, 'ylläpito', p_huomautus, now())
  ON CONFLICT (taulu, rivi_id, kentta) DO UPDATE SET
    paatos = EXCLUDED.paatos,
    kasittelija = EXCLUDED.kasittelija,
    huomautus = EXCLUDED.huomautus,
    kasitelty_pvm = EXCLUDED.kasitelty_pvm;
END;
$$;

DO $$
DECLARE
  v_dok uuid;
  v_ve uuid;
  v_lahde kentta_lahteet%ROWTYPE;
BEGIN
  -- ========== 1 Equinix HE7 ==========
  UPDATE hankkeet SET kaava_ala_ha = 3.8, pinta_ala_ha = NULL
  WHERE id = '662b4e66-3864-431f-8c28-fcd7abd87174';
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '8160926b-5cbc-4928-8fea-aa8448a28890';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'kaava_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok(v_lahde.rivi_id, v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id IN ('8160926b-5cbc-4928-8fea-aa8448a28890', '96cb3730-73ac-40ac-adb7-9199e40be7c7');
  PERFORM tmp_lapikaynti(
    '662b4e66-3864-431f-8c28-fcd7abd87174', 'korvattu',
    'Kaava-alue 3,8 ha → kaava_ala_ha. Colocation-neliöt poistettu pinta_ala_ha-kentästä.'
  );

  -- ========== 2 Arcem Joroinen ==========
  UPDATE hankkeet SET kaava_ala_ha = 18.5, pinta_ala_ha = 80
  WHERE id = '8a741947-8f1a-406d-84df-47c73472250a';
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '24610e1e-da58-4b3b-9191-263a91486362';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'kaava_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = 'd3ea18fc-c3db-4233-bb8a-e7d2118b176e';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '95f3b5c5-e2e3-411c-a82e-cbade613d7c3';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok('8a741947-8f1a-406d-84df-47c73472250a', 'https://media.arcem.no/arcem-makes-major-land-acquisition-in-finland/');
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id = '24610e1e-da58-4b3b-9191-263a91486362';
  PERFORM tmp_lapikaynti(
    '8a741947-8f1a-406d-84df-47c73472250a', 'eri_asia',
    'Asemakaavoitettu tontti 18,5 ha → kaava_ala_ha. Kokonaisala 80 ha → pinta_ala_ha.'
  );

  -- ========== 3 Kajaani-Otanmäki ==========
  UPDATE hankkeet SET kaava_ala_ha = 390, pinta_ala_ha = 405
  WHERE id = '66ea72dd-e11b-4987-89a4-a3c273b8d04b';
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '9fc833da-181d-4544-b936-8d9f570700d0';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'kaava_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '6032f5ad-a8e0-4178-9b37-4be698e2d18e';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok('66ea72dd-e11b-4987-89a4-a3c273b8d04b', v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id = '9fc833da-181d-4544-b936-8d9f570700d0';
  PERFORM tmp_lapikaynti(
    '66ea72dd-e11b-4987-89a4-a3c273b8d04b', 'eri_asia',
    'Kaavoitettava alue 390 ha → kaava_ala_ha. Hankealue 405 ha → pinta_ala_ha.'
  );

  -- ========== 4 Neoen ==========
  UPDATE hankkeet SET kaava_ala_ha = 84, pinta_ala_ha = 106
  WHERE id = '666cf1d2-cd14-498c-aa37-d953c2c56827';
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = 'f692c6ff-a2d7-44b0-8890-865101939467';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'kaava_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '51e804cd-7524-43c0-b849-23dbdfb854d8';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok('666cf1d2-cd14-498c-aa37-d953c2c56827', v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id = 'f692c6ff-a2d7-44b0-8890-865101939467';
  PERFORM tmp_lapikaynti(
    '666cf1d2-cd14-498c-aa37-d953c2c56827', 'eri_asia',
    'Asemakaavan suunnittelualue 84 ha → kaava_ala_ha. Sijoittumisalue 106 ha → pinta_ala_ha.'
  );

  -- ========== 5–8 eri_asia (ei kenttämuutosta) ==========
  PERFORM tmp_lapikaynti(
    '950b05fd-7562-448c-8973-c83ac2a985ca', 'eri_asia',
    '60,3 ha ja 62,9 ha ovat saman kaava-/suunnittelualueen mittauksia eri asiakirjoissa. Nykyinen 62,9 ha säilyy.'
  );
  PERFORM tmp_lapikaynti(
    '7a10bbea-b7f3-4ada-8734-02bc16486378', 'eri_asia',
    '180 ha (hankealue) ja 190 ha (maakauppa) ovat saman hankkeen läheisiä mittauksia. Nykyinen 190 ha säilyy.'
  );
  PERFORM tmp_lapikaynti(
    '414f2445-5987-49be-bd81-0f78281a5b94', 'eri_asia',
    '25 ha ja 26 ha kuvaavat samaa tonttia eri lähteissä. Nykyinen 26 ha säilyy.'
  );
  PERFORM tmp_lapikaynti(
    '3beebad5-15ed-43b3-8093-437949dbb618', 'eri_asia',
    '72 220 m² (7,22 ha) on tonttirekisterin tarkka ala; «noin 10 ha» on sama tontti karkeasti. Nykyinen 7,22 ha säilyy.'
  );

  -- ========== 9 Forssa: hanketaso tyhjäksi (VE:t olemassa) ==========
  UPDATE hankkeet SET pinta_ala_ha = NULL WHERE id = '780537d4-907d-417b-91fe-ddb0fcef250e';
  v_dok := tmp_dok(
    '780537d4-907d-417b-91fe-ddb0fcef250e',
    'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus'
  );
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id IN ('c193caec-6cfe-4a9b-b2bc-a7e62f67bf85', 'd55e3311-7e79-4286-94b4-7bf57180e299');
  PERFORM tmp_lapikaynti(
    '780537d4-907d-417b-91fe-ddb0fcef250e', 'korvattu',
    'YVA-vaihtoehdot VE1/VE2 sisältävät pinta-alat. Hanketason 44/150 ha tyhjennetty.'
  );

  -- ========== 10 atNorth FIN04 vaihtoehdot ==========
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = 'e083d8da-8c0a-466e-9e93-ddc4e218dff3';
  INSERT INTO hanke_vaihtoehdot (hanke_id, tunnus, pinta_ala_ha, julkaistu)
  VALUES ('451ba13c-121c-4b6d-9380-d3f0e523e1c6', 'Tilat 23 ha', 23, true)
  ON CONFLICT (hanke_id, tunnus) DO NOTHING
  RETURNING id INTO v_ve;
  IF v_ve IS NULL THEN
    SELECT id INTO v_ve FROM hanke_vaihtoehdot
    WHERE hanke_id = '451ba13c-121c-4b6d-9380-d3f0e523e1c6' AND tunnus = 'Tilat 23 ha';
    UPDATE hanke_vaihtoehdot SET pinta_ala_ha = 23, julkaistu = true WHERE id = v_ve;
  END IF;
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'tunnus', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );

  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = 'e2b085de-05c3-4a13-a0c0-9bc2087a2829';
  v_ve := NULL;
  INSERT INTO hanke_vaihtoehdot (hanke_id, tunnus, pinta_ala_ha, julkaistu)
  VALUES ('451ba13c-121c-4b6d-9380-d3f0e523e1c6', 'Kampus 45 ha', 45, true)
  ON CONFLICT (hanke_id, tunnus) DO NOTHING
  RETURNING id INTO v_ve;
  IF v_ve IS NULL THEN
    SELECT id INTO v_ve FROM hanke_vaihtoehdot
    WHERE hanke_id = '451ba13c-121c-4b6d-9380-d3f0e523e1c6' AND tunnus = 'Kampus 45 ha';
    UPDATE hanke_vaihtoehdot SET pinta_ala_ha = 45, julkaistu = true WHERE id = v_ve;
  END IF;
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'tunnus', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );

  UPDATE hankkeet SET pinta_ala_ha = NULL WHERE id = '451ba13c-121c-4b6d-9380-d3f0e523e1c6';
  v_dok := tmp_dok('451ba13c-121c-4b6d-9380-d3f0e523e1c6', v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id IN ('e083d8da-8c0a-466e-9e93-ddc4e218dff3', 'e2b085de-05c3-4a13-a0c0-9bc2087a2829');
  PERFORM tmp_lapikaynti(
    '451ba13c-121c-4b6d-9380-d3f0e523e1c6', 'eri_asia',
    '23 ha (tilat) ja 45 ha (kampus) → vaihtoehdoille. Hanketason pinta_ala_ha tyhjä.'
  );

  -- ========== 11 Fortum Orimattila ==========
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '0cc2c6ec-5f96-4172-8edb-5ee334b5a767';
  v_ve := NULL;
  INSERT INTO hanke_vaihtoehdot (hanke_id, tunnus, pinta_ala_ha, julkaistu)
  VALUES ('8021e1a8-347a-4119-a6cc-288f52365c15', 'Kaupungin maa-alue 55 ha', 55, true)
  ON CONFLICT (hanke_id, tunnus) DO NOTHING
  RETURNING id INTO v_ve;
  IF v_ve IS NULL THEN
    SELECT id INTO v_ve FROM hanke_vaihtoehdot
    WHERE hanke_id = '8021e1a8-347a-4119-a6cc-288f52365c15' AND tunnus = 'Kaupungin maa-alue 55 ha';
    UPDATE hanke_vaihtoehdot SET pinta_ala_ha = 55, julkaistu = true WHERE id = v_ve;
  END IF;
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'tunnus', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );

  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '7b6698fa-dd70-4049-9496-9e8045ce9c48';
  v_ve := NULL;
  INSERT INTO hanke_vaihtoehdot (hanke_id, tunnus, pinta_ala_ha, julkaistu)
  VALUES ('8021e1a8-347a-4119-a6cc-288f52365c15', 'Hankkeen osuus 130 ha', 130, true)
  ON CONFLICT (hanke_id, tunnus) DO NOTHING
  RETURNING id INTO v_ve;
  IF v_ve IS NULL THEN
    SELECT id INTO v_ve FROM hanke_vaihtoehdot
    WHERE hanke_id = '8021e1a8-347a-4119-a6cc-288f52365c15' AND tunnus = 'Hankkeen osuus 130 ha';
    UPDATE hanke_vaihtoehdot SET pinta_ala_ha = 130, julkaistu = true WHERE id = v_ve;
  END IF;
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'tunnus', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );

  UPDATE hankkeet SET pinta_ala_ha = NULL WHERE id = '8021e1a8-347a-4119-a6cc-288f52365c15';
  v_dok := tmp_dok('8021e1a8-347a-4119-a6cc-288f52365c15', v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id IN ('0cc2c6ec-5f96-4172-8edb-5ee334b5a767', '7b6698fa-dd70-4049-9496-9e8045ce9c48');
  PERFORM tmp_lapikaynti(
    '8021e1a8-347a-4119-a6cc-288f52365c15', 'eri_asia',
    '55 ha (kaupungin maa) ja 130 ha (hankkeen osuus) → vaihtoehdoille. Hanketason pinta_ala_ha tyhjä.'
  );

  -- ========== 12 Bitzero ==========
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '4be10155-e2de-44e5-821b-866a092d0dd7';
  v_ve := NULL;
  INSERT INTO hanke_vaihtoehdot (hanke_id, tunnus, pinta_ala_ha, julkaistu)
  VALUES ('dba6ac36-41b9-48c7-93df-d2a28ee2e2c0', 'Varaus 70 ha', 70, true)
  ON CONFLICT (hanke_id, tunnus) DO NOTHING
  RETURNING id INTO v_ve;
  IF v_ve IS NULL THEN
    SELECT id INTO v_ve FROM hanke_vaihtoehdot
    WHERE hanke_id = 'dba6ac36-41b9-48c7-93df-d2a28ee2e2c0' AND tunnus = 'Varaus 70 ha';
    UPDATE hanke_vaihtoehdot SET pinta_ala_ha = 70, julkaistu = true WHERE id = v_ve;
  END IF;
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'tunnus', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );

  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '87bd2114-d2bb-454e-9d8c-a812be31bdf8';
  v_ve := NULL;
  INSERT INTO hanke_vaihtoehdot (hanke_id, tunnus, pinta_ala_ha, julkaistu)
  VALUES ('dba6ac36-41b9-48c7-93df-d2a28ee2e2c0', 'Site 97,15 ha', 97.15, true)
  ON CONFLICT (hanke_id, tunnus) DO NOTHING
  RETURNING id INTO v_ve;
  IF v_ve IS NULL THEN
    SELECT id INTO v_ve FROM hanke_vaihtoehdot
    WHERE hanke_id = 'dba6ac36-41b9-48c7-93df-d2a28ee2e2c0' AND tunnus = 'Site 97,15 ha';
    UPDATE hanke_vaihtoehdot SET pinta_ala_ha = 97.15, julkaistu = true WHERE id = v_ve;
  END IF;
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'tunnus', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_vaihtoehdot', v_ve, 'pinta_ala_ha', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );

  UPDATE hankkeet SET pinta_ala_ha = NULL WHERE id = 'dba6ac36-41b9-48c7-93df-d2a28ee2e2c0';
  v_dok := tmp_dok('dba6ac36-41b9-48c7-93df-d2a28ee2e2c0', v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id IN ('4be10155-e2de-44e5-821b-866a092d0dd7', '87bd2114-d2bb-454e-9d8c-a812be31bdf8');
  PERFORM tmp_lapikaynti(
    'dba6ac36-41b9-48c7-93df-d2a28ee2e2c0', 'eri_asia',
    '70 ha (varaus) ja 97,15 ha (site) → vaihtoehdoille. Hanketason pinta_ala_ha tyhjä.'
  );
END $$;

DROP FUNCTION tmp_dok(uuid, text);
DROP FUNCTION tmp_lapikaynti(uuid, text, text);
