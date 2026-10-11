-- Ylläpidon läpikäynti: numeeriset kentät, joissa lähteet antavat eri luvun.
-- «eri_asia» poistaa rivin jonosta ilman lähdemuutosta.

CREATE TABLE luvun_lapikaynti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taulu text NOT NULL,
  rivi_id uuid NOT NULL,
  kentta text NOT NULL,
  paatos text NOT NULL,
  kasittelija text NOT NULL,
  huomautus text,
  kasitelty_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT luvun_lapikaynti_paatos_tarkistus CHECK (
    paatos IN ('eri_asia', 'ristiriitainen', 'korvattu')
  ),
  CONSTRAINT luvun_lapikaynti_kasittelija_ei_tyhja CHECK (
    char_length(btrim(kasittelija)) > 0
  ),
  CONSTRAINT luvun_lapikaynti_kentta_kerran UNIQUE (taulu, rivi_id, kentta)
);

COMMENT ON TABLE luvun_lapikaynti IS
  'Ylläpidon päätös eri lukuihin johtavista lähteistä. eri_asia = eri suureita, ei ristiriita; ristiriitainen/korvattu kirjataan myös kentta_lahteet-tauluun.';
COMMENT ON COLUMN luvun_lapikaynti.paatos IS
  'eri_asia | ristiriitainen | korvattu';

CREATE INDEX luvun_lapikaynti_kasitelty_idx ON luvun_lapikaynti (kasitelty_pvm DESC);

ALTER TABLE luvun_lapikaynti ENABLE ROW LEVEL SECURITY;

CREATE POLICY luvun_lapikaynti_yllapito_luku
ON luvun_lapikaynti FOR SELECT TO authenticated
USING (onko_yllapitaja());

CREATE POLICY luvun_lapikaynti_yllapito_kirjoitus
ON luvun_lapikaynti FOR INSERT TO authenticated
WITH CHECK (onko_yllapitaja());

CREATE POLICY luvun_lapikaynti_yllapito_paivitys
ON luvun_lapikaynti FOR UPDATE TO authenticated
USING (onko_yllapitaja())
WITH CHECK (onko_yllapitaja());

REVOKE ALL ON TABLE luvun_lapikaynti FROM PUBLIC, anon, agentti;
GRANT SELECT, INSERT, UPDATE ON TABLE luvun_lapikaynti TO authenticated;
GRANT ALL ON TABLE luvun_lapikaynti TO service_role;
