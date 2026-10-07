-- Ylläpidon pyyntö: vain Pekka Väisäsen kuvat; ei datakeskus.org-etulinkkiä lähteenä.

CREATE OR REPLACE FUNCTION yllapito_sovi_kuvat_pekka_vaisanen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE hanke_kuvat
  SET kuvaaja = 'Pekka Väisänen'
  WHERE kuvaaja ILIKE 'Pekka Väisänen%';

  DELETE FROM hanke_kuvat
  WHERE kuvaaja IS DISTINCT FROM 'Pekka Väisänen';

  UPDATE kentta_lahteet kl
  SET
    lahde_url = k.kuva_url,
    vahvistettu_pvm = CURRENT_DATE,
    lahde_laji = 'html'
  FROM hanke_kuvat k
  WHERE kl.taulu = 'hanke_kuvat'
    AND kl.rivi_id = k.id
    AND kl.lahde_url ~* '^https?://(www\.)?datakeskus\.org/?$';
END;
$$;

REVOKE ALL ON FUNCTION yllapito_sovi_kuvat_pekka_vaisanen() FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION yllapito_sovi_kuvat_pekka_vaisanen() TO service_role;

SELECT yllapito_sovi_kuvat_pekka_vaisanen();
