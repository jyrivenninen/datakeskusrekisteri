import { createClient } from "@supabase/supabase-js";
import { hankeTehoMw } from "@/lib/naytto";
import { supabaseJulkinenAvain, supabaseUrl, supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

export type OgHanke = {
  id: string;
  nimi: string;
  kunta: string;
  vaihe: HankeVaihe;
  lat: number | null;
  lon: number | null;
  tehoMw: number | null;
  teho_mw: number | null;
  it_teho_mw: number | null;
};

type Rivi = {
  id: string;
  nimi: string;
  kunta: string;
  vaihe: HankeVaihe;
  sijainti_lat: number | string | null;
  sijainti_lon: number | string | null;
  teho_mw: number | string | null;
  it_teho_mw: number | string | null;
};

function luku(arvo: number | string | null): number | null {
  if (arvo == null || arvo === "") return null;
  const n = Number(arvo);
  return Number.isFinite(n) ? n : null;
}

function riviOgHankkeeksi(rivi: Rivi): OgHanke {
  const teho_mw = luku(rivi.teho_mw);
  const it_teho_mw = luku(rivi.it_teho_mw);
  return {
    id: rivi.id,
    nimi: rivi.nimi,
    kunta: rivi.kunta,
    vaihe: rivi.vaihe,
    lat: luku(rivi.sijainti_lat),
    lon: luku(rivi.sijainti_lon),
    tehoMw: hankeTehoMw({ teho_mw, it_teho_mw }),
    teho_mw,
    it_teho_mw,
  };
}

function asiakas() {
  return createClient(supabaseUrl(), supabaseJulkinenAvain(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SARAKKEET =
  "id, nimi, kunta, vaihe, sijainti_lat, sijainti_lon, teho_mw, it_teho_mw";

export async function haeOgHankkeet(): Promise<OgHanke[]> {
  if (!supabaseYmparistoAsetettu()) return [];
  const { data, error } = await asiakas()
    .from("hankkeet")
    .select(SARAKKEET)
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null);
  if (error || !data) return [];
  return (data as Rivi[]).map(riviOgHankkeeksi);
}

export async function haeOgHanke(id: string): Promise<OgHanke | null> {
  if (!supabaseYmparistoAsetettu()) return null;
  const sb = asiakas();
  const { data: ohjaus } = await sb
    .from("hanke_ohjaukset")
    .select("uusi_id")
    .eq("vanha_id", id)
    .maybeSingle();
  const haettava = ohjaus?.uusi_id ?? id;
  const { data, error } = await sb
    .from("hankkeet")
    .select(SARAKKEET)
    .eq("id", haettava)
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null)
    .maybeSingle();
  if (error || !data) return null;
  return riviOgHankkeeksi(data as Rivi);
}
