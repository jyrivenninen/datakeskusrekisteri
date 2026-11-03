-- LUONNOS — ei migrations/. Ajo vasta hyväksynnän jälkeen.

CREATE OR REPLACE FUNCTION public.kirjaa_julkaistu_muutos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  muutos record;
  v_ehdotus uuid;
  v_lahde_url text;
  v_lahde_otsikko text;
BEGIN
  IF NEW.yhdistetty_kohde_id IS NOT NULL OR NOT NEW.julkaistu THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NOT OLD.julkaistu) THEN
    SELECT e.id INTO v_ehdotus
    FROM muutosehdotukset e
    WHERE e.hanke_id = NEW.id
      AND e.tila = 'hyvaksytty'
      AND e.tyyppi = 'uusi_hanke'
      AND e.kasitelty_pvm >= transaction_timestamp() - interval '5 minutes'
    ORDER BY e.kasitelty_pvm DESC
    LIMIT 1;

    SELECT lahde_url, lahde_otsikko
    INTO v_lahde_url, v_lahde_otsikko
    FROM julkaistu_muutos_lahde(NEW.id, 'uusi_hanke', v_ehdotus);

    INSERT INTO julkaistut_muutokset (
      hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
    )
    VALUES (
      NEW.id, 'uusi_hanke', NEW.nimi, transaction_timestamp(),
      v_lahde_url, v_lahde_otsikko, v_ehdotus
    )
    ON CONFLICT (ehdotus_id, kentta) WHERE ehdotus_id IS NOT NULL DO NOTHING;

    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  FOR muutos IN
    SELECT kentta, arvo
    FROM (
      SELECT
        'nimi'::text AS kentta,
        NULLIF(btrim(NEW.nimi), '') AS arvo,
        NULLIF(btrim(OLD.nimi), '') IS DISTINCT FROM NULLIF(btrim(NEW.nimi), '') AS muuttui
      UNION ALL SELECT 'kunta', NULLIF(btrim(NEW.kunta), ''),
        NULLIF(btrim(OLD.kunta), '') IS DISTINCT FROM NULLIF(btrim(NEW.kunta), '')
      UNION ALL SELECT 'maakunta', NULLIF(btrim(NEW.maakunta), ''),
        NULLIF(btrim(OLD.maakunta), '') IS DISTINCT FROM NULLIF(btrim(NEW.maakunta), '')
      UNION ALL SELECT 'vaihe', NEW.vaihe,
        OLD.vaihe IS DISTINCT FROM NEW.vaihe
      UNION ALL SELECT 'yva_diaarinumero', NULLIF(btrim(NEW.yva_diaarinumero), ''),
        NULLIF(btrim(OLD.yva_diaarinumero), '') IS DISTINCT FROM NULLIF(btrim(NEW.yva_diaarinumero), '')
      UNION ALL SELECT 'kaavatunnus', NULLIF(btrim(NEW.kaavatunnus), ''),
        NULLIF(btrim(OLD.kaavatunnus), '') IS DISTINCT FROM NULLIF(btrim(NEW.kaavatunnus), '')
      UNION ALL SELECT 'kortteli', NULLIF(btrim(NEW.kortteli), ''),
        NULLIF(btrim(OLD.kortteli), '') IS DISTINCT FROM NULLIF(btrim(NEW.kortteli), '')
      UNION ALL SELECT 'sijainti_alue_tyyppi', NULLIF(btrim(NEW.sijainti_alue_tyyppi), ''),
        NULLIF(btrim(OLD.sijainti_alue_tyyppi), '') IS DISTINCT FROM NULLIF(btrim(NEW.sijainti_alue_tyyppi), '')
      UNION ALL SELECT 'it_teho_mw', julkaistu_muutos_numero(NEW.it_teho_mw),
        OLD.it_teho_mw IS DISTINCT FROM NEW.it_teho_mw
      UNION ALL SELECT 'teho_mw', julkaistu_muutos_numero(NEW.teho_mw),
        OLD.teho_mw IS DISTINCT FROM NEW.teho_mw
      UNION ALL SELECT 'teho_erittelematon_mw', julkaistu_muutos_numero(NEW.teho_erittelematon_mw),
        OLD.teho_erittelematon_mw IS DISTINCT FROM NEW.teho_erittelematon_mw
      UNION ALL SELECT 'pinta_ala_ha', julkaistu_muutos_numero(NEW.pinta_ala_ha),
        OLD.pinta_ala_ha IS DISTINCT FROM NEW.pinta_ala_ha
      UNION ALL SELECT 'kaava_ala_ha', julkaistu_muutos_numero(NEW.kaava_ala_ha),
        OLD.kaava_ala_ha IS DISTINCT FROM NEW.kaava_ala_ha
      UNION ALL SELECT 'sahkonkaytto_twh_a', julkaistu_muutos_numero(NEW.sahkonkaytto_twh_a),
        OLD.sahkonkaytto_twh_a IS DISTINCT FROM NEW.sahkonkaytto_twh_a
      UNION ALL SELECT 'generaattori_polttoaineteho_mw', julkaistu_muutos_numero(NEW.generaattori_polttoaineteho_mw),
        OLD.generaattori_polttoaineteho_mw IS DISTINCT FROM NEW.generaattori_polttoaineteho_mw
      UNION ALL SELECT 'generaattorit_lkm', NEW.generaattorit_lkm::text,
        OLD.generaattorit_lkm IS DISTINCT FROM NEW.generaattorit_lkm
      UNION ALL SELECT 'generaattorit_kaytossa_max_lkm', NEW.generaattorit_kaytossa_max_lkm::text,
        OLD.generaattorit_kaytossa_max_lkm IS DISTINCT FROM NEW.generaattorit_kaytossa_max_lkm
      UNION ALL SELECT 'sijainti_lat', julkaistu_muutos_numero(NEW.sijainti_lat),
        OLD.sijainti_lat IS DISTINCT FROM NEW.sijainti_lat
      UNION ALL SELECT 'sijainti_lon', julkaistu_muutos_numero(NEW.sijainti_lon),
        OLD.sijainti_lon IS DISTINCT FROM NEW.sijainti_lon
      UNION ALL SELECT 'toimija_organisaatio_id',
        (SELECT o.nimi FROM organisaatiot o WHERE o.id = NEW.toimija_organisaatio_id),
        OLD.toimija_organisaatio_id IS DISTINCT FROM NEW.toimija_organisaatio_id
    ) ero
    WHERE ero.muuttui
  LOOP
    SELECT e.id INTO v_ehdotus
    FROM muutosehdotukset e
    WHERE e.hanke_id = NEW.id
      AND e.tila = 'hyvaksytty'
      AND e.kasitelty_pvm >= transaction_timestamp() - interval '5 minutes'
      AND (
        (
          e.tyyppi IN ('taydennys', 'korjaus')
          AND (
            jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), muutos.kentta)
            OR (
              muutos.kentta = 'toimija_organisaatio_id'
              AND jsonb_exists(COALESCE(e.sisalto->'kentat', '{}'::jsonb), 'toimija_nimi')
            )
          )
        )
        OR (
          e.tyyppi = 'kentta_tyhjennys'
          AND COALESCE(e.sisalto #>> '{tyhjennys,kentta}', '') IN (muutos.kentta, 'toimija_nimi')
        )
      )
    ORDER BY e.kasitelty_pvm DESC
    LIMIT 1;

    SELECT l.lahde_url, l.lahde_otsikko
    INTO v_lahde_url, v_lahde_otsikko
    FROM julkaistu_muutos_lahde(NEW.id, muutos.kentta, v_ehdotus) AS l;

    IF v_lahde_url IS NULL AND v_ehdotus IS NOT NULL THEN
      SELECT COALESCE(
        NULLIF(e.sisalto #>> ARRAY['kentat', muutos.kentta, 'lahde_url'], ''),
        NULLIF(e.sisalto #>> '{kentat,toimija_nimi,lahde_url}', ''),
        NULLIF(e.sisalto #>> '{tyhjennys,lahde_url}', ''),
        e.lahde_url
      )
      INTO v_lahde_url
      FROM muutosehdotukset e
      WHERE e.id = v_ehdotus;

      SELECT dok.otsikko INTO v_lahde_otsikko
      FROM dokumentit dok
      WHERE dok.julkaistu AND dok.url = v_lahde_url
      LIMIT 1;
    END IF;

    INSERT INTO julkaistut_muutokset (
      hanke_id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, ehdotus_id
    )
    VALUES (
      NEW.id,
      muutos.kentta,
      muutos.arvo,
      transaction_timestamp(),
      v_lahde_url,
      v_lahde_otsikko,
      v_ehdotus
    )
    ON CONFLICT (ehdotus_id, kentta) WHERE ehdotus_id IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$


REVOKE ALL ON FUNCTION public.kirjaa_julkaistu_muutos()
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.kirjaa_julkaistu_muutos() TO service_role;

NOTIFY pgrst, 'reload schema';
