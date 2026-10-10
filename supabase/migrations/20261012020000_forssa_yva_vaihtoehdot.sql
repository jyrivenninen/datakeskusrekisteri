-- Forssa on YVA-vaihtoehtohanke. Rakentamisvaihe-ehdotus hylätään.
-- Teho 81 MW ja IT-teho 450 MW tyhjennetään vasta hyväksynnällä.
-- VE-luvut tulevat YVA-sivulta; noin-luvut jäävät epävarmoiksi.

UPDATE muutosehdotukset
SET
  tila = 'hylatty',
  kasitelty_pvm = now(),
  kasittelija = 'ylläpito',
  perustelu = 'Forssa ei ole rakentamisvaihehanke. YVA-sivun VE0, VE1 ja VE2 kuuluvat hanke_vaihtoehdot-tauluun. 81 MW on VE1:n rakennuskohtaisen IT-tehon yläraja, ei vaiheen teho.'
WHERE id = '37b1f8d2-ea65-46cd-bc84-4a56ec4825c6'
  AND tila = 'odottaa';

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES (
  'kentta_tyhjennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'tyhjennys', jsonb_build_object(
      'taulu', 'hankkeet',
      'rivi_id', '780537d4-907d-417b-91fe-ddb0fcef250e',
      'kentta', 'teho_mw',
      'perustelu', 'YVA-sivun mukaan VE1:n datakeskusrakennukset ovat IT-teholtaan 54–81 MW rakennusta kohden. 81 MW ei ole laitoksen sähköteho. Ylen lainaus (9 MW kertaa 9 salia) on ristiriidassa YVA-sivun kanssa. YVA on sitova lähde, joten hankkeen teho-kenttä tyhjennetään.',
      'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
      'lainaus', 'Datakeskusrakennukset ovat yksi-kolmekerroksisia IT-teholtaan 54–81 MW rakennuksia.',
      'merkitse_ei_lahdetta', false
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  'Teho 81 MW tyhjennetään. YVA-sivu: rakennukset ovat IT-teholtaan 54–81 MW. Ylen 81 MW (9 MW kertaa 9 salia) on ristiriidassa tämän kanssa. Lukua ei siirretä hankkeen IT-tehoon, koska se on rakennuskohtainen vaihteluväli.'
);

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES (
  'kentta_tyhjennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'tyhjennys', jsonb_build_object(
      'taulu', 'hankkeet',
      'rivi_id', '780537d4-907d-417b-91fe-ddb0fcef250e',
      'kentta', 'it_teho_mw',
      'perustelu', 'YVA-sivu ei ilmoita IT-tehoa 450 MW. Lukua ei merkitä, ennen kuin se löytyy arviointiselostuksesta sellaisenaan ja lainauksena. Jos 450 MW on VE2:n laskennallinen kokonais-IT-teho, se tarvitsee lainauksen. Kenttää ei merkitä pysyvästi lähteettömäksi.',
      'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
      'lainaus', null,
      'merkitse_ei_lahdetta', false
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  'IT-teho 450 MW tyhjennetään. YVA-sivulla ei ole lukua 450 MW eikä lähteellä ole lainausta. Selostuksesta etsittävä luku voidaan kirjata myöhemmin lainauksen kanssa.'
);

