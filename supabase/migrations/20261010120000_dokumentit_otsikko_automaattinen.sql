-- Otsikko=URL -rekisteririvit erottuvat raportoinnissa.
-- Tekniset dokumentti-itseviittauslähteet eivät sekoitu faktaväitteisiin.

ALTER TABLE dokumentit
  ADD COLUMN otsikko_automaattinen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN dokumentit.otsikko_automaattinen IS
  'true kun otsikko on toistaiseksi sama kuin url (URL-rekisterin automaattitäyttö).';

UPDATE dokumentit
SET otsikko_automaattinen = true
WHERE otsikko = url;

ALTER TABLE kentta_lahteet
  ADD COLUMN tekninen_lahde boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN kentta_lahteet.tekninen_lahde IS
  'true = järjestelmän metatietorakenne (esim. dokumentin otsikko/laji-itseviittaus), ei faktaväite.';

UPDATE kentta_lahteet kl
SET tekninen_lahde = true
FROM dokumentit d
WHERE kl.taulu = 'dokumentit'
  AND kl.rivi_id = d.id
  AND kl.lahde_url = d.url
  AND kl.kentta IN ('otsikko', 'laji');
