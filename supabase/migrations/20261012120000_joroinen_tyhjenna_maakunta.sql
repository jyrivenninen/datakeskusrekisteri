-- Joroinen siirtyi Etelä-Savosta Pohjois-Savoon: tyhjennä virheellinen
-- tallennettu maakunta, jotta näyttö johdetaan kunnat-taulusta.
-- Pisteitä ja kuntakenttää ei kosketa.

DO $$
DECLARE
  v_id uuid;
  v_ids uuid[] := ARRAY[
    '4069cde3-6b44-4e54-994e-c25f56c429ed'::uuid, -- Tuulikolmio Joroinen, Hallamäki
    '8a741947-8f1a-406d-84df-47c73472250a'::uuid  -- Arcem Joroinen, Huutokoski
  ];
BEGIN
  FOREACH v_id IN ARRAY v_ids
  LOOP
    DELETE FROM kentta_lahteet
    WHERE taulu = 'hankkeet'
      AND rivi_id = v_id
      AND kentta = 'maakunta';

    UPDATE hankkeet
    SET maakunta = NULL
    WHERE id = v_id
      AND maakunta IS NOT NULL;
  END LOOP;
END;
$$;
