import type { KuntaSovitin, Kokous } from "../tyypit";

const USER_AGENT = "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; casem)";
const KOKOUS_KATTO = Number(process.env.KUNTA_CASEM_KOKOUS_KATTO ?? "20");

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

/** CloudNC Kokous_792026 → 7.9.2026, Kokous_1492026 → 14.9.2026 */
function parseKokousPvm(polku: string): Date | undefined {
  const osuma = polku.match(/Kokous_(\d{5,8})/i);
  if (!osuma?.[1]) return undefined;
  const digits = osuma[1];
  const vuosi = Number(digits.slice(-4));
  const dm = digits.slice(0, -4);
  if (!vuosi || dm.length < 2) return undefined;
  let paiva: number;
  let kuukausi: number;
  if (dm.length === 2) {
    paiva = Number(dm[0]);
    kuukausi = Number(dm[1]);
  } else if (dm.length === 3) {
    paiva = Number(dm.slice(0, 2));
    kuukausi = Number(dm[2]);
  } else if (dm.length === 4) {
    paiva = Number(dm.slice(0, 2));
    kuukausi = Number(dm.slice(2, 4));
  } else {
    return undefined;
  }
  if (paiva < 1 || paiva > 31 || kuukausi < 1 || kuukausi > 12) return undefined;
  return new Date(Date.UTC(vuosi, kuukausi - 1, paiva));
}

function parseLinkkiPvm(teksti: string): Date | undefined {
  const osuma = teksti.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
  if (!osuma) return undefined;
  const paiva = Number(osuma[1]);
  const kuukausi = Number(osuma[2]);
  const vuosi = Number(osuma[3]);
  return new Date(Date.UTC(vuosi, kuukausi - 1, paiva));
}

type Linkki = { href: string; teksti: string };

function puraLinkit(html: string): Linkki[] {
  const tulokset: Linkki[] = [];
  for (const osuma of html.matchAll(/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = osuma[1]?.trim();
    const teksti = decodeHtml(osuma[2] ?? "");
    if (!href || !teksti) continue;
    tulokset.push({ href, teksti });
  }
  return tulokset;
}

function onSisaltoLinkki(href: string): boolean {
  return /\/content\/\d+\/\d+/i.test(href) || /\/fi-FI\/content\/\d+\/\d+/i.test(href);
}

function onKokousLinkki(href: string): boolean {
  return /\/Kokous_\d/i.test(href);
}

async function haeHtml(url: string): Promise<string> {
  const vastaus = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) throw new Error(`CaseM ${vastaus.status}: ${url}`);
  return vastaus.text();
}

function linkkiKohteeksi(
  perusUrl: string,
  linkki: Linkki,
  oletusPvm?: Date,
): Kokous | null {
  if (!onSisaltoLinkki(linkki.href)) return null;
  const url = absUrl(perusUrl, linkki.href);
  const pvm = parseLinkkiPvm(linkki.teksti) ?? oletusPvm;
  return { otsikko: linkki.teksti, url, alkaa: pvm };
}

function jarjestaAbsoluttisesti(perusUrl: string): string {
  const u = new URL(perusUrl);
  if (!u.pathname.endsWith("/fi-FI") && !u.pathname.endsWith("/fi-FI/")) {
    u.pathname = u.pathname.replace(/\/?$/, "") + "/fi-FI";
  }
  return u.toString().replace(/\/$/, "") + "/";
}

export const casemSovitin: KuntaSovitin = {
  tunnus: "casem",

  async haeKokoukset(kuntaUrl, alkaen) {
    const juuri = jarjestaAbsoluttisesti(kuntaUrl);
    const etusivu = await haeHtml(juuri);
    const perus = juuri;

    const nahdyt = new Set<string>();
    const kohteet: Kokous[] = [];

    for (const linkki of puraLinkit(etusivu)) {
      const kohde = linkkiKohteeksi(perus, linkki);
      if (!kohde) continue;
      if (kohde.alkaa && kohde.alkaa < alkaen) continue;
      if (nahdyt.has(kohde.url)) continue;
      nahdyt.add(kohde.url);
      kohteet.push(kohde);
    }

    const kokousLinkit = puraLinkit(etusivu)
      .filter((l) => onKokousLinkki(l.href))
      .map((l) => ({
        url: absUrl(perus, l.href),
        pvm: parseKokousPvm(l.href) ?? parseLinkkiPvm(l.teksti),
      }))
      .filter((k) => !k.pvm || k.pvm >= alkaen)
      .slice(0, Number.isFinite(KOKOUS_KATTO) && KOKOUS_KATTO > 0 ? KOKOUS_KATTO : 20);

    for (const kokous of kokousLinkit) {
      let html: string;
      try {
        html = await haeHtml(kokous.url);
      } catch {
        continue;
      }
      for (const linkki of puraLinkit(html)) {
        const kohde = linkkiKohteeksi(perus, linkki, kokous.pvm);
        if (!kohde) continue;
        if (kohde.alkaa && kohde.alkaa < alkaen) continue;
        if (nahdyt.has(kohde.url)) continue;
        nahdyt.add(kohde.url);
        kohteet.push(kohde);
      }
    }

    return kohteet;
  },

  async haeAsiat(kokousUrl) {
    const html = await haeHtml(kokousUrl);
    const perus = kokousUrl;
    const pvm = parseKokousPvm(kokousUrl);
    return puraLinkit(html)
      .map((l) => linkkiKohteeksi(perus, l, pvm))
      .filter((k): k is Kokous => k != null);
  },
};
