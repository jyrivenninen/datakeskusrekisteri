import type { KuntaSovitin, Kokous } from "../tyypit";

function puraIcalKentta(lohko: string, avain: string): string | null {
  const re = new RegExp(`^${avain}(?:;[^:]*)?:(.*)$`, "im");
  const osuma = lohko.match(re);
  if (!osuma?.[1]) return null;
  return osuma[1].replace(/\\n/g, "\n").replace(/\\,/g, ",").trim() || null;
}

function parseIcalPaivamaara(teksti: string): Date | undefined {
  const siisti = teksti.trim();
  const paiva = siisti.match(/^(\d{4})(\d{2})(\d{2})/);
  if (paiva) {
    const pvm = new Date(`${paiva[1]}-${paiva[2]}-${paiva[3]}T00:00:00Z`);
    return Number.isNaN(pvm.getTime()) ? undefined : pvm;
  }
  const pvm = new Date(siisti);
  return Number.isNaN(pvm.getTime()) ? undefined : pvm;
}

function parseIcal(sisalto: string, alkaen: Date): Kokous[] {
  const tulokset: Kokous[] = [];
  const lohkot = sisalto.split(/BEGIN:VEVENT/i).slice(1);
  for (const raaka of lohkot) {
    const lohko = `BEGIN:VEVENT${raaka.split(/END:VEVENT/i)[0]}`;
    const otsikko = puraIcalKentta(lohko, "SUMMARY");
    const url = puraIcalKentta(lohko, "URL");
    if (!otsikko) continue;
    const alkaaTeksti = puraIcalKentta(lohko, "DTSTART");
    const alkaa = alkaaTeksti ? parseIcalPaivamaara(alkaaTeksti) : undefined;
    if (alkaa && alkaa < alkaen) continue;
    const kuvaus = puraIcalKentta(lohko, "DESCRIPTION") ?? undefined;
    tulokset.push({
      otsikko,
      url: url && /^https?:\/\//i.test(url) ? url : "",
      alkaa,
      kuvaus,
    });
  }
  return tulokset.filter((k) => k.url || k.otsikko);
}

export const icalSovitin: KuntaSovitin = {
  tunnus: "ical",

  async haeKokoukset(kuntaUrl, alkaen) {
    const vastaus = await fetch(kuntaUrl, {
      headers: { Accept: "text/calendar, */*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!vastaus.ok) {
      throw new Error(`iCal ${vastaus.status}: ${kuntaUrl}`);
    }
    const teksti = await vastaus.text();
    return parseIcal(teksti, alkaen).filter((k) => k.url);
  },

  async haeAsiat() {
    return [];
  },
};
