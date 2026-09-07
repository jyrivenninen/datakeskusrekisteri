/** PDF/HTML-asiakirjan tekstin nouto agenteille. Ei kielimallia. */
import { createHash } from "node:crypto";
import { extractText } from "unpdf";

const OLETUS_UA =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; dokumentti)";
const MAX_BAITIT = 25 * 1024 * 1024;

export type DokumenttiNouto = {
  tila: number;
  teksti: string;
  tiiviste: string;
  merkkimaara: number;
  ms: number;
};

function tiiviste(teksti: string): string {
  return createHash("sha256").update(teksti, "utf8").digest("hex");
}

function tasaaValilyonnit(teksti: string): string {
  return teksti.replace(/\s+/g, " ").trim();
}

function htmlTekstiksi(html: string): string {
  const ilman = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return tasaaValilyonnit(ilman);
}

function onPdf(tyyppi: string, url: string): boolean {
  if (tyyppi.includes("application/pdf")) return true;
  return url.toLowerCase().includes(".pdf");
}

function onHtml(tyyppi: string, raaka: string): boolean {
  if (tyyppi.includes("text/html") || tyyppi.includes("application/xhtml")) return true;
  return raaka.trimStart().startsWith("<");
}

async function pdfTekstiksi(puskuri: Uint8Array): Promise<string> {
  const tulos = await extractText(puskuri, { mergePages: true });
  return tasaaValilyonnit(tulos.text);
}

export async function noudaDokumenttiTeksti(
  url: string,
  opts?: { userAgent?: string },
): Promise<DokumenttiNouto> {
  const alku = Date.now();
  const vastaus = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": opts?.userAgent ?? OLETUS_UA,
      Accept: "application/pdf,text/html,*/*",
    },
    signal: AbortSignal.timeout(60_000),
  });
  const pituus = Number(vastaus.headers.get("content-length") ?? "0");
  if (pituus > MAX_BAITIT) {
    throw new Error(`Tiedosto on liian suuri (${pituus} tavua).`);
  }
  const puskuri = new Uint8Array(await vastaus.arrayBuffer());
  if (puskuri.byteLength > MAX_BAITIT) {
    throw new Error(`Tiedosto on liian suuri (${puskuri.byteLength} tavua).`);
  }
  const tyyppi = (vastaus.headers.get("content-type") ?? "").toLowerCase();
  let teksti: string;
  if (onPdf(tyyppi, url)) {
    teksti = await pdfTekstiksi(puskuri);
  } else {
    const raaka = new TextDecoder("utf-8", { fatal: false }).decode(puskuri);
    teksti = onHtml(tyyppi, raaka) ? htmlTekstiksi(raaka) : tasaaValilyonnit(raaka);
  }
  return {
    tila: vastaus.status,
    teksti,
    tiiviste: tiiviste(teksti),
    merkkimaara: teksti.length,
    ms: Date.now() - alku,
  };
}
