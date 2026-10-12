-- Paikkatason geokoodit (kunta/taajama/alue-nimi) → sijainti_alue_tyyppi = arvio.
-- Katutason Nominatim (osoite lähteestä) ei merkitä arvioksi.
-- Parkano Asemanseutu: palauta kuntakeskuspiste arvioksi (yhdistyksessä poistettu).
-- Kouvola: erota Hiivuri (Puhdistamontie / rakenteilla) ja Hyperco DS (Vilppulantie / YVA länteen).
-- Vakerinmäki: hankesivun tarkka piste — ei merkitä arvioksi vaikka vanha OSM-kuntakeskus löytyy.

-- ---------------------------------------------------------------------------
-- 1. Paikkatason geokoodit → arvio (+ T1 Laajametsä; korjaa katutason väärät arviot)
-- ---------------------------------------------------------------------------

WITH geokoodi AS (
  SELECT
    h.id,
    bool_or(
      kl.lainaus ~* 'osoitteesta'
      OR kl.lahde_url ~* '[?&]street='
      OR kl.lainaus ~* 'Nominatim-haku (Emalikatu|Nybackantie|Sundsbergintie|Sinimäentie|Ilmarisentie|Kivisalmentie|Pakkahuoneenaukio|Puhdistamontie|Vilppulantie)'
      OR kl.lainaus ~* '→ Nominatim/OSM:.*(katu|tie|kuja|väylä|aukio|gatan|vägen)[^\n]*[0-9]'
    ) AS on_katu,
    bool_or(
      kl.lainaus ILIKE '%→ OSM%'
      OR kl.lainaus ILIKE '%paikannimi%'
      OR kl.lainaus ILIKE '%municipality centroid%'
      OR kl.lainaus ~* 'Nominatim-haku '
      OR kl.lainaus ~* 'MML-haku '
      OR kl.lainaus ~* 'Nominatim: [A-ZÅÄÖ]'
    ) AS on_paikka_geokoodi,
    bool_or(kl.lainaus ~* 'Mykäntie') AS on_mykantie
  FROM hankkeet h
  JOIN kentta_lahteet kl
    ON kl.taulu = 'hankkeet'
   AND kl.rivi_id = h.id
   AND kl.kentta = 'sijainti'
  WHERE h.julkaistu
    AND h.poistettu_pvm IS NULL
    AND h.yhdistetty_kohde_id IS NULL
    AND h.sijainti_lat IS NOT NULL
  GROUP BY h.id
),
paikkataso AS (
  SELECT id
  FROM geokoodi
  WHERE id <> 'cd73475f-cc0a-47ef-bd9f-e42a34fead90' -- Vakerinmäki: hankesivun koordinaatit
    AND (
      id = '5b511b68-fce3-4f8b-875b-e7cd9981943b' -- T1 Energy Laajametsä (sama piste Microsoftin kanssa)
      OR on_mykantie
      OR (on_paikka_geokoodi AND NOT on_katu)
    )
)
UPDATE hankkeet h
SET sijainti_alue_tyyppi = 'arvio'
FROM paikkataso p
WHERE h.id = p.id
  AND h.sijainti_alue_tyyppi IS DISTINCT FROM 'arvio';

-- Katutason Nominatim, jotka oli merkitty arvioksi virheellisesti → tontti
UPDATE hankkeet
SET sijainti_alue_tyyppi = 'tontti'
WHERE id IN (
  'ab2e473c-c702-4930-a676-b357085ae8da', -- FCDC Lahti, Ilmarisentie 3
  'd374672c-48e9-4594-831b-7fd189e4c66d'  -- Glesys The Deck, Pakkahuoneenaukio 2
)
AND sijainti_alue_tyyppi IS DISTINCT FROM 'tontti';

-- ---------------------------------------------------------------------------
-- 2. Parkano Asemanseutu: palauta kuntakeskuspiste arvioksi
--    (ainoa yhdistyksessä tyhjennetty kuntakeskus-geokoodi; muita ei löytynyt)
-- ---------------------------------------------------------------------------

UPDATE hankkeet
SET
  sijainti_lat = 62.010600,
  sijainti_lon = 23.018690,
  sijainti_alue_tyyppi = 'arvio'
WHERE id = '1243fe99-03ca-4956-9696-262f39967ce1'
  AND sijainti_lat IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM hankkeet
    WHERE id = '1243fe99-03ca-4956-9696-262f39967ce1'
      AND sijainti_lat = 62.010600
  ) THEN
    PERFORM tallenna_kentta_lahde(
      'hankkeet',
      '1243fe99-03ca-4956-9696-262f39967ce1',
      'sijainti',
      'https://www.parkano.fi/',
      NULL,
      CURRENT_DATE,
      'epavarma',
      'Parkanon Asemanseudun datakeskus: kuntakeskuspiste arvioksi (paikan nimi Asemanseutu / Parkano, ei hankkeen osoitetta) → OSM (Parkano): 62.010600 N, 23.018690 E.',
      'ihmisen_vahvistama',
      'html'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Kouvola: Hiivuri = Puhdistamontie (rakenteilla), Hyperco DS = Vilppulantie (YVA länteen)
-- ---------------------------------------------------------------------------

UPDATE hankkeet
SET
  sijainti_lat = 60.844427,
  sijainti_lon = 26.627050,
  sijainti_alue_tyyppi = 'arvio'
WHERE id = '7b3a83b9-5f2f-499c-b3c5-096ffdfd99ab';

DO $$
BEGIN
  PERFORM tallenna_kentta_lahde(
    'hankkeet',
    '7b3a83b9-5f2f-499c-b3c5-096ffdfd99ab',
    'sijainti',
    'https://nominatim.openstreetmap.org/search?q=Puhdistamontie+42+Kouvola&format=jsonv2',
    NULL,
    CURRENT_DATE,
    'epavarma',
    'Nominatim-haku Puhdistamontie 42, Kouvola (Hiivuri, Koria): 60.844427 N, 26.627050 E. YVA: rakenteilla oleva datakeskus; Hyperco Data Systems sijoittuu sen länsipuolelle.',
    'ihmisen_vahvistama',
    'rajapinta'
  );
END;
$$;

UPDATE hankkeet
SET
  sijainti_lat = 60.845853,
  sijainti_lon = 26.614311,
  sijainti_alue_tyyppi = 'arvio'
WHERE id = '50366424-dc69-49ab-abbf-f5a933cb82db';

DO $$
BEGIN
  PERFORM tallenna_kentta_lahde(
    'hankkeet',
    '50366424-dc69-49ab-abbf-f5a933cb82db',
    'sijainti',
    'https://www.ymparisto.fi/sites/default/files/documents/Hyperco%20Data%20System%20Oy%20-%20Kouvola%20YVA-selostus%20-%20julkaisuversio%2020260219_teksti_0.pdf',
    NULL,
    CURRENT_DATE,
    'epavarma',
    'YVA-selostus: «Hanke sijoittuisi tällä hetkellä rakenteilla olevan datakeskuksen länsipuolelle.» Nominatim Vilppulantie, Hiivuri, Koria: 60.845853 N, 26.614311 E (arvio, ei tontin rajaa).',
    'ihmisen_vahvistama',
    'dokumentti'
  );
END;
$$;
