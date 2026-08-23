/** Verkkokutsut eivät saa jumittaa Vercelin reititystä tai sivun renderöintiä. */

const AIKA_MS = 8_000;

export function haeAjalla(
  syote: RequestInfo | URL,
  asetukset?: RequestInit,
): Promise<Response> {
  return fetch(syote, { ...asetukset, signal: AbortSignal.timeout(AIKA_MS) });
}
