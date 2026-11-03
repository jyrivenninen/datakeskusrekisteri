-- PALAUTUS (ÄLÄ AJA ilman erillistä lupaa)
-- Palauttaa A2:n luottamus_epavarma -> vahvistettu lokin rivi-ideille.
-- HUOM: loki ei sisällä vanhaa vahvistettu_pvm:ää; päivää ei voida palauttaa automaattisesti.
-- RPC paivita_kentta_lahde_sisalto asettaa vahvistettu_pvm=CURRENT_DATE; sama tehtiin SQL-jatkon SET:llä.
-- Suositus: palauta vain luottamus, jätä vahvistettu_pvm ennalleen TAI aseta manuaalisesti merkitty_pvm::date.
BEGIN;
CREATE TEMP TABLE a2_palautus(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO a2_palautus(id) VALUES
  ('c2c4976c-5117-4e86-8d65-2fc5645d77ee'),
  ('eec9e03c-a5e2-4b24-b46e-8bbc758d6457'),
  ('1b485c6a-ea23-4ffa-ba70-e49c9495cc53'),
  ('183ff137-5eb2-4804-88f1-a3da0e912a9a'),
  ('f28c4805-0e69-4002-873c-8a2b2f28f327'),
  ('f79a8b5f-e645-4645-bd41-436acac9ec5a'),
  ('cf0f4e81-9059-47a0-91fe-3581c5533e36'),
  ('3216c5c7-b969-4b41-9019-701224ad4590'),
  ('1b1c3581-72f8-425f-910f-709fc184b6e7'),
  ('054738a9-bc5e-46fe-91ee-87a2dd7f509e'),
  ('09b2de3d-d28d-4e6f-a450-989e69065832'),
  ('0e7642af-80d5-4378-ab22-ad161ee5cef6'),
  ('e1b57a88-532b-46a1-aa24-c5554a21a337'),
  ('d556c148-923e-41be-9f85-2883d8fc3d16'),
  ('f4f06710-bf10-412f-a0bc-234f2b156492'),
  ('11ea9dd1-edc7-490c-8ec3-b18269e34e02'),
  ('3ca4f829-e72d-46d7-a2cd-66edd18383d0'),
  ('5bb60e29-6c0a-441c-8c40-b673830bee2a'),
  ('51018fe5-bb81-4e34-906a-9e20e2cad269'),
  ('3ff68340-4739-4dd1-b2e0-7c2ebaf8b63e'),
  ('8b01835c-d338-428f-9ecb-9c98004a860c'),
  ('c65162e6-36bc-40fd-9473-5e5589800f51'),
  ('5d908f23-e3d5-4ee1-a334-eda6b0ebc3b4'),
  ('73abf113-67f3-4be3-8220-0799340ae27e'),
  ('03c879bb-6ba4-4218-8c4d-4862f41ad9a6'),
  ('a1aa4220-074d-404a-8173-ec0112a73c43'),
  ('a0de3962-e296-4586-b268-96ef3af4940b'),
  ('5c8ec425-752a-4a1d-81fc-4c6ed5c7c607'),
  ('3477e97a-2464-4384-8f95-1a986283718b'),
  ('8c4e34fd-3e6f-4ea4-8d78-9b21fb05c843'),
  ('031923e1-5d11-40f2-8517-a3104ecd737c'),
  ('5b44981d-f208-4449-b721-535fca2ca68b'),
  ('c3f3af28-f13e-4c70-a678-31a4423bf84d'),
  ('95dc7143-a24f-4d57-b36f-11f42c8ff676'),
  ('edc947bf-8248-400d-b216-1f65a6c967cd'),
  ('d5f441e5-34a0-4ef3-ba1f-b855cf5c46dc'),
  ('89a1c6f6-652e-44f0-9b01-85879dcb2b4c'),
  ('bcf0b9d7-05fb-4997-811f-d65c5d66eff9'),
  ('e7cafa16-2069-48ad-bfe8-ad201ac44c5c'),
  ('2262ac6a-2b9b-49a0-a290-5a3e4f7d4692'),
  ('cdbc38c1-a8e9-4102-88a3-ff787555dbc2'),
  ('fedfecf1-c9f9-41b5-8655-493de3dbe62b'),
  ('47e19659-fda1-4f4e-a0bb-b3353ad4a499'),
  ('d3c20b21-b5ad-4677-9e57-bf45d6ebf033'),
  ('c1eb1da0-ddc4-4be2-bc00-8adc0203c587'),
  ('ab79c600-4fcf-4c1b-bac6-2fcba49ce740'),
  ('8eb985ff-e133-4fd4-b823-89a4b1810545'),
  ('c3df4b24-40fb-412b-83c4-e54b22b7daa2'),
  ('22bc7a1f-4b18-413b-ad46-cf4628ad2a8e'),
  ('5ef88320-0d8d-47bf-90a5-1e8a8b57c2f0'),
  ('8b783e5f-0e52-49a9-a892-cda7baefed5d'),
  ('4d5ccb96-8321-45d9-aa0b-1e2e7114900b'),
  ('f74b9285-0931-4a25-bc07-0172722f0c17'),
  ('bf400408-f250-4a5d-80ac-6826f2233fc6'),
  ('e130ac13-e51c-4205-a32d-32f84f7a9c6e'),
  ('2a840c2d-5724-469e-94ce-e3159627ec9f'),
  ('2128e616-8822-44fb-ad1a-53ccde6f5ea2'),
  ('f682a11a-479f-48a3-9d62-1fe34a4d257e'),
  ('6e544a58-4a9c-4d5d-83b8-92d69b01a3a5'),
  ('5611fca1-28a7-4fd3-858d-208c929aeced'),
  ('32c067fb-c5fb-458f-bff0-2c7d4901f2ec'),
  ('3d080a60-a62f-46cd-b148-1be643498f15'),
  ('868c9a2e-112d-4f87-9034-345084709b0d'),
  ('51e87568-f33a-4209-8839-c330ee2a6118'),
  ('3fa0bc8e-7e83-42ba-8279-770886ef056b'),
  ('bad69297-7352-4582-9bfc-04ab3ab2e403'),
  ('c8b146af-f9a7-4ec0-81f8-8cb0ced55109'),
  ('c433abf9-6856-46ad-ad31-3efb521a03d9'),
  ('117722dc-7e65-4e55-aa21-cbd67d4171d3'),
  ('4dfdbf5e-ba5e-446b-8584-cfb600792b3b'),
  ('22a6ba03-0dff-4a29-929f-d7424d0f7651'),
  ('fad33df8-a4e7-4385-a647-578e31c9bbb3'),
  ('97e65a82-9031-42bf-bb4a-9a127c5ed477'),
  ('2c682fd6-2524-47e6-8536-ecd185e5811a'),
  ('c1e45a83-c0f3-4d54-8845-a0748d9064eb'),
  ('088780ac-b10d-4b9b-ab96-76fad01a5778'),
  ('ff4acaac-383f-4e83-8d6f-8a3f781625be'),
  ('e2202b77-fca5-4ee4-b151-f9aca89563de'),
  ('70c3e11b-54d6-4f66-8506-65429a12156b'),
  ('0a272225-946f-4a85-aa22-dcec6244647f'),
  ('3a90a6f0-be74-4df3-b0c4-55499cf589c8'),
  ('46607237-2c72-42cf-99c6-3ff874d83892'),
  ('b2bca310-d3ab-45c2-85fe-4638a68f1b1a'),
  ('b716db1f-6d62-44bb-9a5e-508a896f722a'),
  ('0a72352b-e253-48ac-9cc2-9544920f35de'),
  ('61828f1d-a457-40eb-a33c-c7441500cecc'),
  ('e50f1bd3-00a7-4b26-bc0b-c9395628d72c'),
  ('e8600f68-0d60-431d-90a2-f5cade8398be'),
  ('be2584b3-f505-4e66-af66-137bcc4943f6'),
  ('36a91453-8e5f-4e29-9a9c-1291c137a154'),
  ('0ac91dbc-e0ae-4a63-aa26-c6ce50a85af1'),
  ('ddeb3dbb-9d87-4bfc-98e2-fca3111b49e1'),
  ('8c579597-b7fc-4e16-9585-8aee5ea59c1d'),
  ('cd4b640a-c593-4a4a-855c-64268d43c8ae'),
  ('5195f534-bd39-4924-a659-29adfcb0c0e7'),
  ('564ee963-0235-4d46-ad05-92a815c59ae0'),
  ('09c2ee4d-7aba-402d-83d6-1184d7eea8f1'),
  ('1c9f6d18-0b56-40f6-b9be-7b0daaee18df'),
  ('df27051a-57f2-48fc-aa5a-e8eac4a33857'),
  ('56b0f99d-8f5d-41a7-bcdd-f937348e4dd0'),
  ('b868fefa-a4a2-4181-9d15-5feb58b6aa79'),
  ('deb184e2-e8db-4483-8ec0-6bbcb34bdeb5'),
  ('5b6bfda6-62b3-4e94-97ef-37047bc3cb5a'),
  ('16361259-746a-4323-87d5-a2c0080f152e'),
  ('f515d4ba-e95d-4ce0-b64a-271b6178ceb3'),
  ('d4cba3fe-8da3-4ff7-8861-0366cf3a7ce9'),
  ('3f03138a-c706-4df9-ac6b-5b58587d8f37'),
  ('c5949171-0f1c-4d05-8409-2b67b5729823'),
  ('8e6bb135-b670-4265-80b0-c8b5048922b9'),
  ('a95448c3-56db-4ceb-a8b1-b07b704d2247'),
  ('fbf9668d-1196-4451-8c94-d171031a6124'),
  ('b5874abb-cd1b-4b6b-981c-aa3bd7adf27c');
-- lokista 112 riviä; a2_jatko ilmoitti lisäksi 55 SQL-päivitystä ilman rivi-id-listaa

UPDATE kentta_lahteet kl
SET luottamus = 'vahvistettu'
FROM a2_palautus p
WHERE kl.id = p.id AND kl.luottamus = 'epavarma';
-- ÄLÄ päivitä vahvistettu_pvm tässä.

SELECT count(*) AS palautettu FROM kentta_lahteet kl JOIN a2_palautus p ON p.id=kl.id WHERE kl.luottamus='vahvistettu';
-- ROLLBACK;  -- oletus: älä committoi
-- COMMIT;    -- vain kun käyttäjä hyväksyy

-- Toinen erä (55 riviä): suora SQL 2026-10-12, ei rivi-id-listaa lokissa.
-- Ehdokasjoukko (luku): koostehostit + luottamus=epavarma + vahvistettu_pvm='2026-10-12'
-- + merkitty_pvm < '2026-10-12' (vanha ihmisen vahvistus). ÄLÄ aja ennen tarkistusta.
/*
UPDATE kentta_lahteet kl
SET luottamus = 'vahvistettu'
WHERE tila = 'voimassa'
  AND luottamus = 'epavarma'
  AND vahvistettu_pvm = '2026-10-12'
  AND merkitty_pvm::date < '2026-10-12'
  AND (
    lahde_url ILIKE '%dcatlas.io%' OR lahde_url ILIKE '%datacenters.com%'
    OR lahde_url ILIKE '%datacenterhawk.com%' OR lahde_url ILIKE '%datacentermap.com%'
    OR lahde_url ILIKE '%peeringdb.com%' OR lahde_url ILIKE '%wikipedia.org%'
    OR lahde_url ILIKE '%openstreetmap.org%' OR lahde_url ILIKE '%colomap.com%'
  );
*/
