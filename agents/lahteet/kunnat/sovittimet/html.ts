import type { Asia, Kokous, KuntaSovitin } from "../tyypit";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; html)";
const KOKOUS_KATTO = Number(process.env.KUNTA_HTML_KOKOUS_KATTO ?? "15");

/** Helsinki paatokset.hel.fi — keskeiset toimielimet datacenter-aiheille. */
const HELSINKI_TOIMIELIMET = [
  "kaupunginvaltuusto",
  "kaupunginhallitus",
  "kaupunkiymparistolautakunta",
  "kaupunginhallituksen-elinkeinojaosto",
  "kaupunginhallituksen-konsernijaosto",
] as const;

function decodeHtml(raaka: string): string {
  return raaka
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&aring;/gi, "å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function absUrl(perus: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, perus).toString();
}

async function haeHtml(url: string): Promise<string> {
  const vastaus = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) throw new Error(`HTML ${vastaus.status}: ${url}`);
  return vastaus.text();
}

type KokousLista = { url: string; pvm?: Date; otsikko: string };

function puraHelsinkiKokoukset(html: string, perusUrl: string, alkaen: Date): KokousLista[] {
  const tulokset: KokousLista[] = [];
  const katto =
    Number.isFinite(KOKOUS_KATTO) && KOKOUS_KATTO > 0 ? KOKOUS_KATTO : 15;

  for (const lohko of html.matchAll(/<div class="views-row">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi)) {
    const sisalto = lohko[1] ?? "";
    const linkki = sisalto.match(
      /<a\s+[^>]*href=['"](\/fi\/paattajat\/[^'"]+\/asiakirjat\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkki?.[1]) continue;

    const otsikko = decodeHtml(linkki[2] ?? "");
    const url = absUrl(perusUrl, linkki[1]);
    const aika = sisalto.match(/<time\s+datetime=['"]([^'"]+)['"]/i);
    const pvm = aika?.[1] ? new Date(aika[1]) : undefined;
    if (pvm && !Number.isNaN(pvm.getTime()) && pvm < alkaen) continue;

    tulokset.push({ url, pvm, otsikko });
    if (tulokset.length >= katto) break;
  }

  return tulokset;
}

function puraHelsinkiAsiat(html: string, perusUrl: string): Asia[] {
  const tulokset: Asia[] = [];
  const nahdyt = new Set<string>();

  for (const osuma of html.matchAll(
    /<a\s+href=['"](\/fi\/asia\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = osuma[1]?.trim();
    if (!href) continue;
    const url = absUrl(perusUrl, href);
    if (nahdyt.has(url)) continue;
    nahdyt.add(url);

    const raaka = osuma[2] ?? "";
    const aihe = raaka.match(/agenda-item__subject[^>]*>([^<]+)/i);
    const otsikko = aihe?.[1]
      ? decodeHtml(aihe[1])
      : decodeHtml(raaka.replace(/agenda-item__index-number[^>]*>[^<]*/gi, ""));
    if (!otsikko) continue;

    tulokset.push({ otsikko, url });
  }

  return tulokset;
}

function helsinkiJuuri(perusUrl: string): string {
  const u = new URL(perusUrl);
  u.pathname = "/fi";
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

async function haeHelsinkiKokoukset(perusUrl: string, alkaen: Date): Promise<Kokous[]> {
  const juuri = helsinkiJuuri(perusUrl);
  const kohteet: Kokous[] = [];
  const nahdyt = new Set<string>();

  for (const slug of HELSINKI_TOIMIELIMET) {
    const listaUrl = `${juuri}/paattajat/${slug}/asiakirjat`;
    let html: string;
    try {
      html = await haeHtml(listaUrl);
    } catch {
      continue;
    }

    for (const kokous of puraHelsinkiKokoukset(html, juuri, alkaen)) {
      let kokousHtml: string;
      try {
        kokousHtml = await haeHtml(kokous.url);
      } catch {
        continue;
      }

      for (const asia of puraHelsinkiAsiat(kokousHtml, juuri)) {
        if (nahdyt.has(asia.url)) continue;
        nahdyt.add(asia.url);
        kohteet.push({
          otsikko: asia.otsikko,
          url: asia.url,
          alkaa: kokous.pvm,
          kuvaus: kokous.otsikko,
        });
      }
    }
  }

  return kohteet;
}

function tunnistaHost(url: string): "helsinki" | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "paatokset.hel.fi" || host.endsWith(".paatokset.hel.fi")) {
      return "helsinki";
    }
  } catch {
    /* ohita */
  }
  return null;
}

export const htmlSovitin: KuntaSovitin = {
  tunnus: "html",

  async haeKokoukset(kuntaUrl, alkaen) {
    const jarjestelma = tunnistaHost(kuntaUrl);
    if (jarjestelma === "helsinki") {
      return haeHelsinkiKokoukset(kuntaUrl, alkaen);
    }
    throw new Error(`HTML-sovitin: tuntematon osoite ${kuntaUrl}`);
  },

  async haeAsiat(kokousUrl) {
    const juuri = helsinkiJuuri(kokousUrl);
    const html = await haeHtml(kokousUrl);
    return puraHelsinkiAsiat(html, juuri);
  },
};
