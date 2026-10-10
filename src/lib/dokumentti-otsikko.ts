/** Julkinen otsikko: ei puhelinnumeroa eikä yhteyshenkilöblokkeja PDF-raiskauksesta. */

const NIMETYT_HTML_ENTITEETIT: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  aring: "å",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  Aring: "Å",
  aacute: "á",
  eacute: "é",
  oacute: "ó",
  raquo: "»",
  laquo: "«",
  ndash: "–",
  mdash: "—",
};

/** Purkaa otsikkoon jääneet HTML-entiteetit (`&#246;`, `&auml;`). */
export function puraHtmlEntiteetit(teksti: string): string {
  let tulos = teksti;
  for (let kierros = 0; kierros < 3; kierros += 1) {
    const seuraava = tulos.replace(
      /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g,
      (koko, sisus: string) => {
        if (sisus.startsWith("#")) {
          const koodi =
            sisus[1] === "x" || sisus[1] === "X"
              ? Number.parseInt(sisus.slice(2), 16)
              : Number.parseInt(sisus.slice(1), 10);
          if (!Number.isInteger(koodi) || koodi < 1 || koodi > 0x10ffff) return koko;
          return String.fromCodePoint(koodi);
        }
        return NIMETYT_HTML_ENTITEETIT[sisus] ?? koko;
      },
    );
    if (seuraava === tulos) break;
    tulos = seuraava;
  }
  return tulos;
}

const SUOMALAINEN_PUHELIN =
  /\b0\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b|\b\+358[\s.-]?\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/;

/** Otsikko näyttää yhteystiedoilta (puhelin, sähköposti, YVA-yhteyshenkilö). */
export function onYhteystietoOtsikko(otsikko: string): boolean {
  const o = otsikko.trim();
  if (!o) return false;
  if (SUOMALAINEN_PUHELIN.test(o)) return true;
  if (/yhteyshenkilö|yhteysviranomainen|yva-yhteys/i.test(o) && /@/.test(o)) return true;
  if (/^[\d\s.+@-]+\s*(email|sähköposti)?\.?$/i.test(o)) return true;
  return false;
}

/** Tiedostonimi URL:sta ihmislukuiseksi otsikoksi. */
export function otsikkoUrlista(url: string): string | null {
  try {
    const tiedosto = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "")
      .replace(/\.(pdf|html?|docx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (tiedosto.length < 8 || tiedosto.length > 160) return null;
    if (/^\d+$/.test(tiedosto.replace(/\s/g, ""))) return null;
    if (SUOMALAINEN_PUHELIN.test(tiedosto)) return null;
    return tiedosto;
  } catch {
    return null;
  }
}

export function turvallinenDokumenttiOtsikko(dokumentti: {
  url: string;
  otsikko: string;
  otsikko_automaattinen: boolean;
}): string {
  if (dokumentti.otsikko_automaattinen) return dokumentti.url;
  const otsikko = puraHtmlEntiteetit(dokumentti.otsikko).trim();
  if (!onYhteystietoOtsikko(otsikko)) return otsikko;
  return otsikkoUrlista(dokumentti.url) ?? dokumentti.url;
}
