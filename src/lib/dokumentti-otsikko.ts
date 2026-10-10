/** Julkinen otsikko: ei puhelinnumeroa eikä yhteyshenkilöblokkeja PDF-raiskauksesta. */

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
  const otsikko = dokumentti.otsikko.trim();
  if (!onYhteystietoOtsikko(otsikko)) return otsikko;
  return otsikkoUrlista(dokumentti.url) ?? dokumentti.url;
}
