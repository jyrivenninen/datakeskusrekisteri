/** Roolit, jotka kuuluvat /konsultit-hakemistoon (eroteltuina). */

export const KONSULTTI_SIVU_ROOLIT = [
  "yva_konsultti",
  "kaavan_laatija",
  "lupahakemuksen_laatija",
  "selvityksen_laatija",
] as const;

export type KonsulttiSivuRooli = (typeof KONSULTTI_SIVU_ROOLIT)[number];

/** Vanha sekoittava rooli; migraation jälkeen ei käytössä. */
const VANHAT_KONSULTTI_ROOLIT = ["konsultti"] as const;

export const KONSULTTI_HAKU_ROOLIT = [
  ...KONSULTTI_SIVU_ROOLIT,
  ...VANHAT_KONSULTTI_ROOLIT,
] as const;

export const KONSULTTI_SIVU_ROOLI_JARJESTYS: KonsulttiSivuRooli[] = [
  "yva_konsultti",
  "kaavan_laatija",
  "lupahakemuksen_laatija",
  "selvityksen_laatija",
];

export function onKonsulttiSivuRooli(rooli: string): boolean {
  return (KONSULTTI_HAKU_ROOLIT as readonly string[]).includes(rooli);
}

export function normalisoiKonsulttiSivuRooli(rooli: string): KonsulttiSivuRooli {
  if (rooli === "konsultti") return "yva_konsultti";
  if ((KONSULTTI_SIVU_ROOLIT as readonly string[]).includes(rooli)) {
    return rooli as KonsulttiSivuRooli;
  }
  return "yva_konsultti";
}
