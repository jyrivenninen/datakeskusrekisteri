import { onFaktalahde } from "@/lib/lahde-metatiedot";
import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";
import { lahdeVoimassaLaskentaan } from "@/lib/lahde-tila";

/** Nämä lähdetyypit vahvistavat faktakentän (positiivinen sääntö). */
export const VARMISTAVAT_LAHDE_TYYPIT = [
  "paatos",
  "viranomaisasiakirja",
  "rekisteri",
] as const satisfies readonly LahdeTyyppi[];

export type KenttaLahdeTyyppiInfo = {
  lahde_tyyppi: LahdeTyyppi;
  tekninen_lahde?: boolean;
  /** korvattu / ei_tue jätetään varmistuslaskennan ulkopuolelle. */
  tila?: string | null;
};

/**
 * Kenttä on varmistettu, jos sillä on vähintään yksi ei-tekninen lähde, jonka
 * lahde_tyyppi on päätös, viranomaisasiakirja tai rekisteri.
 * tila korvattu / ei_tue ei lasketa.
 */
export function onKenttaVarmistettu(lahteet: readonly KenttaLahdeTyyppiInfo[]): boolean {
  return lahteet
    .filter((l) => lahdeVoimassaLaskentaan(l.tila))
    .filter(onFaktalahde)
    .some((lahde) =>
      (VARMISTAVAT_LAHDE_TYYPIT as readonly string[]).includes(lahde.lahde_tyyppi),
    );
}

export function onKenttaVarmistamaton(lahteet: readonly KenttaLahdeTyyppiInfo[]): boolean {
  return !onKenttaVarmistettu(lahteet);
}

/** Varmistusmerkintä vain sitovuudellisesti merkityksellisille kentille. */
export function onKenttaVarmistamatonSitovuusNakokulmasta(
  lahteet: readonly KenttaLahdeTyyppiInfo[],
  sitovuusMerkittaa: boolean,
): boolean {
  if (!sitovuusMerkittaa) return false;
  return onKenttaVarmistamaton(lahteet);
}

export type VarmistamatonSyy =
  | "ainoa_media"
  | "ainoa_hankkeen_oma"
  | "ainoa_muu"
  | "tyypittamaton";

/**
 * Luokittelee varmistamattoman kentän syyn (yksi bucket per kenttä).
 * Tyypittämätön = ei faktalähteitä, sekoitus tyyppejä, tai tyypit eivät ole yksiselitteinen syy.
 */
export function varmistamatonSyy(
  lahteet: readonly KenttaLahdeTyyppiInfo[],
): VarmistamatonSyy {
  if (onKenttaVarmistettu(lahteet)) {
    throw new Error("Kenttä on varmistettu");
  }

  const faktat = lahteet
    .filter((l) => lahdeVoimassaLaskentaan(l.tila))
    .filter(onFaktalahde);
  if (faktat.length === 0) return "tyypittamaton";

  const tyypit = new Set(faktat.map((l) => l.lahde_tyyppi));
  if (tyypit.size === 1) {
    const [ainoa] = [...tyypit];
    if (ainoa === "media") return "ainoa_media";
    if (ainoa === "hankkeen_oma") return "ainoa_hankkeen_oma";
    if (ainoa === "muu") return "ainoa_muu";
  }
  return "tyypittamaton";
}
