-- Rajattu agentti-rooli (Grok ja muut ulkoiset tarkistusagentit).
-- Lukee julkaistua sisältöä, kirjoittaa vain muutosehdotukset-tauluun.
-- Ei julkaise_*-funktioita eikä kirjoita julkaistuihin tauluihin.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agentti') THEN
    CREATE ROLE agentti NOLOGIN NOINHERIT;
  END IF;
END;
$$;

GRANT agentti TO authenticator;

COMMENT ON ROLE agentti IS
  'Ulkoiset tarkistusagentit (PostgREST JWT role=agentti). Lukuoikeus julkaistuun; kirjoitus vain muutosehdotukset.';

GRANT USAGE ON SCHEMA public TO agentti;

GRANT SELECT ON TABLE
  organisaatiot,
  hankkeet,
  maaraajat,
  yhteyshenkilot,
  kentta_lahteet,
  dokumentit,
  hanke_kunnat,
  hanke_menettelyt,
  hanke_organisaatiot,
  hanke_johdot,
  hanke_vaihtoehdot,
  hanke_kuvat,
  hanke_ohjaukset,
  paatokset,
  kentta_tarkistukset,
  kunnat,
  kunta_esityslista_lahteet
TO agentti;

REVOKE ALL ON TABLE muutosehdotukset FROM agentti;
GRANT SELECT, INSERT ON TABLE muutosehdotukset TO agentti;

-- Julkinen luku (sama rajaus kuin anon/authenticated).

CREATE POLICY organisaatiot_agentti_luku
ON organisaatiot
FOR SELECT
TO agentti
USING (julkaistu);

CREATE POLICY hankkeet_agentti_luku
ON hankkeet
FOR SELECT
TO agentti
USING (julkaistu);

CREATE POLICY maaraajat_agentti_luku
ON maaraajat
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = maaraajat.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY yhteyshenkilot_agentti_luku
ON yhteyshenkilot
FOR SELECT
TO agentti
USING (
  julkaistu
  AND (
    hanke_id IS NULL OR EXISTS (
      SELECT 1 FROM hankkeet h
      WHERE h.id = yhteyshenkilot.hanke_id
        AND h.julkaistu
    )
  )
  AND (
    organisaatio_id IS NULL OR EXISTS (
      SELECT 1 FROM organisaatiot o
      WHERE o.id = yhteyshenkilot.organisaatio_id
        AND o.julkaistu
    )
  )
);

