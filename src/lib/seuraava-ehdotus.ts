import {
  ehdotusPoistetulleHankkeelle,
  jarjestaMuutosehdotukset,
  onHavaintoTyyppi,
} from "@/lib/naytto";
import { haeHankkeetYllapitoon, poistetutHankeIdt } from "@/lib/supabase/yllapito-asiakas";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Jonossa seuraavaan siirtyminen: havainnot + lähdetyypitysehdotukset. */
export function kuuluuHavaintojonoon(tyyppi: string): boolean {
  return onHavaintoTyyppi(tyyppi) || tyyppi === "lahde_tyyppi_havainto";
}

type OdottavaRivi = {
  id: string;
  tyyppi: string;
  tila: string;
  luotu_pvm: string;
  hanke_id: string | null;
};

async function haeKaikkiOdottavatMuutosehdotukset(
  supabase: SupabaseClient,
): Promise<OdottavaRivi[]> {
  const sivuKoko = 1000;
  const rivit: OdottavaRivi[] = [];
  for (let alku = 0; ; alku += sivuKoko) {
    const { data, error } = await supabase
      .from("muutosehdotukset")
      .select("id, tyyppi, tila, luotu_pvm, hanke_id")
      .eq("tila", "odottaa")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rivit.push(...(data as OdottavaRivi[]));
    if (data.length < sivuKoko) break;
  }
  return rivit;
}

async function havaintoJono(supabase: SupabaseClient): Promise<OdottavaRivi[]> {
  const rivit = await haeKaikkiOdottavatMuutosehdotukset(supabase);
  const hankeIdt = [
    ...new Set(
      rivit.map((e) => e.hanke_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const hankkeet = await haeHankkeetYllapitoon(hankeIdt);
  const poistetut = poistetutHankeIdt(hankkeet);

  return jarjestaMuutosehdotukset(
    rivit.filter(
      (e) =>
        kuuluuHavaintojonoon(e.tyyppi) &&
        !ehdotusPoistetulleHankkeelle(e.hanke_id, poistetut),
    ),
  );
}

/**
 * Seuraava havainto samassa järjestyksessä kuin ylläpidon listassa.
 * Kutsu ennen käsittelyä, jotta nykyinen rivi on vielä jonossa.
 */
export async function haeSeuraavaOdottavaHavaintoId(
  supabase: SupabaseClient,
  nykyinenId: string,
): Promise<string | null> {
  const jonossa = await havaintoJono(supabase);
  const idx = jonossa.findIndex((e) => e.id === nykyinenId);
  if (idx >= 0) {
    return jonossa[idx + 1]?.id ?? null;
  }
  return null;
}

export async function haeEnsimmainenOdottavaHavaintoId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const jonossa = await havaintoJono(supabase);
  return jonossa[0]?.id ?? null;
}

export async function onOdottavaHavaintoEhdotus(
  supabase: SupabaseClient,
  ehdotusId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("muutosehdotukset")
    .select("id, tyyppi, tila, hanke_id")
    .eq("id", ehdotusId)
    .maybeSingle();
  if (error || !data || data.tila !== "odottaa") return false;
  if (!kuuluuHavaintojonoon(data.tyyppi)) return false;
  if (!data.hanke_id) return true;
  const hankkeet = await haeHankkeetYllapitoon([data.hanke_id]);
  return !ehdotusPoistetulleHankkeelle(data.hanke_id, poistetutHankeIdt(hankkeet));
}

export function yllapitoSeuraavaHavaintoPolku(seuraavaId: string, viesti: string): string {
  return `/yllapito/${seuraavaId}?${new URLSearchParams({ edellinen: viesti }).toString()}`;
}

/** Vahvistaa kohteen ja palauttaa polun, tai ensimmäisen jonossa olevan. */
export async function haeTurvallinenSeuraavaHavaintoPolku(
  supabase: SupabaseClient,
  haluttuId: string | null,
  viestiAvain: "hyvaksytty" | "hylatty" | "kasitelty",
): Promise<string | null> {
  if (haluttuId && (await onOdottavaHavaintoEhdotus(supabase, haluttuId))) {
    return yllapitoSeuraavaHavaintoPolku(haluttuId, viestiAvain);
  }
  const ensimmainen = await haeEnsimmainenOdottavaHavaintoId(supabase);
  if (ensimmainen) {
    return yllapitoSeuraavaHavaintoPolku(ensimmainen, viestiAvain);
  }
  return null;
}
