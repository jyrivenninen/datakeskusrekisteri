-- Piilota lähteetön yva_konsultti-tupla, jos samalla hanke+org on lähteellinen rivi.
UPDATE hanke_organisaatiot a
SET julkaistu = false
WHERE a.rooli = 'yva_konsultti'
  AND a.julkaistu
  AND a.lahde_dokumentti_id IS NULL
  AND NULLIF(btrim(COALESCE(a.lahde_url, '')), '') IS NULL
  AND EXISTS (
    SELECT 1
    FROM hanke_organisaatiot b
    WHERE b.hanke_id = a.hanke_id
      AND b.organisaatio_id = a.organisaatio_id
      AND b.rooli = 'yva_konsultti'
      AND b.id <> a.id
      AND b.julkaistu
      AND (
        b.lahde_dokumentti_id IS NOT NULL
        OR NULLIF(btrim(COALESCE(b.lahde_url, '')), '') IS NOT NULL
      )
  );
