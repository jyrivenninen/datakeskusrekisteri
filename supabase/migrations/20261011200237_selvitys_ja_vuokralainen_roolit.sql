-- Selvityksen laatija (esim. aluetalousselvitys) ja vuokralainen.

INSERT INTO hanke_organisaatio_roolit (tunnus, nimi, jarjestys) VALUES
  ('selvityksen_laatija', 'Selvityksen laatija', 68),
  ('vuokralainen', 'Vuokralainen', 45)
ON CONFLICT (tunnus) DO UPDATE
SET
  nimi = EXCLUDED.nimi,
  jarjestys = EXCLUDED.jarjestys,
  kaytossa = true;

COMMENT ON TABLE hanke_organisaatio_roolit IS
  'Sallitut hanke_organisaatiot.rooli-arvot. '
  'yva_konsultti = hankkeesta vastaavan YVA-konsultti; '
  'kaavan_laatija = asemakaavan tai yleiskaavan laatija (usein kunnan lukuun); '
  'lupahakemuksen_laatija = ympäristö- tai rakennuslupahakemuksen laatija; '
  'selvityksen_laatija = hanketta koskevan selvityksen laatija (ei YVA-selostus); '
  'vuokralainen = kiinteistön tai tontin vuokralainen. '
  'Uusi rooli = INSERT, ei skeemamuutosta.';
