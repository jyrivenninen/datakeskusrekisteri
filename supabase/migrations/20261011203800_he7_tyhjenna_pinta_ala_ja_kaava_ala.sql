-- HE7: poista colocation- ja Suosaari-kaava-pinta-alalähteet sekä kaava_ala_ha-arvo.
-- kaavatunnus ja kortteli jäävät.

DO $$
DECLARE
  v_he7 uuid := '662b4e66-3864-431f-8c28-fcd7abd87174';
  n_lahde int;
BEGIN
  DELETE FROM kentta_lahteet
  WHERE taulu = 'hankkeet'
    AND rivi_id = v_he7
    AND kentta IN ('pinta_ala_ha', 'kaava_ala_ha');
  GET DIAGNOSTICS n_lahde = ROW_COUNT;

  UPDATE hankkeet
  SET
    kaava_ala_ha = NULL,
    pinta_ala_ha = NULL
  WHERE id = v_he7
    AND (kaava_ala_ha IS NOT NULL OR pinta_ala_ha IS NOT NULL);

  RAISE NOTICE 'HE7: poistettu % pinta-alalähdettä', n_lahde;
END;
$$;
