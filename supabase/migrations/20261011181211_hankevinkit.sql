-- Ylläpidon hankevihjeet (ei julkiseen sivustoon).
-- Korvaa uutisvihje-kiertotiet hanke_lahdehaut-taulussa ja CompassForge-uusi_hanke-ehdotuksen.

CREATE TABLE hankevinkit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisaatio_id uuid REFERENCES organisaatiot (id) ON DELETE SET NULL,
  kunta text,
  lahde_url text NOT NULL,
  yhteenveto text NOT NULL,
  tila text NOT NULL DEFAULT 'selvitettava',
  loydetty_hanke_id uuid REFERENCES hankkeet (id) ON DELETE RESTRICT,
  hylkays_syy text,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  paivitetty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hankevinkit_lahde_url_ei_tyhja CHECK (char_length(trim(lahde_url)) > 0),
  CONSTRAINT hankevinkit_yhteenveto_ei_tyhja CHECK (char_length(trim(yhteenveto)) > 0),
  CONSTRAINT hankevinkit_tila_tarkistus CHECK (
    tila IN ('selvitettava', 'loydetty', 'hylatty')
  ),
  CONSTRAINT hankevinkit_loydetty_vaatii_hankkeen CHECK (
    (tila = 'loydetty' AND loydetty_hanke_id IS NOT NULL)
    OR (tila <> 'loydetty' AND loydetty_hanke_id IS NULL)
  ),
  CONSTRAINT hankevinkit_hylatty_vaatii_syyn CHECK (
    (tila = 'hylatty' AND char_length(trim(COALESCE(hylkays_syy, ''))) > 0)
    OR (tila <> 'hylatty' AND hylkays_syy IS NULL)
  )
);

CREATE INDEX hankevinkit_tila_idx ON hankevinkit (tila, luotu_pvm DESC);
CREATE INDEX hankevinkit_organisaatio_idx ON hankevinkit (organisaatio_id)
  WHERE organisaatio_id IS NOT NULL;
CREATE INDEX hankevinkit_loydetty_hanke_idx ON hankevinkit (loydetty_hanke_id)
  WHERE loydetty_hanke_id IS NOT NULL;

COMMENT ON TABLE hankevinkit IS
  'Ylläpidon työjono: uutis- tms. vihje hankkeesta, jota ei vielä ole rekisterissä. Ei julkiseen sivustoon.';
COMMENT ON COLUMN hankevinkit.tila IS
  'selvitettava | loydetty | hylatty';
COMMENT ON COLUMN hankevinkit.loydetty_hanke_id IS
  'Täytetään kun vihje on yhdistetty olemassa olevaan tai uuteen hankkeeseen (tila = loydetty).';
COMMENT ON COLUMN hankevinkit.hylkays_syy IS
  'Pakollinen kun tila = hylatty.';

CREATE TRIGGER hankevinkit_paivitetty_pvm
BEFORE UPDATE ON hankevinkit
FOR EACH ROW
EXECUTE FUNCTION paivita_paivitetty_pvm();

ALTER TABLE hankevinkit ENABLE ROW LEVEL SECURITY;

CREATE POLICY hankevinkit_yllapito_luku
ON hankevinkit
FOR SELECT
TO authenticated
USING (onko_yllapitaja());

CREATE POLICY hankevinkit_yllapito_kirjoitus
ON hankevinkit
FOR INSERT
TO authenticated
WITH CHECK (onko_yllapitaja());

CREATE POLICY hankevinkit_yllapito_paivitys
ON hankevinkit
FOR UPDATE
TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

CREATE POLICY hankevinkit_yllapito_poisto
ON hankevinkit
FOR DELETE
TO authenticated
USING (onko_yllapitaja());

REVOKE ALL ON TABLE hankevinkit FROM PUBLIC, anon, agentti;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hankevinkit TO authenticated;
GRANT ALL ON TABLE hankevinkit TO service_role;

-- Kolme nykyistä vihjettä
INSERT INTO hankevinkit (organisaatio_id, kunta, lahde_url, yhteenveto, tila)
SELECT o.id, v.kunta, v.lahde_url, v.yhteenveto, 'selvitettava'
FROM (
  VALUES
    (
      'Arcem AS',
      'Salo',
      'https://www.sss.fi/2025/11/salossa-viritellaan-toista-datakeskusta-norjalainen-yhtio-varasi-hehtaaritolkulla-maata-halikosta/',
      'Arcem AS. Uutinen: Salon maa-aluevaraus Halikossa (Riikki). Tarkista Salon asianhallinta.'
    ),
    (
      'Enertia Oy',
      'Parkano',
      'https://www.ylasatakunta.fi/kaksi-datakeskushanketta-lisaa-parkanoon--asemanseudulle-yksi-ja-kuivasjarvelle-jo-toinen-6.164.130688.70167c8f22',
      'Enertia Oy. Uutinen: Parkanon kaavoitusaloite asemanseudulle. Tarkista Parkanon asianhallinta.'
    ),
    (
      'CompassForge Ventures Oy',
      NULL::text,
      'https://compassforge.ventures/',
      'CompassForge Ventures Oy. Ainoa tallennettu lähde on yhtiön sivusto; kunta tuntematon. Etsi uutinen tai kunnan asianhallinta ennen hankkeen luontia.'
    )
) AS v(org_nimi, kunta, lahde_url, yhteenveto)
JOIN organisaatiot o ON o.nimi = v.org_nimi AND o.julkaistu;

DO $$
BEGIN
  IF (SELECT count(*) FROM hankevinkit) < 3 THEN
    RAISE EXCEPTION 'hankevinkit: odotettiin 3 vihjettä, saatiin %', (SELECT count(*) FROM hankevinkit);
  END IF;
END $$;

-- Peru kiertotiet (uutisvihje hakulokissa + CompassForge-uusi_hanke)
DELETE FROM hanke_lahdehaut
WHERE jarjestelma = 'uutisvihje'
  AND suorittaja = 'ylläpito';

UPDATE muutosehdotukset
SET
  tila = 'hylatty',
  kasittelija = 'ylläpito',
  kasitelty_pvm = now(),
  huomautus = trim(
    both E'\n' FROM COALESCE(huomautus, '')
    || E'\nSiirretty hankevinkit-tauluun; kiertotie-ehdotus mitätöity.'
  )
WHERE tyyppi = 'uusi_hanke'
  AND tila = 'odottaa'
  AND huomautus ILIKE '%CompassForge%'
  AND huomautus ILIKE '%Selvitettävä hankevihje%';
