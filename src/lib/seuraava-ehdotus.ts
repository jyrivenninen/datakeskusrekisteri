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

export async function haeSeuraavaOdottavaHavaintoId(
  supabase: SupabaseClient,
  nykyinenId: string,
): Promise<string | null> {
  const { data: ehdotukset, error } = await supabase
    .from("muutosehdotukset")
    .select("id, tyyppi, tila, luotu_pvm, hanke_id")
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);

  const rivit = (ehdotukset ?? []) as OdottavaRivi[];
  const hankeIdt = [
    ...new Set(
      rivit.map((e) => e.hanke_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const hankkeet = await haeHankkeetYllapitoon(hankeIdt);
  const poistetut = poistetutHankeIdt(hankkeet);

  const jonossa = jarjestaMuutosehdotukset(
    rivit.filter(
      (e) =>
        kuuluuHavaintojonoon(e.tyyppi) &&
        !ehdotusPoistetulleHankkeelle(e.hanke_id, poistetut),
    ),
  );

  const idx = jonossa.findIndex((e) => e.id === nykyinenId);
  if (idx >= 0) {
    return jonossa[idx + 1]?.id ?? null;
  }
  return jonossa.find((e) => e.id !== nykyinenId)?.id ?? null;
}

export function yllapitoSeuraavaHavaintoPolku(seuraavaId: string, viesti: string): string {
  return `/yllapito/${seuraavaId}?${new URLSearchParams({ edellinen: viesti }).toString()}`;
}
