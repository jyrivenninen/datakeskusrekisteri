-- Erottaa YVA-konsultin, kaavan laatijan ja lupahakemuksen laatijan.
-- Nykyiset konsultti-roolit ovat YVA-selostusten laatijoita → yva_konsultti.

INSERT INTO hanke_organisaatio_roolit (tunnus, nimi, jarjestys) VALUES
  ('kaavan_laatija', 'Kaavan laatija', 65),
  ('lupahakemuksen_laatija', 'Lupahakemuksen laatija', 66)
ON CONFLICT (tunnus) DO UPDATE
SET
  nimi = EXCLUDED.nimi,
  jarjestys = EXCLUDED.jarjestys,
  kaytossa = true;

UPDATE hanke_organisaatio_roolit
SET nimi = 'YVA-konsultti', jarjestys = 60, kaytossa = true
WHERE tunnus = 'yva_konsultti';

-- Yleinen «konsultti» sekoitti YVA:n ja kaavoituksen; ei enää käytössä.
UPDATE hanke_organisaatio_roolit
SET nimi = 'Konsultti (vanha)', kaytossa = false
WHERE tunnus = 'konsultti';

UPDATE hanke_organisaatiot
SET rooli = 'yva_konsultti'
WHERE rooli = 'konsultti';

-- Odottavat ehdotukset: sama siirto.
UPDATE muutosehdotukset
SET sisalto = jsonb_set(
  sisalto,
  '{hanke_organisaatio,rooli}',
  '"yva_konsultti"',
  false
)
WHERE tyyppi = 'hanke_organisaatio'
  AND tila = 'odottaa'
  AND sisalto -> 'hanke_organisaatio' ->> 'rooli' = 'konsultti';

COMMENT ON TABLE hanke_organisaatio_roolit IS
  'Sallitut hanke_organisaatiot.rooli-arvot. '
  'yva_konsultti = hankkeesta vastaavan YVA-konsultti; '
  'kaavan_laatija = asemakaavan tai yleiskaavan laatija (usein kunnan lukuun); '
  'lupahakemuksen_laatija = ympäristö- tai rakennuslupahakemuksen laatija. '
  'Uusi rooli = INSERT, ei skeemamuutosta.';
