import type { SupabaseClient } from "@supabase/supabase-js";
import type { HankeKunnassa, KuntaLahde } from "./tyypit";

type TietokantaAsiakas = SupabaseClient;

type LahdeRivi = {
  id: string;
  jarjestelma: string;
  perus_url: string;
  kunnat: { id: string; koodi: string; nimi: string } | { id: string; koodi: string; nimi: string }[] | null;
};

/** Seurannassa olevat esityslistalähteet tietokannasta. */
export async function haeSeuratutLahteet(
  supabase: TietokantaAsiakas,
): Promise<KuntaLahde[]> {
  const { data, error } = await supabase
    .from("kunta_esityslista_lahteet")
    .select("id, jarjestelma, perus_url, kunnat ( id, koodi, nimi )")
    .eq("seurannassa", true)
    .in("jarjestelma", ["rss", "ical", "casem"]);
  if (error) throw new Error(error.message);

  const lahteet: KuntaLahde[] = [];
  for (const rivi of (data ?? []) as LahdeRivi[]) {
    const kunta = Array.isArray(rivi.kunnat) ? rivi.kunnat[0] : rivi.kunnat;
    if (!kunta) continue;
    lahteet.push({
      lahdeId: rivi.id,
      kuntaId: kunta.id,
      kuntaKoodi: kunta.koodi,
      kuntaNimi: kunta.nimi,
      jarjestelma: rivi.jarjestelma,
      perusUrl: rivi.perus_url,
    });
  }
  return lahteet;
}

/** Julkaistut hankkeet kuntittain (linkitystä varten). */
export async function haeHankekunnat(supabase: TietokantaAsiakas): Promise<HankeKunnassa[]> {
  const { data, error } = await supabase
    .from("hankkeet")
    .select("id, nimi, kunta, kunta_id")
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as HankeKunnassa[];
}

/** Hankekunnat, joille ei ole RSS/iCal-lähdettä seurannassa. */
export function puuttuvatLahteet(
  hankkeet: HankeKunnassa[],
  lahteet: KuntaLahde[],
): { kunta: string; kuntaId: string | null; hankkeita: number }[] {
  const konfiguroituKuntaId = new Set(lahteet.map((l) => l.kuntaId));
  const konfiguroituNimi = new Set(lahteet.map((l) => l.kuntaNimi.toLowerCase()));

  const laskuri = new Map<string, { kunta: string; kuntaId: string | null; hankkeita: number }>();
  for (const h of hankkeet) {
    const avain = h.kunta_id ?? h.kunta.trim().toLowerCase();
    const nyky = laskuri.get(avain) ?? {
      kunta: h.kunta,
      kuntaId: h.kunta_id,
      hankkeita: 0,
    };
    nyky.hankkeita += 1;
    laskuri.set(avain, nyky);
  }

  return [...laskuri.values()].filter((k) => {
    if (k.kuntaId && konfiguroituKuntaId.has(k.kuntaId)) return false;
    return !konfiguroituNimi.has(k.kunta.trim().toLowerCase());
  });
}
