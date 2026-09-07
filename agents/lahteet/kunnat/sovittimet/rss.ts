import { haeDynastyDokumentit, onkoDynastyAsiaUrl } from "./dynasty";
import type { Asia, KuntaSovitin, Kokous } from "../tyypit";

function puraTagi(lohko: string, tagi: string): string | null {
  const re = new RegExp(
    `<${tagi}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tagi}>`,
    "i",
  );
  const osuma = lohko.match(re);
  if (!osuma) return null;
  const arvo = (osuma[1] ?? osuma[2] ?? "").trim();
  return arvo || null;
}

function puraLinkki(lohko: string): string | null {
  const atom = lohko.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom?.[1]) return atom[1].trim();
  const rss = puraTagi(lohko, "link");
  return rss;
}

function puraPaivamaara(lohko: string): Date | undefined {
  const teksti =
    puraTagi(lohko, "pubDate") ??
    puraTagi(lohko, "dc:date") ??
    puraTagi(lohko, "updated");
  if (!teksti) return undefined;
  const pvm = new Date(teksti);
  return Number.isNaN(pvm.getTime()) ? undefined : pvm;
}

function jaaKohteet(sisalto: string): string[] {
  const normalisoitu = sisalto.replace(/\r\n/g, "\n");
  if (/<entry[\s>]/i.test(normalisoitu)) {
    return [...normalisoitu.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  }
  return [...normalisoitu.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
}

function puraXmlEncoding(otsikko: string): "latin1" | "utf8" {
  const osuma = otsikko.match(/encoding=['"]([^'"]+)['"]/i);
  const enc = osuma?.[1]?.toLowerCase() ?? "";
  if (enc.includes("8859") || enc === "latin1" || enc === "windows-1252") {
    return "latin1";
  }
  return "utf8";
}

async function haeRssTeksti(vastaus: Response): Promise<string> {
  const puskuri = Buffer.from(await vastaus.arrayBuffer());
  const alku = puskuri.subarray(0, 200).toString("latin1");
  const encoding = puraXmlEncoding(alku);
  return puskuri.toString(encoding);
}

function parseRss(sisalto: string, alkaen: Date): Kokous[] {
  const tulokset: Kokous[] = [];
  for (const lohko of jaaKohteet(sisalto)) {
    const otsikko = puraTagi(lohko, "title");
    const url = puraLinkki(lohko);
    if (!otsikko || !url || !/^https?:\/\//i.test(url)) continue;
    const alkaa = puraPaivamaara(lohko);
    if (alkaa && alkaa < alkaen) continue;
    const kuvaus =
      puraTagi(lohko, "description") ??
      puraTagi(lohko, "content:encoded") ??
      puraTagi(lohko, "summary") ??
      undefined;
    tulokset.push({ otsikko, url, alkaa, kuvaus });
  }
  return tulokset;
}

export const rssSovitin: KuntaSovitin = {
  tunnus: "rss",

  async haeKokoukset(kuntaUrl, alkaen) {
    const vastaus = await fetch(kuntaUrl, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!vastaus.ok) {
      throw new Error(`RSS ${vastaus.status}: ${kuntaUrl}`);
    }
    const teksti = await haeRssTeksti(vastaus);
    return parseRss(teksti, alkaen);
  },

  async haeAsiat(asiaUrl) {
    if (onkoDynastyAsiaUrl(asiaUrl)) {
      return haeDynastyDokumentit(asiaUrl);
    }
    return [] as Asia[];
  },
};
