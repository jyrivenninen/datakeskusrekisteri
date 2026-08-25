-- Julkinen tietosivu näyttää ajolokin. Kirjoitus ja poisto eivät muutu.

GRANT SELECT ON TABLE lahdeajot TO anon;

CREATE POLICY lahdeajot_julkinen_luku
ON lahdeajot
FOR SELECT
TO anon, authenticated
USING (true);

COMMENT ON TABLE lahdeajot IS
  'Rajapinta- ja kuntasovittimien ajoloki. Julkinen luku; kirjoitus vain palvelinajolle.';
