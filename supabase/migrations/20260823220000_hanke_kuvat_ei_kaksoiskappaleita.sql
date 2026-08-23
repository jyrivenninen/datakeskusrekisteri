-- Sama kuvaosoite julkaistiin kahdesti, kun lomake lähti kahdesti.
-- Poistetaan kaksoiskappaleet, estetään uusi insertti ja tehdään
-- julkaisu idempotentiksi saman URL:n osalta.

DELETE FROM hanke_kuvat k
WHERE EXISTS (
  SELECT 1
  FROM hanke_kuvat vanhempi
  WHERE vanhempi.hanke_id = k.hanke_id
    AND vanhempi.kuva_url = k.kuva_url
    AND (
      vanhempi.luotu_pvm < k.luotu_pvm
      OR (vanhempi.luotu_pvm = k.luotu_pvm AND vanhempi.id < k.id)
    )
);

CREATE UNIQUE INDEX hanke_kuvat_hanke_url_julkaistu_idx
ON hanke_kuvat (hanke_id, kuva_url)
WHERE julkaistu;

CREATE OR REPLACE FUNCTION julkaise_hanke_kuvat(
  p_hanke_id uuid,
  p_kuvat jsonb,
  p_ehdotus_id uuid,
  p_kasittelija text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kuva jsonb;
  v_lahde jsonb;
  v_kuva_id uuid;
  v_jarjestys integer;
  v_kuva_url text;
BEGIN
  IF p_hanke_id IS NULL THEN
    RAISE EXCEPTION 'Kuvaehdotuksella on oltava hanke';
  END IF;
  IF jsonb_typeof(COALESCE(p_kuvat, '[]'::jsonb)) <> 'array'
    OR jsonb_array_length(COALESCE(p_kuvat, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Kuvaehdotuksessa ei ole kuvia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hankkeet WHERE id = p_hanke_id AND julkaistu) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  SELECT COALESCE(MAX(jarjestys), -1) + 1 INTO v_jarjestys
  FROM hanke_kuvat
  WHERE hanke_id = p_hanke_id;

  FOR v_kuva IN SELECT value FROM jsonb_array_elements(p_kuvat)
  LOOP
    IF NULLIF(btrim(COALESCE(v_kuva ->> 'kuva_url', '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(v_kuva ->> 'kuvateksti', '')), '') IS NULL
      OR NULLIF(btrim(COALESCE(v_kuva ->> 'kuvaaja', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Kuvasta puuttuu osoite, kuvateksti tai kuvaaja';
    END IF;

    v_kuva_url := btrim(v_kuva ->> 'kuva_url');

    IF EXISTS (
      SELECT 1
      FROM hanke_kuvat
      WHERE hanke_id = p_hanke_id
        AND kuva_url = v_kuva_url
        AND julkaistu
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO hanke_kuvat (
      hanke_id, kuva_url, kuvateksti, kuvaaja, jarjestys, julkaistu
    )
    VALUES (
      p_hanke_id,
      v_kuva_url,
      btrim(v_kuva ->> 'kuvateksti'),
      btrim(v_kuva ->> 'kuvaaja'),
      v_jarjestys,
      true
    )
    RETURNING id INTO v_kuva_id;

    v_jarjestys := v_jarjestys + 1;

    FOR v_lahde IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_kuva -> 'lahteet', '[]'::jsonb))
    LOOP
      IF v_lahde ->> 'kentta' NOT IN ('kuva_url', 'kuvateksti', 'kuvaaja') THEN
        RAISE EXCEPTION 'Kuvan kentta ei ole sallittu: %', v_lahde ->> 'kentta';
      END IF;
      INSERT INTO kentta_lahteet (
        taulu, rivi_id, kentta, lahde_url, lahde_sivu,
        vahvistettu_pvm, luottamus, lainaus, merkitty
      )
      VALUES (
        'hanke_kuvat',
        v_kuva_id,
        v_lahde ->> 'kentta',
        v_lahde ->> 'lahde_url',
        NULLIF(v_lahde ->> 'lahde_sivu', '')::integer,
        (v_lahde ->> 'vahvistettu_pvm')::date,
        v_lahde ->> 'luottamus',
        NULLIF(v_lahde ->> 'lainaus', ''),
        v_lahde ->> 'merkitty'
      );
    END LOOP;
  END LOOP;

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija,
    hanke_id = p_hanke_id
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;

  RETURN p_hanke_id;
END;
$$;
