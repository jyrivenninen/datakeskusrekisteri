-- PALAUTUS — geokoodaus-URL:t rekisteri → menetelmä (2026-10-13).
-- Älä aja, ellei palautusta tarvita.
-- Palauttaa vain lahde_tyyppi='rekisteri' näille 24 dokumentille.

UPDATE dokumentit
SET lahde_tyyppi = 'rekisteri'
WHERE id IN (
  'f11a53f4-0f16-47bb-bdf0-614e0072f235', -- Hanhela, Raahe
  '87a24f38-f2c4-4733-80e6-369f06e1340e', -- Herva
  'c482ebd1-3d57-4600-86c6-75c8dbd9be04', -- Honkaluoto
  '37942595-54e1-47cd-b158-0436ee17575c', -- Huutokoski
  '78229cd9-2dec-40db-b76e-c7236c1172e5', -- Kärppäkorpi, Kyyjärvi
  'a2d95150-e8cb-4631-8513-76fb560c617d', -- Kapuli
  '01a1854f-c8fe-43b0-a305-f872c7a859b5', -- Karhukorpi
  '872ea23b-3db4-4c01-b8a6-709fd5573c8e', -- Keskikylä, Pyhäjoki
  '833c5e31-d860-4d09-b2af-9f8322df5c34', -- Kiertokangas
  'a37c4a5f-8726-4654-b97c-e99b6af8f25d', -- Kissankallio
  '6f3dc398-d738-42fd-87a9-c96dbb866a0c', -- Kissankallio, Eurajoki
  '9128ab8b-f02c-4b29-ab5e-9fe41c2e2394', -- Kivenneva
  'dc868261-d3d8-42a7-8c44-046ab9a6c2c4', -- Kiveriö
  'b5bc620c-05e4-471e-820b-df93b7b0691f', -- Kukonkylä
  'dbf6f765-8d9c-4d1f-9504-a03aa4e531c8', -- Mykänmaa
  'd65c9d45-f2b0-4118-9565-dd29d907868b', -- Nätkin, Savonlinna
  '1dd02fbf-c14a-4bf0-b671-3b213a21c11e', -- Olkkonen
  '731fbda1-7efc-429e-a470-f1be74d02990', -- Pasila
  '1d06ed90-04a4-4ccf-b8bc-e418878030fd', -- Pispantalli, Valkeakoski
  '77eb9363-dd64-4393-8aff-6de22c7e1558', -- Rautalampi
  '9d5343d6-4386-4622-9ad3-7f3bb9c30169', -- Ruskonselkä
  '9b0494e5-25d2-41a4-a0ee-5c49b3415a8a', -- Söderkulla, Sipoo
  '2c91915e-54b6-43ac-9588-dab50adf4c06', -- Stormosskärret
  '5dc2b0b8-5d22-4d20-9cc6-ee58372806ff'  -- Visulahti
)
AND lahde_tyyppi = 'menetelma'
AND url ILIKE '%avoin-paikkatieto.maanmittauslaitos.fi%/geocoding/%';

-- Verifiointi:
-- SELECT count(*) FROM dokumentit
-- WHERE lahde_tyyppi='rekisteri'
--   AND url ILIKE '%avoin-paikkatieto.maanmittauslaitos.fi%/geocoding/%';
-- odotus: 24
