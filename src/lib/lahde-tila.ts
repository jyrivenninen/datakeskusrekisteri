/**
 * Mitkä kentta_lahteet.tila-arvot vaikuttavat valoon, varmistukseen ja
 * viranomaisprosenttiin. korvattu ja ei_tue jätetään ulos.
 */

export const LAHDE_TILAT = ["voimassa", "korvattu", "ei_tue"] as const;
export type LahdeTila = (typeof LAHDE_TILAT)[number];

/** Lähde lasketaan valoon / varmistukseen / viranomaisosuuteen. */
export function lahdeVoimassaLaskentaan(
  tila: string | null | undefined,
): boolean {
  return tila !== "korvattu" && tila !== "ei_tue";
}
