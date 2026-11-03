-- Erä 1: julkaisija jäi tyhjäksi, koska tyyppi-backfill ei kirjoittanut sitä
-- (trg_dokumentit_lahteet vaatii kentta_lahteet-rivin). Täydennetään
-- hyväksytyistä grok_lahdeselvitys_era1_asiakirjat -ehdotuksista.

DO $$
DECLARE
  r RECORD;
  n_paivitetty int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (u.url)
      d.id AS dokumentti_id,
      u.url,
      NULLIF(btrim(COALESCE(
        m.sisalto -> 'kunta' ->> 'grok_julkaisija',
        dok ->> 'julkaisija',
        ''
      )), '') AS julkaisija,
      COALESCE(m.lahde_url, u.url) AS asia_url
    FROM muutosehdotukset m
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(m.sisalto -> 'kunta' -> 'dokumentit', '[]'::jsonb)
    ) AS dok
    CROSS JOIN LATERAL (
      SELECT COALESCE(NULLIF(dok ->> 'url', ''), m.lahde_url) AS url
    ) u
    JOIN dokumentit d ON d.url = u.url
    WHERE m.ehdottaja_tunniste = 'grok_lahdeselvitys_era1_asiakirjat'
      AND m.tila = 'hyvaksytty'
      AND u.url IS NOT NULL
      AND d.julkaisija IS NULL
    ORDER BY u.url, m.kasitelty_pvm DESC NULLS LAST
  LOOP
    IF r.julkaisija IS NULL THEN
      CONTINUE;
    END IF;

    -- Lähde ensin (DEFERRABLE-triggeri tarkistaa commitissa)
    PERFORM tallenna_kentta_lahde(
      'dokumentit',
      r.dokumentti_id,
      'julkaisija',
      r.asia_url,
      NULL,
      CURRENT_DATE,
      'epavarma',
      NULL,
      'ihmisen_vahvistama',
      'html'
    );

    UPDATE dokumentit
    SET julkaisija = r.julkaisija
    WHERE id = r.dokumentti_id
      AND julkaisija IS NULL;

    IF FOUND THEN
      n_paivitetty := n_paivitetty + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'era1 julkaisija backfill: % riviä', n_paivitetty;
END;
$$;