CREATE POLICY kentta_lahteet_agentti_luku
ON kentta_lahteet
FOR SELECT
TO agentti
USING (
  (taulu = 'hankkeet' AND EXISTS (
    SELECT 1 FROM hankkeet h WHERE h.id = rivi_id AND h.julkaistu
  ))
  OR (taulu = 'maaraajat' AND EXISTS (
    SELECT 1 FROM maaraajat m
    JOIN hankkeet h ON h.id = m.hanke_id
    WHERE m.id = rivi_id AND m.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'organisaatiot' AND EXISTS (
    SELECT 1 FROM organisaatiot o WHERE o.id = rivi_id AND o.julkaistu
  ))
  OR (taulu = 'yhteyshenkilot' AND EXISTS (
    SELECT 1 FROM yhteyshenkilot y WHERE y.id = rivi_id AND y.julkaistu
  ))
  OR (taulu = 'hanke_kunnat' AND EXISTS (
    SELECT 1 FROM hanke_kunnat k
    JOIN hankkeet h ON h.id = k.hanke_id
    WHERE k.id = rivi_id AND k.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_menettelyt' AND EXISTS (
    SELECT 1 FROM hanke_menettelyt m
    JOIN hankkeet h ON h.id = m.hanke_id
    WHERE m.id = rivi_id AND m.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_organisaatiot' AND EXISTS (
    SELECT 1 FROM hanke_organisaatiot r
    JOIN hankkeet h ON h.id = r.hanke_id
    JOIN organisaatiot o ON o.id = r.organisaatio_id
    WHERE r.id = rivi_id AND r.julkaistu AND h.julkaistu AND o.julkaistu
  ))
  OR (taulu = 'dokumentit' AND EXISTS (
    SELECT 1 FROM dokumentit d
    WHERE d.id = rivi_id AND d.julkaistu
  ))
  OR (taulu = 'hanke_johdot' AND EXISTS (
    SELECT 1 FROM hanke_johdot j
    JOIN hankkeet h ON h.id = j.hanke_id
    WHERE j.id = rivi_id AND j.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_vaihtoehdot' AND EXISTS (
    SELECT 1 FROM hanke_vaihtoehdot v
    JOIN hankkeet h ON h.id = v.hanke_id
    WHERE v.id = rivi_id AND v.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'hanke_kuvat' AND EXISTS (
    SELECT 1 FROM hanke_kuvat k
    JOIN hankkeet h ON h.id = k.hanke_id
    WHERE k.id = rivi_id AND k.julkaistu AND h.julkaistu
  ))
  OR (taulu = 'paatokset' AND EXISTS (
    SELECT 1 FROM paatokset p
    JOIN hankkeet h ON h.id = p.hanke_id
    JOIN organisaatiot o ON o.id = p.paattava_organisaatio_id
    WHERE p.id = rivi_id AND p.julkaistu AND h.julkaistu AND o.julkaistu
  ))
);

CREATE POLICY dokumentit_agentti_luku
ON dokumentit
FOR SELECT
TO agentti
USING (
  julkaistu
  AND (
    hanke_id IS NULL OR EXISTS (
      SELECT 1 FROM hankkeet h
      WHERE h.id = dokumentit.hanke_id
        AND h.julkaistu
    )
  )
);

CREATE POLICY hanke_kunnat_agentti_luku
ON hanke_kunnat
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_kunnat.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_menettelyt_agentti_luku
ON hanke_menettelyt
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_menettelyt.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_organisaatiot_agentti_luku
ON hanke_organisaatiot
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_organisaatiot.hanke_id
      AND h.julkaistu
  )
  AND EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = hanke_organisaatiot.organisaatio_id
      AND o.julkaistu
  )
);

CREATE POLICY hanke_johdot_agentti_luku
ON hanke_johdot
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_johdot.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_vaihtoehdot_agentti_luku
ON hanke_vaihtoehdot
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_vaihtoehdot.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_kuvat_agentti_luku
ON hanke_kuvat
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = hanke_kuvat.hanke_id
      AND h.julkaistu
  )
);

CREATE POLICY hanke_ohjaukset_agentti_luku
ON hanke_ohjaukset
FOR SELECT
TO agentti
USING (true);

CREATE POLICY paatokset_agentti_luku
ON paatokset
FOR SELECT
TO agentti
USING (
  julkaistu
  AND EXISTS (
    SELECT 1 FROM hankkeet h
    WHERE h.id = paatokset.hanke_id
      AND h.julkaistu
  )
  AND EXISTS (
    SELECT 1 FROM organisaatiot o
    WHERE o.id = paatokset.paattava_organisaatio_id
      AND o.julkaistu
  )
);

CREATE POLICY kentta_tarkistukset_agentti_luku
ON kentta_tarkistukset
FOR SELECT
TO agentti
USING (
  taulu = 'hankkeet'
  AND EXISTS (
    SELECT 1 FROM hankkeet h WHERE h.id = rivi_id AND h.julkaistu
  )
);

CREATE POLICY kunnat_agentti_luku
ON kunnat
FOR SELECT
TO agentti
USING (true);

CREATE POLICY kunta_esityslista_agentti_luku
ON kunta_esityslista_lahteet
FOR SELECT
TO agentti
USING (true);

CREATE POLICY muutosehdotukset_agentti_lisays
ON muutosehdotukset
FOR INSERT
TO agentti
WITH CHECK (
  tila = 'odottaa'
  AND ehdottaja_tyyppi = 'agentti'
  AND kasitelty_pvm IS NULL
  AND kasittelija IS NULL
);

CREATE POLICY muutosehdotukset_agentti_luku
ON muutosehdotukset
FOR SELECT
TO agentti
USING (true);

-- Lokit ja ylläpito: ei agentille.
REVOKE ALL ON TABLE
  lahdeajot,
  dokumentti_tiivisteet,
  rajapinta_tiivisteet,
  mallikutsut,
  palautteet,
  yllapitajat
FROM agentti;
