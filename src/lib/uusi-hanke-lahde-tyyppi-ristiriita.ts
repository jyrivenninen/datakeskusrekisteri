/**
 * Tuonnin lahde_tyyppi vs. dokumentit-taulun olemassa oleva tyyppi.
 * Ristiriitaa ei ylikirjoiteta eikä ohiteta hiljaa — esikatselussa valinta.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LAHDE_TYYPIT,
  type LahdeTyyppi,
} from "@/lib/lahde-metatiedot";
import { VARMISTAVAT_LAHDE_TYYPIT } from "@/lib/kentta-varmistus";
import {
  tuonninLahdeTyypit,
  type UusiHankeTuonti,
} from "@/lib/uusi-hanke-tuonti";

export type LahdeTyyppiRistiriita = {
  url: string;
  dokumentti_id: string;
  nykyinen_tyyppi: LahdeTyyppi;
  json_tyyppi: LahdeTyyppi;
  /** Heikompi → varmistava (vaikuttaa varmistusmerkintään). */
  on_nosto: boolean;
};

export type LahdeTyyppiValinta = "json" | "nykyinen";

export type LahdeTyyppiPaatos = {
  url: string;
  valinta: LahdeTyyppiValinta;
};

function onLahdeTyyppi(v: string): v is LahdeTyyppi {
  return (LAHDE_TYYPIT as readonly string[]).includes(v);
}

export function onLahdeTyyppiNosto(
  nykyinen: LahdeTyyppi,
  jsonTyyppi: LahdeTyyppi,
): boolean {
  const varmistaa = (t: LahdeTyyppi) =>
    (VARMISTAVAT_LAHDE_TYYPIT as readonly string[]).includes(t);
  return !varmistaa(nykyinen) && varmistaa(jsonTyyppi);
}

/** Hakee URL:t, joissa dokumentit.lahde_tyyppi ≠ JSON:n tyyppi. */
export async function haeLahdeTyyppiRistiriidat(
  supabase: SupabaseClient,
  tuonti: UusiHankeTuonti,
): Promise<LahdeTyyppiRistiriita[]> {
  const tuodut = tuonninLahdeTyypit(tuonti);
  if (tuodut.length === 0) return [];

  const urlt = tuodut.map((t) => t.url);
  const { data, error } = await supabase
    .from("dokumentit")
    .select("id, url, lahde_tyyppi")
    .in("url", urlt);
  if (error) throw new Error(error.message);

  const byUrl = new Map(
    (data ?? []).map((d) => [String(d.url), d] as const),
  );
  const ristiriidat: LahdeTyyppiRistiriita[] = [];

  for (const t of tuodut) {
    const dok = byUrl.get(t.url);
    if (!dok) continue;
    const nykyinen = String(dok.lahde_tyyppi ?? "").trim();
    if (!onLahdeTyyppi(nykyinen)) continue;
    if (nykyinen === t.lahde_tyyppi) continue;
    ristiriidat.push({
      url: t.url,
      dokumentti_id: String(dok.id),
      nykyinen_tyyppi: nykyinen,
      json_tyyppi: t.lahde_tyyppi,
      on_nosto: onLahdeTyyppiNosto(nykyinen, t.lahde_tyyppi),
    });
  }

  return ristiriidat.sort((a, b) => {
    if (a.on_nosto !== b.on_nosto) return a.on_nosto ? -1 : 1;
    return a.url.localeCompare(b.url, "fi");
  });
}

/** Parsii lomakkeen valinnat; heittää jos jokin ristiriita ilman valintaa. */
export function parsiLahdeTyyppiPaatokset(
  formData: FormData,
  ristiriidat: LahdeTyyppiRistiriita[],
): LahdeTyyppiPaatos[] {
  if (ristiriidat.length === 0) return [];

  const paatokset: LahdeTyyppiPaatos[] = [];
  for (let i = 0; i < ristiriidat.length; i++) {
    const r = ristiriidat[i]!;
    const urlLomakkeesta = String(
      formData.get(`lahde_tyyppi_ristiriita_url_${i}`) ?? "",
    ).trim();
    const v = String(
      formData.get(`lahde_tyyppi_ristiriita_valinta_${i}`) ?? "",
    ).trim();
    if (urlLomakkeesta && urlLomakkeesta !== r.url) {
      throw new Error("Lähdetyyppiristiriidan URL ei täsmää esikatseluun.");
    }
    if (v !== "json" && v !== "nykyinen") {
      throw new Error(
        `Valitse lähdetyyppi ristiriitaiselle URL:lle ennen vahvistusta: ${r.url}`,
      );
    }
    paatokset.push({ url: r.url, valinta: v });
  }
  return paatokset;
}

/**
 * Palauttaa URL → käytettävä lahde_tyyppi kirjoitukseen.
 * Ristiriidattomat URL:t käyttävät JSON:n tyyppiä; ristiriitaisille päätös.
 */
export function kaytettavatLahdeTyypit(
  tuonti: UusiHankeTuonti,
  ristiriidat: LahdeTyyppiRistiriita[],
  paatokset: LahdeTyyppiPaatos[],
): Map<string, LahdeTyyppi> {
  const tulos = new Map<string, LahdeTyyppi>();
  for (const t of tuonninLahdeTyypit(tuonti)) {
    tulos.set(t.url, t.lahde_tyyppi);
  }
  const ristiriitaMap = new Map(ristiriidat.map((r) => [r.url, r]));
  for (const p of paatokset) {
    const r = ristiriitaMap.get(p.url);
    if (!r) continue;
    tulos.set(
      p.url,
      p.valinta === "json" ? r.json_tyyppi : r.nykyinen_tyyppi,
    );
  }
  return tulos;
}
