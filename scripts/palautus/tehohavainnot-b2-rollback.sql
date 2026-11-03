-- PALAUTUS — B2 lisäävä migraatio (tehohavainnot + teho_erittelematon_mw).
-- Aja vain jos migraatio pitää perua. Ei backfill-dataa odoteta.

DROP TRIGGER IF EXISTS trg_tehohavainnot_lahteet ON tehohavainnot;
DROP TRIGGER IF EXISTS trg_tehohavainnot_poista_lahteet ON tehohavainnot;
DROP FUNCTION IF EXISTS tarkista_tehohavainnon_lahteet();
DROP FUNCTION IF EXISTS tehohavainto_puuttuvat_lahteet(tehohavainnot);
DROP TABLE IF EXISTS tehohavainnot;

ALTER TABLE hankkeet DROP CONSTRAINT IF EXISTS hankkeet_teho_erittelematon_mw_positiivinen;
ALTER TABLE hankkeet DROP COLUMN IF EXISTS teho_erittelematon_mw;

-- Palauta kentta_lahteet.taulu-CHECK ilman tehohavainnot
ALTER TABLE kentta_lahteet DROP CONSTRAINT IF EXISTS kentta_lahteet_taulu_tarkistus;
ALTER TABLE kentta_lahteet ADD CONSTRAINT kentta_lahteet_taulu_tarkistus CHECK (
  taulu = ANY (ARRAY[
    'hankkeet'::text, 'maaraajat'::text, 'organisaatiot'::text, 'yhteyshenkilot'::text,
    'hanke_kunnat'::text, 'hanke_menettelyt'::text, 'hanke_organisaatiot'::text,
    'dokumentit'::text, 'hanke_johdot'::text, 'hanke_vaihtoehdot'::text,
    'hanke_kuvat'::text, 'paatokset'::text, 'hanke_rakentamisvaiheet'::text
  ])
);
