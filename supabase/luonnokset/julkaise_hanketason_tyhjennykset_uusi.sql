CREATE OR REPLACE FUNCTION public.julkaise_hanketason_tyhjennykset(p_ehdotus_id uuid, p_kasittelija text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ehdotus muutosehdotukset;
  v_rivi jsonb;
  v_kentta text;
  v_perustelu text;
  v_kentat text[] := ARRAY[]::text[];
  v_osat text[] := ARRAY[]::text[];
BEGIN
  IF p_kasittelija IS NULL OR btrim(p_kasittelija) = '' THEN
    RAISE EXCEPTION 'Käsittelijä puuttuu';
  END IF;

  SELECT * INTO v_ehdotus
  FROM muutosehdotukset
  WHERE id = p_ehdotus_id
  FOR UPDATE;

  IF NOT FOUND OR v_ehdotus.tila IS DISTINCT FROM 'odottaa' THEN
    RAISE EXCEPTION 'Ehdotusta ei voi hyväksyä';
  END IF;
  IF v_ehdotus.tyyppi IS DISTINCT FROM 'kentta_tyhjennys' OR v_ehdotus.hanke_id IS NULL THEN
    RAISE EXCEPTION 'Tyhjennys vaatii hankkeen';
  END IF;
  IF jsonb_typeof(v_ehdotus.sisalto -> 'tyhjennykset') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_ehdotus.sisalto -> 'tyhjennykset') = 0 THEN
    RAISE EXCEPTION 'Ehdotuksessa ei ole tyhjennettäviä kenttiä';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hankkeet WHERE id = v_ehdotus.hanke_id AND julkaistu
  ) THEN
    RAISE EXCEPTION 'Hanketta ei ole tai se ei ole julkaistu';
  END IF;

  FOR v_rivi IN
    SELECT value FROM jsonb_array_elements(v_ehdotus.sisalto -> 'tyhjennykset')
  LOOP
    v_kentta := NULLIF(btrim(COALESCE(v_rivi ->> 'kentta', '')), '');
    v_perustelu := NULLIF(btrim(COALESCE(v_rivi ->> 'perustelu', '')), '');
    IF v_kentta IS NULL OR v_perustelu IS NULL OR char_length(v_perustelu) < 12 THEN
      RAISE EXCEPTION 'Tyhjennyksen kenttä tai perustelu puuttuu';
    END IF;
    IF v_kentta NOT IN (
      'teho_mw',
      'teho_erittelematon_mw',
      'it_teho_mw',
      'pinta_ala_ha',
      'sahkonkaytto_twh_a',
      'generaattorit_lkm',
      'generaattori_polttoaineteho_mw',
      'generaattori_yksikkoteho_mwe',
      'diesel_vuosikulutus_maara',
      'varavoima_paastot_t_co2e'
    ) THEN
      RAISE EXCEPTION 'Kenttää % ei voi tyhjentää tällä ehdotuksella', v_kentta;
    END IF;
    v_kentat := array_append(v_kentat, v_kentta);
    v_osat := array_append(v_osat, format('%I = NULL', v_kentta));
    IF v_kentta = 'diesel_vuosikulutus_maara' THEN
      v_kentat := array_append(v_kentat, 'diesel_vuosikulutus_yksikko');
      v_osat := array_append(v_osat, 'diesel_vuosikulutus_yksikko = NULL');
    END IF;
  END LOOP;

  EXECUTE format(
    'UPDATE hankkeet SET %s WHERE id = $1',
    array_to_string(v_osat, ', ')
  )
  USING v_ehdotus.hanke_id;

  DELETE FROM kentta_lahteet
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_ehdotus.hanke_id
    AND kentta = ANY (v_kentat);

  DELETE FROM kentta_tarkistukset
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_ehdotus.hanke_id
    AND kentta = ANY (v_kentat);

  UPDATE muutosehdotukset
  SET
    tila = 'hyvaksytty',
    kasitelty_pvm = now(),
    kasittelija = p_kasittelija
  WHERE id = p_ehdotus_id
    AND tila = 'odottaa';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ehdotusta ei voitu merkitä hyväksytyksi';
  END IF;
END;
$function$


REVOKE ALL ON FUNCTION public.julkaise_hanketason_tyhjennykset(uuid, text)
  FROM PUBLIC, anon, authenticated, agentti;
GRANT EXECUTE ON FUNCTION public.julkaise_hanketason_tyhjennykset(uuid, text) TO service_role;
