import type { Asia, Kokous, KuntaSovitin } from "../tyypit";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; tweb)";
const KOKOUS_KATTO = Number(process.env.KUNTA_TWEB_KOKOUS_KATTO ?? "15");

/** Oulu asiakirjat.ouka.fi — datacenter-aiheisiin liittyvät toimielimet. */
const OULU_TOIMIELIMET = new Set([
  "Kaupunginvaltuusto",
  "Kaupunginhallitus",
  "Yhdyskuntalautakunta",
  "Rakennuslautakunta",
  "Kaupunginhallituksen konsernijaosto",
  "Kaupunginhallituksen kehitysjaosto",
]);

function decodeLatin1(raaka: string): string {
  return raaka
    .replace(/&#(\d+);/g, (_, n) => {
      const koodi = Number(n);
      return Number.isFinite(koodi) ? String.fromCharCode(koodi) : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function decodeHtml(raaka: string): string {
  return decodeLatin1(raaka)
    .replace(/<[^>]+>/g, " ")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&aring;/gi, "å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absUrl(perus: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, perus).toString();
}

async function haeTeksti(url: string): Promise<string> {
  const vastaus = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) throw new Error(`Tweb ${vastaus.status}: ${url}`);
  const puskuri = Buffer.from(await vastaus.arrayBuffer());
  return puskuri.toString("latin1");
}

function parsePaivamaara(teksti: string): Date | undefined {
  const osumat = [...teksti.matchAll(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/g)];
  if (osumat.length === 0) return undefined;
  const viimeinen = osumat[osumat.length - 1];
  if (!viimeinen) return undefined;
  const paiva = Number(viimeinen[1]);
  const kuukausi = Number(viimeinen[2]);
  const vuosi = Number(viimeinen[3]);
  if (paiva < 1 || paiva > 31 || kuukausi < 1 || kuukausi > 12) return undefined;
  return new Date(Date.UTC(vuosi, kuukausi - 1, paiva));
}

type KokousRss = { otsikko: string; url: string; pvm?: Date; toimielin?: string };

function puraRssKokoukset(sisalto: string, alkaen: Date): KokousRss[] {
  const tulokset: KokousRss[] = [];
  for (const lohko of sisalto.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const item = lohko[0];
    const otsikko = item.match(/<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/title>/i);
    const linkki = item.match(/<link>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/link>/i);
    const kategoria = item.match(/<category>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/category>/i);
    const title = decodeHtml(otsikko?.[1] ?? otsikko?.[2] ?? "");
    const url = (linkki?.[1] ?? linkki?.[2] ?? "").trim();
    const toimielin = decodeHtml(kategoria?.[1] ?? kategoria?.[2] ?? "");
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    if (toimielin && !OULU_TOIMIELIMET.has(toimielin)) continue;
    const pvm = parsePaivamaara(title);
    if (pvm && pvm < alkaen) continue;
    tulokset.push({ otsikko: title, url, pvm, toimielin });
  }
  return tulokset;
}

function puraAsiat(html: string, perusUrl: string, kokous: KokousRss): Kokous[] {
  const tulokset: Kokous[] = [];
  const caption = html.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  const kokousOtsikko = decodeHtml(caption?.[1] ?? kokous.otsikko);
  const kokousPvm = parsePaivamaara(kokousOtsikko) ?? kokous.pvm;

  for (const rivi of html.matchAll(
    /<tr class="data\d">[\s\S]*?<td class="data"\s*>(\d*)<\/td>[\s\S]*?<td class="data"\s*>([\s\S]*?)<\/td>/gi,
  )) {
    const pykala = rivi[1]?.trim();
    const solu = rivi[2] ?? "";
    const linkki = solu.match(/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkki?.[1]) continue;
    const otsikko = decodeHtml(linkki[2] ?? "");
    if (!otsikko) continue;
    if (!pykala && /kokouskutsu|järjestäytyminen/i.test(otsikko)) continue;

    const url = absUrl(perusUrl, linkki[1]);
    tulokset.push({
      otsikko,
      url,
      alkaa: kokousPvm,
      kuvaus: kokousOtsikko,
    });
  }

  return tulokset;
}

function ouluRssUrl(perusUrl: string): string {
  const u = new URL(perusUrl);
  if (u.hostname.includes("ouka.fi")) {
    u.pathname = "/ktwebscr/epj_rssfeed.htm";
    u.search = "?toimielin=";
    u.hash = "";
    return u.toString();
  }
  return perusUrl;
}

function ouluJuuri(perusUrl: string): string {
  const u = new URL(perusUrl);
  return `${u.protocol}//${u.host}/`;
}

async function haeOuluKokoukset(perusUrl: string, alkaen: Date): Promise<Kokous[]> {
  const rssUrl = ouluRssUrl(perusUrl);
  const juuri = ouluJuuri(perusUrl);
  const rss = await haeTeksti(rssUrl);
  const katto =
    Number.isFinite(KOKOUS_KATTO) && KOKOUS_KATTO > 0 ? KOKOUS_KATTO : 15;

  const kokoukset = puraRssKokoukset(rss, alkaen).slice(0, katto);
  const kohteet: Kokous[] = [];
  const nahdyt = new Set<string>();

  for (const kokous of kokoukset) {
    let html: string;
    try {
      html = await haeTeksti(kokous.url);
    } catch {
      continue;
    }
    for (const asia of puraAsiat(html, juuri, kokous)) {
      if (nahdyt.has(asia.url)) continue;
      nahdyt.add(asia.url);
      kohteet.push(asia);
    }
  }

  return kohteet;
}

function tunnistaHost(url: string): "oulu" | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "asiakirjat.ouka.fi" || host.endsWith(".asiakirjat.ouka.fi")) {
      return "oulu";
    }
  } catch {
    /* ohita */
  }
  return null;
}

export const twebSovitin: KuntaSovitin = {
  tunnus: "tweb",

  async haeKokoukset(kuntaUrl, alkaen) {
    if (tunnistaHost(kuntaUrl) === "oulu") {
      return haeOuluKokoukset(kuntaUrl, alkaen);
    }
    throw new Error(`Tweb-sovitin: tuntematon osoite ${kuntaUrl}`);
  },

  async haeAsiat(kokousUrl) {
    const juuri = ouluJuuri(kokousUrl);
    const html = await haeTeksti(kokousUrl);
    return puraAsiat(html, juuri, { otsikko: "", url: kokousUrl }) as Asia[];
  },
};
