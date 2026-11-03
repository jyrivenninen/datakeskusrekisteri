-- Teho (3) + IT-teho (2) lukujen läpikäynti.
-- Aja: npx supabase db query --linked -f scripts/kasittele-teho-lapikaynti.sql

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
  p_hanke uuid, p_kentta text, p_paatos text, p_huomautus text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO luvun_lapikaynti (taulu, rivi_id, kentta, paatos, kasittelija, huomautus, kasitelty_pvm)
  VALUES ('hankkeet', p_hanke, p_kentta, p_paatos, 'ylläpito', p_huomautus, now())
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
  v_vaihe uuid;
  v_lahde kentta_lahteet%ROWTYPE;
BEGIN
  -- ========== 1 Telia Helsinki IT 24 vs 28 ==========
  -- 24 MW = IT-teho; 28 MW = asennettu kapasiteetti (eri suure).
  PERFORM tmp_lapikaynti(
    '36110282-b06d-4efa-ad3b-0f09217ae01c', 'it_teho_mw', 'eri_asia',
    '24 MW on IT-sähkökapasiteetti (Telia). 28 MW on DCD:n «total installed capacity» kapasiteetin noston jälkeen — eri suure kuin IT-teho. it_teho_mw säilyy 24.'
  );

  -- ========== 2 atNorth FIN02 IT 25 vs 40 ==========
  -- 25 MW = IT-kapasiteetti; 40 MW = kampuksen teho (jo teho_mw).
  UPDATE hankkeet SET it_teho_mw = 25
  WHERE id = 'cfbe2111-41fb-45cc-8365-144a8da4b39b';
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = 'ee67325d-f365-4e39-b3fb-7030e4960d0b';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'it_teho_mw', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok(v_lahde.rivi_id, v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id = '30570df6-1013-4ef8-90c6-aa6b9d662acb';
  -- Kampuksen 40 MW kuuluu teho_mw-kenttään (jo merkitty).
  PERFORM tmp_lapikaynti(
    'cfbe2111-41fb-45cc-8365-144a8da4b39b', 'it_teho_mw', 'korvattu',
    '25 MW on «total IT capacity» (Data Center Map). 40 MW on «Campus power capacity» (atNorth) → teho_mw, ei IT. it_teho_mw = 25; kampuslähde IT-kentässä merkitty korvatuksi.'
  );

  -- ========== 3 Data Tank Utajärvi 100 vs 200 ==========
  -- Rakennuslupa 200 MW vs vanhempi/epätarkka 100 MW.
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = 'cdb2f6dc-cb65-442f-88d1-1fd7774172f1';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'teho_mw', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), v_lahde.luottamus, v_lahde.lainaus,
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok(v_lahde.rivi_id, v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id = 'd41842ca-52f8-4864-8b73-f34591e4fca2';
  UPDATE hankkeet SET teho_mw = 200 WHERE id = 'd810c69e-3f8b-4e7e-9ab7-04b79e19ba47';
  PERFORM tmp_lapikaynti(
    'd810c69e-3f8b-4e7e-9ab7-04b79e19ba47', 'teho_mw', 'korvattu',
    '200 MW on lainvoimainen rakennuslupa (ePressi). 100 MW (Data Center Map) merkitty korvatuksi — ei vaihe/tavoite-erottelua, vaan vanhempi tai epätarkka luku.'
  );

  -- ========== 4 Glesys Elektroniikkatie 5: 0,4 vs 0,7 ==========
  PERFORM tmp_lapikaynti(
    'b95ca8df-719d-4841-9b25-5bc8808e350c', 'teho_mw', 'eri_asia',
    '0,4 MW on tämän kohteen kapasiteetti (Glesys Docs, Elektroniikkatie 5). 0,7 MW on Data Center Mapin yhdistetty merkintä Elektroniikkatie 13–15 -kampukselle. teho_mw säilyy 0,4.'
  );

  -- ========== 5 Scale42 Kristiinankaupunki: vaihe vs tavoite ==========
  -- Initial 60 MW → rakentamisvaihe; Target 500 MW → hanketaso. 100 MW (Sydin) korvattu.
  UPDATE hankkeet SET teho_mw = 500
  WHERE id = 'e23beec7-2f37-4ce2-8927-19c0af726780';
  SELECT * INTO v_lahde FROM kentta_lahteet WHERE id = '2e9ea497-f823-445b-a1be-995612060b85';
  PERFORM tallenna_kentta_lahde(
    'hankkeet', v_lahde.rivi_id, 'teho_mw', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), 'epavarma',
    'Initial 60 MW … Target 500 MW',
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  INSERT INTO hanke_rakentamisvaiheet (
    hanke_id, jarjestys, nimi, teho_mw, it_teho_mw, tila, julkaistu
  ) VALUES (
    'e23beec7-2f37-4ce2-8927-19c0af726780', 1, 'Ensimmäinen vaihe',
    60, NULL, 'suunniteltu', true
  )
  ON CONFLICT (hanke_id, jarjestys) DO UPDATE SET
    nimi = EXCLUDED.nimi,
    teho_mw = EXCLUDED.teho_mw,
    tila = EXCLUDED.tila,
    julkaistu = true
  RETURNING id INTO v_vaihe;
  PERFORM tallenna_kentta_lahde(
    'hanke_rakentamisvaiheet', v_vaihe, 'teho_mw', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), 'epavarma',
    'Initial 60 MW … Target 500 MW',
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_rakentamisvaiheet', v_vaihe, 'nimi', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), 'epavarma',
    'Initial 60 MW … Target 500 MW',
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  PERFORM tallenna_kentta_lahde(
    'hanke_rakentamisvaiheet', v_vaihe, 'tila', v_lahde.lahde_url, v_lahde.lahde_sivu,
    coalesce(v_lahde.vahvistettu_pvm, CURRENT_DATE), 'epavarma',
    'Initial 60 MW … Target 500 MW',
    'ihmisen_vahvistama', coalesce(v_lahde.lahde_laji, 'html')
  );
  v_dok := tmp_dok(v_lahde.rivi_id, v_lahde.lahde_url);
  UPDATE kentta_lahteet SET tila = 'korvattu', korvaava_dokumentti_id = v_dok
  WHERE id = '5d2bd2f8-c3cb-4d1e-b8e4-5719269129af';
  PERFORM tmp_lapikaynti(
    'e23beec7-2f37-4ce2-8927-19c0af726780', 'teho_mw', 'eri_asia',
    'Sama sääntö kuin Lahti/Campus Oulu: Scale42 «Initial 60 MW … Target 500 MW» → rakentamisvaihe Ensimmäinen vaihe 60 MW, hanketaso teho_mw = 500. Sydinin 100 MW merkitty korvatuksi (ei erota vaihetta ja tavoitetta).'
  );
END;
$$;

DROP FUNCTION tmp_dok(uuid, text);
DROP FUNCTION tmp_lapikaynti(uuid, text, text, text);
