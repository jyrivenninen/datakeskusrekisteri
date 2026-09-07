-- 7A.5.7 Tilastokeskus PxWeb: kuntien väkiluku taustatietona.

ALTER TABLE kunnat
  ADD COLUMN vaekiluku integer,
  ADD COLUMN vaekiluku_vuosi text,
  ADD COLUMN vaekiluku_lahde_url text;

ALTER TABLE kunnat
  ADD CONSTRAINT kunnat_vaekiluku_ei_negatiivinen CHECK (
    vaekiluku IS NULL OR vaekiluku >= 0
  ),
  ADD CONSTRAINT kunnat_vaekiluku_lahde_url_muoto CHECK (
    vaekiluku_lahde_url IS NULL OR vaekiluku_lahde_url ~ '^https?://'
  );

COMMENT ON COLUMN kunnat.vaekiluku IS
  'Viimeisin Tilastokeskuksen väestörakenne-taulukon (11re.px) väkiluku 31.12.';
COMMENT ON COLUMN kunnat.vaekiluku_vuosi IS
  'Tilastovuosi (esim. 2025).';
COMMENT ON COLUMN kunnat.vaekiluku_lahde_url IS
  'PxWeb-taulukon pysyvä viite, ei juuriosoitetta.';
