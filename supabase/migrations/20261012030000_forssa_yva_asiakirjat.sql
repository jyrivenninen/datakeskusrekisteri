-- Forssan YVA-sivun puuttuvat julkiset asiakirjat jonoon.
-- Liitteitä 13, 15, 17 ja 18 ei ole sivulla linkkinä, eikä niitä lisätä.

CREATE FUNCTION julkaise_hanke_asiakirjat(
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
  v_dok jsonb;
  v_id uuid;
  v_url text;
  v_otsikko text;
  v_laji text;
  v_muoto text;
  v_lainaus text;
  v_julkaisija text;
  v_julkaisija_lainaus text;
  v_lahde_url text;
  v_lahde_tyyppi text;
  v_sitovuus text;
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
    RAISE EXCEPTION 'Asiakirjaehdotukselta puuttuu hanke';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_ehdotus.hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;
  IF jsonb_typeof(v_ehdotus.sisalto -> 'asiakirjat') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_ehdotus.sisalto -> 'asiakirjat') = 0 THEN
    RAISE EXCEPTION 'Ehdotuksessa ei ole asiakirjoja';
  END IF;

  v_julkaisija := NULLIF(btrim(COALESCE(v_ehdotus.sisalto ->> 'julkaisija', '')), '');
  v_julkaisija_lainaus := NULLIF(btrim(COALESCE(v_ehdotus.sisalto ->> 'julkaisija_lainaus', '')), '');
  v_lahde_url := NULLIF(btrim(COALESCE(v_ehdotus.sisalto ->> 'lahde_url', '')), '');
  v_lahde_tyyppi := NULLIF(btrim(COALESCE(v_ehdotus.sisalto ->> 'lahde_tyyppi', '')), '');
  v_sitovuus := NULLIF(btrim(COALESCE(v_ehdotus.sisalto ->> 'sitovuustaso', '')), '');

  IF v_julkaisija IS NULL OR v_julkaisija_lainaus IS NULL OR v_lahde_url IS NULL THEN
    RAISE EXCEPTION 'Asiakirjaehdotukselta puuttuu julkaisija tai lähde';
  END IF;
  IF v_lahde_tyyppi IS DISTINCT FROM 'viranomaisasiakirja' THEN
    RAISE EXCEPTION 'Lähdetyyppi ei ole viranomaisasiakirja';
  END IF;
  IF v_sitovuus IS DISTINCT FROM 'virallinen' THEN
    RAISE EXCEPTION 'Sitovuustaso ei ole virallinen';
  END IF;

  FOR v_dok IN
    SELECT value FROM jsonb_array_elements(v_ehdotus.sisalto -> 'asiakirjat')
  LOOP
    v_url := NULLIF(btrim(COALESCE(v_dok ->> 'url', '')), '');
    v_otsikko := NULLIF(btrim(COALESCE(v_dok ->> 'otsikko', '')), '');
    v_laji := NULLIF(btrim(COALESCE(v_dok ->> 'laji', '')), '');
    v_muoto := NULLIF(btrim(COALESCE(v_dok ->> 'muoto', '')), '');
    v_lainaus := NULLIF(btrim(COALESCE(v_dok ->> 'lainaus', '')), '');

    IF v_url IS NULL OR v_url !~ '^https://' OR v_otsikko IS NULL OR v_lainaus IS NULL THEN
      RAISE EXCEPTION 'Asiakirjan url, otsikko tai lainaus puuttuu';
    END IF;
    IF v_laji IS NULL OR v_laji NOT IN ('kuulutus', 'yva_ohjelma', 'yva_selostus', 'muu') THEN
      RAISE EXCEPTION 'Asiakirjan laji ei ole sallittu: %', v_url;
    END IF;
    IF v_muoto IS DISTINCT FROM 'pdf' THEN
      RAISE EXCEPTION 'Asiakirjan muoto ei ole pdf: %', v_url;
    END IF;

    SELECT id INTO v_id FROM dokumentit WHERE url = v_url;
    IF v_id IS NOT NULL THEN
      RAISE EXCEPTION 'Asiakirja on jo rekisterissä: %', v_url;
    END IF;

    INSERT INTO dokumentit (
      hanke_id, url, otsikko, laji, muoto, julkaisija, julkaistu, lahde_tyyppi, sitovuustaso
    )
    VALUES (
      v_ehdotus.hanke_id, v_url, v_otsikko, v_laji, v_muoto, v_julkaisija, true,
      v_lahde_tyyppi, v_sitovuus
    )
    RETURNING id INTO v_id;

    PERFORM tallenna_kentta_lahde(
      'dokumentit', v_id, 'otsikko',
      v_lahde_url, NULL, CURRENT_DATE, 'vahvistettu', v_lainaus,
      'ihmisen_vahvistama', 'html'
    );
    PERFORM tallenna_kentta_lahde(
      'dokumentit', v_id, 'laji',
      v_lahde_url, NULL, CURRENT_DATE, 'vahvistettu', v_lainaus,
      'ihmisen_vahvistama', 'html'
    );
    PERFORM tallenna_kentta_lahde(
      'dokumentit', v_id, 'muoto',
      v_lahde_url, NULL, CURRENT_DATE, 'vahvistettu', v_lainaus,
      'ihmisen_vahvistama', 'html'
    );
    PERFORM tallenna_kentta_lahde(
      'dokumentit', v_id, 'julkaisija',
      v_lahde_url, NULL, CURRENT_DATE, 'vahvistettu', v_julkaisija_lainaus,
      'ihmisen_vahvistama', 'html'
    );
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id;
END;
$$;

