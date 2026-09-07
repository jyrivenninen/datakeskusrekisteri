/**
 * 7A.6 / 7A.5.8 avoindata.fi — JSON/API-resurssien sovitin kuntien kokousdataan.
 */
import type { Asia, KuntaSovitin, Kokous } from "../tyypit";

type JsonKokous = Record<string, unknown>;

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const t = arvo.trim();
  return t === "" ? null : t;
}

function parsiiPaivamaara(teksti: string): Date | undefined {
  const suomalainen = teksti.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (suomalainen) {
    const [, pv, kk, v] = suomalainen;
    const pvm = new Date(`${v}-${kk!.padStart(2, "0")}-${pv!.padStart(2, "0")}`);
    return Number.isNaN(pvm.getTime()) ? undefined : pvm;
  }
  const pvm = new Date(teksti);
  return Number.isNaN(pvm.getTime()) ? undefined : pvm;
}

function normalisoiKokous(rivi: JsonKokous, alkaen: Date): Kokous | null {
  const otsikko =
    merkkijono(rivi.title) ??
    merkkijono(rivi.name) ??
    merkkijono(rivi.mname) ??
    merkkijono(rivi.subject);
  const kuvaus =
    merkkijono(rivi.description) ??
    merkkijono(rivi.mdescription) ??
    merkkijono(rivi.morgan) ??
    undefined;
  const url =
    merkkijono(rivi.url) ??
    merkkijono(rivi.link) ??
    merkkijono(rivi.doclink) ??
    merkkijono(rivi.href);
  if (!otsikko || !url || !/^https?:\/\//i.test(url)) return null;

  const aikaTeksti =
    merkkijono(rivi.datetime) ??
    merkkijono(rivi.mdatetime) ??
    merkkijono(rivi.date) ??
    merkkijono(rivi.published);
  const alkaa = aikaTeksti ? parsiiPaivamaara(aikaTeksti) : undefined;
  if (alkaa && alkaa < alkaen) return null;

  const nimi = kuvaus ? `${kuvaus}: ${otsikko}` : otsikko;
  return { otsikko: nimi, url, alkaa, kuvaus };
}

function puraTaulukko(runko: unknown): JsonKokous[] {
  if (Array.isArray(runko)) return runko as JsonKokous[];
  if (!runko || typeof runko !== "object") return [];
  const obj = runko as Record<string, unknown>;
  for (const avain of ["results", "items", "data", "meetings", "records"]) {
    if (Array.isArray(obj[avain])) return obj[avain] as JsonKokous[];
  }
  return [];
}

export const avoindataSovitin: KuntaSovitin = {
  tunnus: "avoindata",

  async haeKokoukset(kuntaUrl, alkaen) {
    const vastaus = await fetch(kuntaUrl, {
      headers: { Accept: "application/json, */*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!vastaus.ok) {
      throw new Error(`Avoindata JSON ${vastaus.status}: ${kuntaUrl}`);
    }
    const runko = (await vastaus.json()) as unknown;
    const rivit = puraTaulukko(runko);
    const tulokset: Kokous[] = [];
    for (const rivi of rivit) {
      const kokous = normalisoiKokous(rivi, alkaen);
      if (kokous) tulokset.push(kokous);
    }
    return tulokset;
  },

  async haeAsiat(kokousUrl) {
    if (!/^https?:\/\//i.test(kokousUrl)) return [];
    return [
      {
        otsikko: "Kokousasiakirja",
        url: kokousUrl,
        kuvaus: undefined,
      },
    ];
  },
};
