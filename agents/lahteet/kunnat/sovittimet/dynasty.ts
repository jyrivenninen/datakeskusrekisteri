import type { Asia, KuntaDokumentti } from "../tyypit";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; dynasty)";

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

/** Dynasty / DWEB meetingitem-sivu (esim. Kouvolan RSS-linkit). */
export function onkoDynastyAsiaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      /drequest\.php$/i.test(u.pathname) &&
      u.searchParams.get("page")?.toLowerCase() === "meetingitem"
    );
  } catch {
    return false;
  }
}

function siistiAriaLabel(teksti: string): string {
  return decodeHtml(teksti)
    .replace(/\s*pdf\s+[\d.]+\s*kb.*$/i, "")
    .replace(/\s*-\s*Avautuu uuteen ikkunaan\s*$/i, "")
    .trim();
}

function otsikkoLinkeista(ariaLabel: string | null, sisalto: string): string {
  if (ariaLabel) {
    const siivottu = siistiAriaLabel(ariaLabel);
    if (siivottu) return siivottu;
  }
  const teksti = decodeHtml(sisalto.replace(/<span class=['"]prefix['"][^>]*>[\s\S]*?<\/span>/gi, ""));
  return teksti || "Asiakirja";
}

function paatteleLaji(otsikko: string): "kuulutus" | "muu" {
  const p = otsikko.toLowerCase();
  if (/päätös|paatos|lupa|lupap/.test(p)) return "muu";
  if (/kokousasia|esityslista|pöytäkirja|poytakirja/.test(p)) return "kuulutus";
  return "kuulutus";
}

/** Poimii PDF-linkit Dynasty-kokousasian HTML-sivulta. */
export function puraDynastyDokumentit(html: string, sivuUrl: string): Asia[] {
  const tulokset: Asia[] = [];
  const nahdyt = new Set<string>();

  for (const osuma of html.matchAll(
    /<a\b[^>]*\bhref=['"]([^'"]+\.pdf[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = osuma[1]?.trim();
    if (!href) continue;
    const url = absUrl(sivuUrl, href);
    const avain = url.toLowerCase();
    if (nahdyt.has(avain)) continue;
    nahdyt.add(avain);

    const kokoTagi = osuma[0] ?? "";
    const aria = kokoTagi.match(/\baria-label=['"]([^'"]*)['"]/i)?.[1] ?? null;
    const otsikko = otsikkoLinkeista(aria, osuma[2] ?? "");
    tulokset.push({
      otsikko,
      url,
      kuvaus: paatteleLaji(otsikko),
    });
  }

  return tulokset;
}

export function asiaKuntaDokumentiksi(asia: Asia): KuntaDokumentti {
  const laji = asia.kuvaus === "muu" ? "muu" : "kuulutus";
  const muoto = /\.pdf($|\?)/i.test(asia.url) ? "pdf" : "muu";
  return {
    url: asia.url,
    otsikko: asia.otsikko,
    muoto,
    laji,
  };
}

/** Hakee Dynasty-kokousasian PDF-linkit valmiina kunta-dokumentteina. */
export async function haeKuntaDokumentit(asiaUrl: string): Promise<KuntaDokumentti[]> {
  if (!onkoDynastyAsiaUrl(asiaUrl)) return [];
  const asiat = await haeDynastyDokumentit(asiaUrl);
  return asiat.map(asiaKuntaDokumentiksi);
}

export async function haeDynastyDokumentit(asiaUrl: string): Promise<Asia[]> {
  const vastaus = await fetch(asiaUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) {
    throw new Error(`Dynasty ${vastaus.status}: ${asiaUrl}`);
  }
  const html = await vastaus.text();
  return puraDynastyDokumentit(html, asiaUrl);
}