COMMENT ON FUNCTION julkaise_hanke_asiakirjat(uuid, text) IS
  'Hyväksyy hankkeen asiakirjat: luo dokumenttirivit lähteineen. Vain ihmisen hyväksyntä.';

REVOKE ALL ON FUNCTION julkaise_hanke_asiakirjat(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION julkaise_hanke_asiakirjat(uuid, text) TO service_role;

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES (
  'taydennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  $json${
  "kentat": {},
  "huomio": "yva-asiakirjat",
  "julkaisija": "Lupa- ja valvontavirasto",
  "julkaisija_lainaus": "Yhteysviranomainen: Lupa- ja valvontavirasto",
  "lahde_tyyppi": "viranomaisasiakirja",
  "sitovuustaso": "virallinen",
  "lahde_url": "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus",
  "asiakirjat": [
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/FIN1-ARP-FOR-XX-RP-Z-0100-P04_ymp%C3%A4rist%C3%B6vaikutusten_arviointiohjelma.pdf",
      "otsikko": "Arviointiohjelma, Forssan datakeskushanke",
      "laji": "yva_ohjelma",
      "muoto": "pdf",
      "lainaus": "Arviointiohjelma, Forssan datakeskushanke"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/kuulutus_forssa_yva_ohjelma22.10%E2%80%9321.11.2025.pdf",
      "otsikko": "Kuulutus, Forssan datakeskushanke",
      "laji": "kuulutus",
      "muoto": "pdf",
      "lainaus": "Kuulutus, Forssan datakeskushanke"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/lausuntopyynto_forssan_datakeskus_yva_ohjelma.pdf",
      "otsikko": "Lausuntopyyntö, Forssan datakeskushanke",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Lausuntopyyntö, Forssan datakeskushanke"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Arviointiohjelmasta%20saadut%20lausunnot%2C%20Forssan%20datakeskushanke.pdf",
      "otsikko": "Arviointiohjelmasta saadut lausunnot, Forssan datakeskushanke",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Arviointiohjelmasta saadut lausunnot, Forssan datakeskushanke"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2001A%20Yhteysviranomaisen%20lausunto%20ymp%C3%A4rist%C3%B6vaikutusten%20arviointiohjelmasta.pdf",
      "otsikko": "Liite 1A. Yhteysviranomaisen lausunto ympäristövaikutusten arviointiohjelmasta, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 1A. Yhteysviranomaisen lausunto ympäristövaikutusten arviointiohjelmasta, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2001B%20YVA-ohjelmasta%20annetun%20lausunnon%20huomioiminen%20YVA-selostuksessa.pdf",
      "otsikko": "Liite 1B. YVA-ohjelmasta annetun lausunnon huomioiminen YVA-selostuksessa, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 1B. YVA-ohjelmasta annetun lausunnon huomioiminen YVA-selostuksessa, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2002%20Alueen%20alustava%20maisemointisuunnitelma.pdf",
      "otsikko": "Liite 2. Alueen alustava maisemointisuunnitelma, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 2. Alueen alustava maisemointisuunnitelma, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2003%20Rakentamisen%20ja%20toiminnan%20aikainen%20hulevesien%20alustava%20hallintasuunnitelma.pdf",
      "otsikko": "Liite 3. Rakentamisen ja toiminnan aikainen hulevesien alustava hallintasuunnitelma, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 3. Rakentamisen ja toiminnan aikainen hulevesien alustava hallintasuunnitelma, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2004%20Hankealueen%20alustava%20massatasapainolaskenta.pdf",
      "otsikko": "Liite 4. Hankealueen alustava massatasapainolaskenta, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 4. Hankealueen alustava massatasapainolaskenta, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2005%20Asiantuntijaluettelo.pdf",
      "otsikko": "Liite 5. Asiantuntijaluettelo, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 5. Asiantuntijaluettelo, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2006%20Asukaskyselyn%20tiivistelm%C3%A4.pdf",
      "otsikko": "Liite 6. Asukaskyselyn tiivistelmä, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 6. Asukaskyselyn tiivistelmä, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2007%20Ilmastonmuutoksen%20riskiarviointi.pdf",
      "otsikko": "Liite 7. Ilmastonmuutoksen riskiarviointi, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 7. Ilmastonmuutoksen riskiarviointi, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2008%20Hiilijalanj%C3%A4ljen%20arviointi.pdf",
      "otsikko": "Liite 8. Hiilijalanjäljen arviointi, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 8. Hiilijalanjäljen arviointi, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2009_Ilmanlaatuselvitys.pdf",
      "otsikko": "Liite 9. Ilmanlaatuselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 9. Ilmanlaatuselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2010%20Rakentamisen%20aikainen%20meluselvitys.pdf",
      "otsikko": "Liite 10. Rakentamisen aikainen meluselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 10. Rakentamisen aikainen meluselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2011%20Toiminnan%20aikainen%20meluselvitys.pdf",
      "otsikko": "Liite 11. Toiminnan aikainen meluselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 11. Toiminnan aikainen meluselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2012%20Kasvillisuus-%20ja%20luontotyyppiselvitys.pdf",
      "otsikko": "Liite 12. Kasvillisuus- ja luontotyyppiselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 12. Kasvillisuus- ja luontotyyppiselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2014%20El%C3%A4inselvitykset.pdf",
      "otsikko": "Liite 14. Eläinselvitykset, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 14. Eläinselvitykset, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2016%20Pesim%C3%A4linnustoselvitys_0_0.pdf",
      "otsikko": "Liite 16. Pesimälinnustoselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 16. Pesimälinnustoselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2019%20N%C3%A4kym%C3%A4selvitys.pdf",
      "otsikko": "Liite 19. Näkymäselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 19. Näkymäselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2020%20IMPERIA-taulukot.pdf",
      "otsikko": "Liite 20. IMPERIA-taulukot, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 20. IMPERIA-taulukot, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2021%20Forssa%20Pienvesiselvitys%202025.pdf",
      "otsikko": "Liite 21. Forssa pienvesiselvitys, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 21. Forssa pienvesiselvitys, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2022%20Pintavesin%C3%A4ytteenoton%20muistio.pdf",
      "otsikko": "Liite 22. Pintavesinäytteenoton muistio, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 22. Pintavesinäytteenoton muistio, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Liite%2023%20Pinta-%20ja%20pohjaveden%20tarkkailuraportti.pdf",
      "otsikko": "Liite 23. Pinta- ja pohjaveden tarkkailuraportti, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Liite 23. Pinta- ja pohjaveden tarkkailuraportti, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Kuulutus%20Forssa%20datakeskus%20YVAS.pdf",
      "otsikko": "Kuulutus YVA-selostuksesta, Forssan datakeskus",
      "laji": "kuulutus",
      "muoto": "pdf",
      "lainaus": "Kuulutus YVA-selostuksesta, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/LVV%20Lausuntopyynt%C3%B6%20arviointiselostuksesta%20Forssan%20datakeskus.pdf",
      "otsikko": "Lausuntopyyntö arviointiselostuksesta, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Lausuntopyyntö arviointiselostuksesta, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/Kooste%2C%20Forssan%20datakeskus.pdf",
      "otsikko": "Annetut lausunnot arviointiselostuksesta, Forssan datakeskus",
      "laji": "muu",
      "muoto": "pdf",
      "lainaus": "Annetut lausunnot arviointiselostuksesta, Forssan datakeskus"
    },
    {
      "url": "https://www.ymparisto.fi/sites/default/files/documents/LVV%20Kuulutus%20perustellusta%20p%C3%A4%C3%A4telm%C3%A4st%C3%A4%2C%20Forssan%20datakeskus.pdf",
      "otsikko": "Kuulutus perustellusta päätelmästä, Forssan datakeskus",
      "laji": "kuulutus",
      "muoto": "pdf",
      "lainaus": "Kuulutus perustellusta päätelmästä, Forssan datakeskus"
    }
  ]
}$json$::jsonb,
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  'YVA-sivun 31 julkisesta pdf:stä 28 puuttuu rekisteristä. Kolme on jo rekisterissä: arviointiselostus, yhteysviranomaisen lausunto arviointiohjelmasta ja perusteltu päätelmä. Liitteitä 13, 15, 17 ja 18 ei linkitetä, koska sivu merkitsee ne vain viranomaiskäyttöön. Julkaisija on Lupa- ja valvontavirasto ja lähdetyyppi viranomaisasiakirja.'
);

DO $$
DECLARE
  v_lkm integer;
BEGIN
  SELECT jsonb_array_length(sisalto -> 'asiakirjat') INTO v_lkm
  FROM muutosehdotukset
  WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e'
    AND tila = 'odottaa'
    AND sisalto ->> 'huomio' = 'yva-asiakirjat';
  IF v_lkm IS DISTINCT FROM 28 THEN
    RAISE EXCEPTION 'Forssan asiakirjajono jäi vajaaksi: % / 28', v_lkm;
  END IF;
END $$;