INSERT INTO muutosehdotukset (
  tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, lahde_url, huomautus
)
VALUES (
  'taydennys',
  '780537d4-907d-417b-91fe-ddb0fcef250e',
  'yllapitaja',
  'ylläpito',
  jsonb_build_object(
    'kentat', '{}'::jsonb,
    'huomio', 'yva-vaihtoehdot',
    'vaihtoehdot', jsonb_build_object(
      'VE0', jsonb_build_object(
        'tunnus', jsonb_build_object(
          'arvo', 'Hanketta ei toteuteta.',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'VE0: Hanketta ei toteuteta.',
          'luottamus', 'vahvistettu',
          'lahde_laji', 'html'
        )
      ),
      'VE1', jsonb_build_object(
        'pinta_ala_ha', jsonb_build_object(
          'arvo', '89,5',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'Hankevaihtoehdon maa-alueen pinta-ala on noin 89,5 ha.',
          'luottamus', 'epavarma',
          'lahde_laji', 'html'
        ),
        'generaattorit_lkm', jsonb_build_object(
          'arvo', '345',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'VE1 sisältää alustavan suunnitelman mukaisesti yhteensä noin 345 varavoimageneraattoria, jotka on sijoitettu piha-alueille datakeskusrakennusten viereen.',
          'luottamus', 'epavarma',
          'lahde_laji', 'html'
        ),
        'generaattori_polttoaineteho_mw', jsonb_build_object(
          'arvo', '675',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'Varavoimageneraattoreiden yhteenlaskettu kokonaispolttoaineteho on yhteensä noin 675 MW.',
          'luottamus', 'epavarma',
          'lahde_laji', 'html'
        )
      ),
      'VE2', jsonb_build_object(
        'pinta_ala_ha', jsonb_build_object(
          'arvo', '134,5',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'VE2 maa-alueen pinta-ala on noin 134,5 ha.',
          'luottamus', 'epavarma',
          'lahde_laji', 'html'
        ),
        'generaattorit_lkm', jsonb_build_object(
          'arvo', '493',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'VE2 sisältää yhteensä noin 493 varavoimageneraattoria, jotka on sijoitettu piha-alueille datakeskusrakennusten viereen.',
          'luottamus', 'epavarma',
          'lahde_laji', 'html'
        ),
        'generaattori_polttoaineteho_mw', jsonb_build_object(
          'arvo', '963',
          'lahde_url', 'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
          'lahde_sivu', null,
          'lainaus', 'Varavoimageneraattoreiden kokonaispolttoaineteho on yhteensä noin 963 MW.',
          'luottamus', 'epavarma',
          'lahde_laji', 'html'
        )
      )
    )
  ),
  'odottaa',
  'https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/forssan-datakeskus',
  'YVA-vaihtoehdot VE0, VE1 ja VE2. Noin-luvut jäävät epävarmoiksi. VE1: kuusi rakennusta, IT-teho 54–81 MW rakennusta kohden. VE2 sisältää VE1:n ja lisäksi rakennuksia, IT-teho 24–54 MW rakennusta kohden. Vaihteluväliä ei kirjoiteta yhdeksi IT-tehoksi. Kevyttä polttoöljyä VE1 15 350 m³ ja VE2 23 400 m³; taulussa ei ole polttoainevaraston kenttää. Hankkeen generaattorit 345 ja polttoaineteho 675 MW ovat VE1:n lukuja ja jäävät hankkeelle. Perustellun päätelmän jonossa oleva ehdotus esittää VE1:lle 1830 MWth.'
);

DO $$
DECLARE
  v_hylatty integer;
  v_uudet integer;
BEGIN
  SELECT count(*) INTO v_hylatty
  FROM muutosehdotukset
  WHERE id = '37b1f8d2-ea65-46cd-bc84-4a56ec4825c6'
    AND tila = 'hylatty';
  IF v_hylatty <> 1 THEN
    RAISE EXCEPTION 'Forssan rakentamisvaihe-ehdotusta ei hylätty';
  END IF;

  SELECT count(*) INTO v_uudet
  FROM muutosehdotukset
  WHERE hanke_id = '780537d4-907d-417b-91fe-ddb0fcef250e'
    AND tila = 'odottaa'
    AND (
      (tyyppi = 'kentta_tyhjennys' AND sisalto #>> '{tyhjennys,kentta}' IN ('teho_mw', 'it_teho_mw'))
      OR (tyyppi = 'taydennys' AND sisalto ->> 'huomio' = 'yva-vaihtoehdot')
    );
  IF v_uudet <> 3 THEN
    RAISE EXCEPTION 'Forssan YVA-jono jäi vajaaksi: % / 3', v_uudet;
  END IF;
END $$;
