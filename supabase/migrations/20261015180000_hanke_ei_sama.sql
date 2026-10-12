-- Parihankkeet, joita tuplahaku ei saa ehdottaa samaksi hankkeeksi.

CREATE TABLE IF NOT EXISTS hanke_ei_sama (
  hanke_id_a uuid NOT NULL REFERENCES hankkeet (id),
  hanke_id_b uuid NOT NULL REFERENCES hankkeet (id),
  perustelu text NOT NULL,
  kasittelija text NOT NULL,
  luotu_pvm timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hanke_ei_sama_eri CHECK (hanke_id_a <> hanke_id_b),
  CONSTRAINT hanke_ei_sama_jarjestys CHECK (hanke_id_a < hanke_id_b),
  CONSTRAINT hanke_ei_sama_pk PRIMARY KEY (hanke_id_a, hanke_id_b),
  CONSTRAINT hanke_ei_sama_perustelu_ei_tyhja CHECK (
    char_length(trim(perustelu)) >= 12
  )
);

COMMENT ON TABLE hanke_ei_sama IS
  'Ihmisen merkintä: nämä kaksi hanketta eivät ole sama hanke. '
  'Tuplahaku jättää heikomman osuman pois, jos vahva osuma on parissa.';

CREATE OR REPLACE FUNCTION merkitse_hanke_ei_sama(
  p_hanke_id_a uuid,
  p_hanke_id_b uuid,
  p_perustelu text,
  p_kasittelija text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a uuid;
  v_b uuid;
BEGIN
  IF p_hanke_id_a IS NULL OR p_hanke_id_b IS NULL THEN
    RAISE EXCEPTION 'Hanketunnisteet puuttuvat';
  END IF;
  IF p_hanke_id_a = p_hanke_id_b THEN
    RAISE EXCEPTION 'Sama hanke kahdesti';
  END IF;
  IF NULLIF(btrim(COALESCE(p_perustelu, '')), '') IS NULL
    OR char_length(btrim(p_perustelu)) < 12 THEN
    RAISE EXCEPTION 'Perustelu liian lyhyt';
  END IF;
  IF NULLIF(btrim(COALESCE(p_kasittelija, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Käsittelijä puuttuu';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hankkeet WHERE id = p_hanke_id_a) THEN
    RAISE EXCEPTION 'Hanketta a ei löydy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hankkeet WHERE id = p_hanke_id_b) THEN
    RAISE EXCEPTION 'Hanketta b ei löydy';
  END IF;

  v_a := LEAST(p_hanke_id_a, p_hanke_id_b);
  v_b := GREATEST(p_hanke_id_a, p_hanke_id_b);

  INSERT INTO hanke_ei_sama (hanke_id_a, hanke_id_b, perustelu, kasittelija)
  VALUES (v_a, v_b, btrim(p_perustelu), btrim(p_kasittelija))
  ON CONFLICT (hanke_id_a, hanke_id_b) DO UPDATE
    SET
      perustelu = EXCLUDED.perustelu,
      kasittelija = EXCLUDED.kasittelija,
      luotu_pvm = now();
END;
$$;

COMMENT ON FUNCTION merkitse_hanke_ei_sama(uuid, uuid, text, text) IS
  'Merkitsee kaksi hanketta eri hankkeiksi tuplahakua varten.';

REVOKE ALL ON FUNCTION merkitse_hanke_ei_sama(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION merkitse_hanke_ei_sama(uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON TABLE hanke_ei_sama FROM PUBLIC, anon, authenticated, agentti;
GRANT SELECT ON TABLE hanke_ei_sama TO authenticated, service_role;
GRANT ALL ON TABLE hanke_ei_sama TO service_role;

-- Polarnode Kangasala, Ruutana ≠ UM Kiinteistöt DataPark, Kangasala
SELECT merkitse_hanke_ei_sama(
  '543da204-be31-4d5a-8db2-45522680c05c'::uuid,
  '88968368-2672-4d56-88b7-bb697c827f9e'::uuid,
  'Ei sama hanke: Polarnode Ruutana (kaava 912) ja UM DataPark Kangasala. '
  'Heikko nimiosuma (Kangasala) ei yhdistä.',
  'ylläpito'
);
