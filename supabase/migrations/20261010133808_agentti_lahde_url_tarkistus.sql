-- Agentin INSERT muutosehdotuksiin laukaisee URL-tarkistuksen kutsujan oikeuksin.
-- lahde_url_on_kielletty on tarkoituksella ilman agentin EXECUTE-oikeutta, joten
-- liipaisin ajetaan omistajan oikeuksin. Suoraa kutsua agentille ei avata.

CREATE OR REPLACE FUNCTION tarkista_muutosehdotus_lahde_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lahde_url IS NOT NULL AND lahde_url_on_kielletty(NEW.lahde_url) THEN
    RAISE EXCEPTION 'Lähde-URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tarkista_dokumentti_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF lahde_url_on_kielletty(NEW.url) THEN
    RAISE EXCEPTION 'Dokumentin URL ei kelpaa: datakeskusrekisterin osoite';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION tarkista_muutosehdotus_lahde_url() FROM PUBLIC;
REVOKE ALL ON FUNCTION tarkista_dokumentti_url() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tarkista_muutosehdotus_lahde_url() TO anon, authenticated, agentti, service_role;
GRANT EXECUTE ON FUNCTION tarkista_dokumentti_url() TO anon, authenticated, agentti, service_role;
