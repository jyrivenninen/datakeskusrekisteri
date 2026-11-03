-- MALLI B (luonnos, EI AJETTAVA): agentti_saako_julkaista_kentan
-- Sallii vain tekstikentät kunta, maakunta, kaavatunnus, kortteli, nimi
-- tyhjään kenttään tai luottamuksen nostoon. Muut → false.
-- julkaise_agentti_ehdotus pysyy suljettuna; tätä ei ajeta ennen päätöstä.

CREATE OR REPLACE FUNCTION public.agentti_saako_julkaista_kentan(
  p_hanke hankkeet,
  p_kentta text,
  p_uusi_arvo text,
  p_ehdotettu_luottamus text,
  p_uusi_hanke boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lahde_kentta text;
  v_uusi_luott text;
  v_tyhja boolean;
  v_nyky_arvo text;
  v_nyky_taso integer;
  v_uusi_taso integer;
  v_sallitut text[] := ARRAY['kunta', 'maakunta', 'kaavatunnus', 'kortteli', 'nimi'];
BEGIN
  v_lahde_kentta := agentti_lahde_kentta(p_kentta);

  IF NOT (v_lahde_kentta = ANY (v_sallitut) OR p_kentta = ANY (v_sallitut)) THEN
    RETURN false;
  END IF;

  v_uusi_luott := agentti_kayta_luottamus(p_ehdotettu_luottamus);
  IF v_uusi_luott IS NULL THEN
    RETURN false;
  END IF;

  IF NULLIF(btrim(COALESCE(p_uusi_arvo, '')), '') IS NULL THEN
    RETURN false;
  END IF;

  IF p_uusi_hanke OR p_hanke.id IS NULL THEN
    RETURN true;
  END IF;

  IF kentta_on_ihmisen_vahvistama('hankkeet', p_hanke.id, v_lahde_kentta) THEN
    RETURN false;
  END IF;

  v_tyhja := hanke_kentta_on_tyhja(p_hanke, p_kentta);

  IF v_tyhja IS TRUE THEN
    RETURN true;
  END IF;

  v_nyky_arvo := hanke_kentta_arvo(p_hanke, p_kentta);
  v_nyky_taso := kentta_paras_luottamus_taso('hankkeet', p_hanke.id, v_lahde_kentta);
  v_uusi_taso := luottamus_taso(v_uusi_luott);

  IF btrim(COALESCE(v_nyky_arvo, '')) = btrim(COALESCE(p_uusi_arvo, '')) THEN
    RETURN v_uusi_taso > v_nyky_taso;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean) IS
  'Malli B: vain kunta/maakunta/kaavatunnus/kortteli/nimi tyhjään tai luottamusnostoon.';

REVOKE ALL ON FUNCTION public.agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentti_saako_julkaista_kentan(hankkeet, text, text, text, boolean)
  TO service_role;
