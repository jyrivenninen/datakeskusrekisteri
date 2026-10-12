import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";
import { tehokasLahdeTyyppi } from "@/lib/lahde-tyyppi-domain";
import { VARMISTAVAT_LAHDE_TYYPIT } from "@/lib/kentta-varmistus";
import { lahdeVoimassaLaskentaan } from "@/lib/lahde-tila";
import type { KenttaLahde, Luottamus, Merkinta } from "@/lib/supabase/tietokanta";

/** Lähde liikennevalolaskentaan (tehokas lahde_tyyppi mukana). */
export type LiikennevaloLahde = {
  luottamus: Luottamus;
  merkitty: Merkinta;
  tila?: string | null;
  lahde_tyyppi: LahdeTyyppi;
  tekninen_lahde?: boolean;
};

/** Rikastaa kenttälähteet tehokkaalla lähdetyypillä URL-kartasta. */
export function lahteetLiikennevalolle(
  lahteet: ReadonlyArray<
    Pick<KenttaLahde, "luottamus" | "merkitty" | "tila" | "lahde_url" | "tekninen_lahde">
  >,
  urlTyypit: ReadonlyMap<string, LahdeTyyppi>,
): LiikennevaloLahde[] {
  return lahteet.map((lahde) => ({
    luottamus: lahde.luottamus,
    merkitty: lahde.merkitty,
    tila: lahde.tila,
    tekninen_lahde: lahde.tekninen_lahde,
    lahde_tyyppi: tehokasLahdeTyyppi(
      urlTyypit.get(lahde.lahde_url) ?? "muu",
      lahde.lahde_url,
    ),
  }));
}

/** Onko kentällä vähintään yksi ei-tekninen viranomaislähde (paatos/viranomaisasiakirja/rekisteri). */
export function kentallaViranomaislahde(
  lahteet: ReadonlyArray<{ lahde_tyyppi: LahdeTyyppi; tekninen_lahde?: boolean; tila?: string | null }>,
): boolean {
  const varmistavat = VARMISTAVAT_LAHDE_TYYPIT as readonly string[];
  return lahteet.some(
    (l) =>
      lahdeVoimassaLaskentaan(l.tila) &&
      l.tekninen_lahde !== true &&
      varmistavat.includes(l.lahde_tyyppi),
  );
}
