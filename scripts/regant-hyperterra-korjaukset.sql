-- Regant Hyperterra, Salo Kärkkä — ajettu tuotantoon 2026-10-10.
-- Lähde: https://salo10.oncloudos.com/kokous/20261089-5.PDF (KH 10.8.2026 § 260)

DO $$
DECLARE
  v_hanke uuid := '532bf1f0-c5cf-44b8-8365-1454839d361d';
  v_regant uuid := '09ba06d5-a554-4bc6-8250-8a1de21abebc';
  v_dc1 uuid;
  v_rivi uuid;
  v_lahde text := 'https://salo10.oncloudos.com/kokous/20261089-5.PDF';
  v_kohta text := 'Kaupunginhallituksen päätös 10.8.2026 § 260';
BEGIN
  SELECT id INTO v_dc1 FROM organisaatiot WHERE y_tunnus = '3606181-7' LIMIT 1;
  IF v_dc1 IS NULL THEN
    INSERT INTO organisaatiot (nimi, tyyppi, y_tunnus, julkaistu)
    VALUES ('Regant DC1 Oy', 'yritys', '3606181-7', true)
    RETURNING id INTO v_dc1;
    PERFORM tallenna_kentta_lahde(
      'organisaatiot', v_dc1, 'nimi', v_lahde, NULL, '2026-08-10'::date,
      'vahvistettu', v_kohta, 'ihmisen_vahvistama', 'dokumentti'
    );
    PERFORM tallenna_kentta_lahde(
      'organisaatiot', v_dc1, 'y_tunnus',
      'https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=3606181-7',
      NULL, '2026-03-14'::date, 'vahvistettu', NULL, 'ihmisen_vahvistama', 'rajapinta'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hanke_organisaatiot
    WHERE hanke_id = v_hanke AND organisaatio_id = v_dc1 AND rooli = 'hankeyhtio'
  ) THEN
    INSERT INTO hanke_organisaatiot (
      hanke_id, organisaatio_id, rooli, julkaistu, voimassa_alkaen, lahde_url, lahde_kohta
    )
    VALUES (v_hanke, v_dc1, 'hankeyhtio', true, '2026-03-20', v_lahde, v_kohta)
    RETURNING id INTO v_rivi;
    PERFORM tallenna_kentta_lahde(
      'hanke_organisaatiot', v_rivi, 'organisaatio_id', v_lahde, NULL, '2026-03-20',
      'vahvistettu', v_kohta, 'ihmisen_vahvistama', 'dokumentti'
    );
    PERFORM tallenna_kentta_lahde(
      'hanke_organisaatiot', v_rivi, 'rooli', v_lahde, NULL, '2026-03-20',
      'vahvistettu', v_kohta, 'ihmisen_vahvistama', 'dokumentti'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hanke_organisaatiot
    WHERE hanke_id = v_hanke AND organisaatio_id = v_regant AND rooli = 'emoyhtio'
  ) THEN
    INSERT INTO hanke_organisaatiot (
      hanke_id, organisaatio_id, rooli, julkaistu, lahde_url, lahde_kohta
    )
    VALUES (v_hanke, v_regant, 'emoyhtio', true, v_lahde, v_kohta)
    RETURNING id INTO v_rivi;
    PERFORM tallenna_kentta_lahde(
      'hanke_organisaatiot', v_rivi, 'organisaatio_id', v_lahde, NULL, '2026-08-10',
      'vahvistettu', v_kohta, 'ihmisen_vahvistama', 'dokumentti'
    );
    PERFORM tallenna_kentta_lahde(
      'hanke_organisaatiot', v_rivi, 'rooli', v_lahde, NULL, '2026-08-10',
      'vahvistettu', v_kohta, 'ihmisen_vahvistama', 'dokumentti'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organisaatio_suhteet
    WHERE lahde_organisaatio_id = v_regant
      AND kohde_organisaatio_id = v_dc1
      AND suhde_tunnus = 'omistus'
  ) THEN
    INSERT INTO organisaatio_suhteet (
      lahde_organisaatio_id, kohde_organisaatio_id, suhde_tunnus,
      voimassa_alkaen, lahde_url, lahde_kohta, julkaistu
    )
    VALUES (v_regant, v_dc1, 'omistus', '2026-08-10', v_lahde, v_kohta, true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM muutosehdotukset
    WHERE hanke_id = v_hanke AND tyyppi = 'korjaus' AND tila = 'odottaa'
      AND sisalto -> 'kentat' ? 'toimija_organisaatio_id'
  ) THEN
    INSERT INTO muutosehdotukset (
      tyyppi, hanke_id, ehdottaja_tyyppi, ehdottaja_tunniste, sisalto, tila, huomautus, lahde_url
    )
    VALUES (
      'korjaus', v_hanke, 'agentti', 'regant_hyperterra_korjaus',
      jsonb_build_object(
        'kentat',
        jsonb_build_object(
          'toimija_organisaatio_id',
          jsonb_build_object(
            'arvo', v_dc1::text,
            'lahde_url', v_lahde,
            'lahde_sivu', null,
            'vahvistettu_pvm', '2026-03-20',
            'luottamus', 'vahvistettu',
            'lainaus', v_kohta,
            'merkitty', 'koneen_ehdottama',
            'lahde_laji', 'dokumentti'
          )
        )
      ),
      'odottaa',
      'Hankeyhtiösiirto 20.3.2026: toimija_organisaatio_id Regant DC1 Oy:lle. Hyväksy yllapidossa.',
      v_lahde
    );
  END IF;
END $$;

DELETE FROM kentta_lahteet
WHERE taulu = 'organisaatiot' AND rivi_id = '98626314-78c9-4dda-936f-3d06d853e80d';

DELETE FROM organisaatiot
WHERE id = '98626314-78c9-4dda-936f-3d06d853e80d'
  AND julkaistu = false
  AND y_tunnus IS NULL;
