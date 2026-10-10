-- Hyväksyntä luo hanke_rakentamisvaiheet-rivin ja sen lähteet.
-- Tyhjä lainaus tai vaatii_lukeminen estää julkaisun.

CREATE FUNCTION julkaise_rakentamisvaiheet(
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ehdotus muutosehdotukset;
  v_vaihe jsonb;
  v_kentta text;
  v_vaihe_id uuid;
  v_it numeric;
  v_teho numeric;
  v_luottamus text;
  v_laji text;
  v_lainaus text;
  v_url text;
  v_sivu integer;
BEGIN
  IF p_kasittelija IS NULL OR btrim(p_kasittelija) = '' THEN
    RAISE EXCEPTION 'Käsittelijä puuttuu';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei löytynyt';
  END IF;
  IF v_ehdotus.tila IS DISTINCT FROM 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotus on jo käsitelty';
  END IF;
  IF v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Rakentamisvaiheelta puuttuu hanke';
  END IF;
  IF COALESCE((v_ehdotus.sisalto ->> 'vaatii_lukeminen')::boolean, false) THEN
    RAISE EXCEPTION 'Ehdotus vaatii lähteen lukemista ennen hyväksyntää';
  END IF;
  IF jsonb_typeof(v_ehdotus.sisalto -> 'rakentamisvaiheet') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_ehdotus.sisalto -> 'rakentamisvaiheet') = 0 THEN
    RAISE EXCEPTION 'Ehdotuksessa ei ole rakentamisvaiheita';
  END IF;

  IF jsonb_typeof(v_ehdotus.sisalto -> 'tyhjenna_kentat') = 'array' THEN
    FOR v_kentta IN
      SELECT jsonb_array_elements_text(v_ehdotus.sisalto -> 'tyhjenna_kentat')
    LOOP
      IF v_kentta = 'teho_mw' THEN
        UPDATE hankkeet SET teho_mw = NULL WHERE id = v_ehdotus.hanke_id;
      ELSIF v_kentta = 'it_teho_mw' THEN
        UPDATE hankkeet SET it_teho_mw = NULL WHERE id = v_ehdotus.hanke_id;
      ELSE
        RAISE EXCEPTION 'Tyhjennettävä kenttä ei ole sallittu: %', v_kentta;
      END IF;
      DELETE FROM kentta_lahteet
      WHERE taulu = 'hankkeet'
        AND rivi_id = v_ehdotus.hanke_id
        AND kentta = v_kentta;
    END LOOP;
  END IF;

  FOR v_vaihe IN
    SELECT value FROM jsonb_array_elements(v_ehdotus.sisalto -> 'rakentamisvaiheet')
  LOOP
    v_lainaus := NULLIF(btrim(COALESCE(v_vaihe ->> 'lainaus', '')), '');
    v_url := NULLIF(btrim(COALESCE(v_vaihe ->> 'lahde_url', '')), '');
    IF v_lainaus IS NULL OR v_url IS NULL THEN
      RAISE EXCEPTION 'Rakentamisvaiheen lainaus tai lähde-URL puuttuu';
    END IF;
    IF NULLIF(btrim(COALESCE(v_vaihe ->> 'nimi', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Rakentamisvaiheen nimi puuttuu';
    END IF;
    IF COALESCE(v_vaihe ->> 'tila', '') NOT IN ('suunniteltu', 'rakenteilla', 'kaytossa') THEN
      RAISE EXCEPTION 'Rakentamisvaiheen tila ei ole sallittu';
    END IF;
    IF COALESCE((v_vaihe ->> 'jarjestys')::integer, 0) < 1 THEN
      RAISE EXCEPTION 'Rakentamisvaiheen järjestys puuttuu';
    END IF;

    v_it := NULLIF(v_vaihe ->> 'it_teho_mw', '')::numeric;
    v_teho := NULLIF(v_vaihe ->> 'teho_mw', '')::numeric;
    IF v_it IS NULL AND v_teho IS NULL THEN
      RAISE EXCEPTION 'Rakentamisvaiheelta puuttuu teho';
    END IF;

    v_luottamus := COALESCE(NULLIF(btrim(COALESCE(v_vaihe ->> 'luottamus', '')), ''), 'epavarma');
    IF v_luottamus NOT IN ('vahvistettu', 'epavarma', 'ristiriitainen') THEN
      RAISE EXCEPTION 'Luottamus ei ole sallittu';
    END IF;
    v_laji := COALESCE(NULLIF(btrim(COALESCE(v_vaihe ->> 'lahde_laji', '')), ''), 'html');
    IF v_laji NOT IN ('dokumentti', 'rajapinta', 'rss', 'html') THEN
      RAISE EXCEPTION 'lahde_laji puuttuu tai ei ole sallittu';
    END IF;
    v_sivu := NULLIF(v_vaihe ->> 'lahde_sivu', '')::integer;

    INSERT INTO hanke_rakentamisvaiheet (
      hanke_id, jarjestys, nimi, it_teho_mw, teho_mw, tila, julkaistu
    )
    VALUES (
      v_ehdotus.hanke_id,
      (v_vaihe ->> 'jarjestys')::integer,
      btrim(v_vaihe ->> 'nimi'),
      v_it,
      v_teho,
      v_vaihe ->> 'tila',
      true
    )
    RETURNING id INTO v_vaihe_id;

    PERFORM tallenna_kentta_lahde(
      'hanke_rakentamisvaiheet', v_vaihe_id, 'nimi',
      v_url, v_sivu, CURRENT_DATE, v_luottamus, v_lainaus,
      'ihmisen_vahvistama', v_laji
    );
    PERFORM tallenna_kentta_lahde(
      'hanke_rakentamisvaiheet', v_vaihe_id, 'tila',
      v_url, v_sivu, CURRENT_DATE, v_luottamus, v_lainaus,
      'ihmisen_vahvistama', v_laji
    );
    IF v_it IS NOT NULL THEN
      PERFORM tallenna_kentta_lahde(
        'hanke_rakentamisvaiheet', v_vaihe_id, 'it_teho_mw',
        v_url, v_sivu, CURRENT_DATE, v_luottamus, v_lainaus,
        'ihmisen_vahvistama', v_laji
      );
    END IF;
    IF v_teho IS NOT NULL THEN
      PERFORM tallenna_kentta_lahde(
        'hanke_rakentamisvaiheet', v_vaihe_id, 'teho_mw',
        v_url, v_sivu, CURRENT_DATE, v_luottamus, v_lainaus,
        'ihmisen_vahvistama', v_laji
      );
    END IF;
  END LOOP;

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
END;
$$;

COMMENT ON FUNCTION julkaise_rakentamisvaiheet(uuid, text) IS
  'Hyväksyy rakentamisvaiheet: luo rivit ja lähteet, voi tyhjentää hankkeen teho-kentän. Vain ihmisen hyväksyntä. Luottamusta ei nosteta.';

REVOKE ALL ON FUNCTION julkaise_rakentamisvaiheet(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_rakentamisvaiheet(uuid, text) TO service_role;

-- Lahti: 50 MW on ensimmäisen rakennuksen IT-teho. 128 MW jää hankkeen IT-tehoksi.
UPDATE muutosehdotukset
SET
  sisalto = jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'rakentamisvaihe',
    'tyhjenna_kentat', jsonb_build_array('teho_mw'),
    'rakentamisvaiheet', jsonb_build_array(
      jsonb_build_object(
        'jarjestys', 1,
        'nimi', 'Ensimmäinen rakennus',
        'it_teho_mw', 50,
        'tila', 'suunniteltu',
        'lahde_url', 'https://dayonedc.com/markets/dayone-announces-flagship-hyperscale-data-center-project-in-lahti-finland',
        'lainaus', 'With a total potential capacity of 128 megawatts (MW) IT load, the project comprises a first building of 50MW IT load.',
        'luottamus', 'epavarma',
        'lahde_laji', 'html'
      )
    )
  ),
  huomautus = 'Hyväksyntä luo rakentamisvaiheen Ensimmäinen rakennus: IT-teho 50 MW, tila suunniteltu. Lainaus on DayOnen ilmoitus first building of 50MW IT load. Hankkeen teho-kenttä tyhjennetään, koska 50 MW on vaiheen IT-teho. IT-teho 128 MW jää hankkeelle täyden rakentamisen lukuna. Luottamus säilyy epävarmana. Etusivun laskuri käyttää jo 128 MW:a.'
WHERE id = 'ada4dfc5-c46c-4049-9a0d-b17ae01e9701'
  AND tila = 'odottaa';

-- Campus: noin 8 MW on ensimmäisen vaiheen IT-teho. 300 MW jää hankkeen tehoksi.
UPDATE muutosehdotukset
SET
  sisalto = jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'rakentamisvaihe',
    'tyhjenna_kentat', jsonb_build_array('it_teho_mw'),
    'rakentamisvaiheet', jsonb_build_array(
      jsonb_build_object(
        'jarjestys', 1,
        'nimi', 'Ensimmäinen vaihe',
        'it_teho_mw', 8,
        'tila', 'suunniteltu',
        'lahde_url', 'https://glesys.se/blog/glesys-signs-agreement-with-trevian-to-establish-new-data-center-campus-in-oulu-finland/',
        'lainaus', 'the first deployment phase is expected to be ready for service in autumn 2026, supporting an initial IT load of approximately 8 MW.',
        'luottamus', 'epavarma',
        'lahde_laji', 'html'
      )
    )
  ),
  huomautus = 'Hyväksyntä luo rakentamisvaiheen Ensimmäinen vaihe: IT-teho noin 8 MW, tila suunniteltu. Lainaus on GleSysin ilmoitus initial IT load of approximately 8 MW. Hankkeen IT-teho tyhjennetään, koska 8 MW on vaiheen luku. Teho 300 MW jää hankkeelle laajennusvarana. Etusivun laskuri käyttää hyväksynnän jälkeen 300 MW:a. Luottamus säilyy epävarmana. Vaihetta ja tavoitetta ei lasketa yhteen.'
WHERE id = '91f3f012-db39-4e09-98c6-55168ea72d58'
  AND tila = 'odottaa';

-- Forssa: 81 MW on laitoksen sähköteho, ei vaiheen IT-teho. IT-tehon lainaus on tyhjä.
UPDATE muutosehdotukset
SET
  sisalto = jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'rakentamisvaihe',
    'vaatii_lukeminen', true
  ),
  huomautus = 'Lukemista vaativa. Tehon 81 MW lainaus sanoo, että se on laitoksen tarvitsema sähköteho: jokaisen datasalin tehotavoite on 9 megawattia, yhteensä 81 megawattia. Se ei ole ensimmäisen vaiheen IT-teho. IT-tehon 450 MW lainaus on tyhjä. Lähde on luettava ennen vaiheriviä. Hyväksyntä ei luo vaihetta.'
WHERE id = '37b1f8d2-ea65-46cd-bc84-4a56ec4825c6'
  AND tila = 'odottaa';

-- Espoo: YVA-ohjelman lainaukset ovat tyhjiä.
UPDATE muutosehdotukset
SET
  sisalto = jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'rakentamisvaihe',
    'vaatii_lukeminen', true
  ),
  huomautus = 'Lukemista vaativa. YVA-ohjelman lainaukset teholle 265 MW ja IT-teholle 172,8 MW ovat tyhjiä. Ohjelma on luettava ennen kuin luvut jaetaan rakentamisvaiheisiin. Hyväksyntä ei luo vaihetta.'
WHERE id = '482ac407-053e-4f9b-9521-6258f5ba1e1e'
  AND tila = 'odottaa';

DO $$
DECLARE
  v_valmiit integer;
BEGIN
  SELECT count(*) INTO v_valmiit
  FROM muutosehdotukset
  WHERE tila = 'odottaa'
    AND (
      (
        id = 'ada4dfc5-c46c-4049-9a0d-b17ae01e9701'
        AND jsonb_exists(sisalto, 'rakentamisvaiheet')
      )
      OR (
        id = '91f3f012-db39-4e09-98c6-55168ea72d58'
        AND jsonb_exists(sisalto, 'rakentamisvaiheet')
      )
      OR (
        id = '37b1f8d2-ea65-46cd-bc84-4a56ec4825c6'
        AND COALESCE((sisalto ->> 'vaatii_lukeminen')::boolean, false)
      )
      OR (
        id = '482ac407-053e-4f9b-9521-6258f5ba1e1e'
        AND COALESCE((sisalto ->> 'vaatii_lukeminen')::boolean, false)
      )
    );
  IF v_valmiit <> 4 THEN
    RAISE EXCEPTION 'Rakentamisvaihejonon päivitys jäi vajaaksi: % / 4', v_valmiit;
  END IF;
END $$;
