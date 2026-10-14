-- Korjaa Advisors: rls_disabled_in_public (hanke_ei_sama).
-- Lukuoikeus vain ylläpitäjälle; kirjoitus merkitse_hanke_ei_sama (SECURITY DEFINER).

ALTER TABLE hanke_ei_sama ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE hanke_ei_sama FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE hanke_ei_sama TO authenticated, service_role;
GRANT ALL ON TABLE hanke_ei_sama TO service_role;

DROP POLICY IF EXISTS hanke_ei_sama_yllapito_luku ON hanke_ei_sama;
CREATE POLICY hanke_ei_sama_yllapito_luku
  ON hanke_ei_sama
  FOR SELECT
  TO authenticated
  USING (onko_yllapitaja());

COMMENT ON POLICY hanke_ei_sama_yllapito_luku ON hanke_ei_sama IS
  'Ylläpitäjä lukee tuplahaun poissulkulistaa. Kirjoitus vain RPC:llä.';
