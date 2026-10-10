/**
 * Lähde-URL:n metatiedot (dokumentit-taulu) vs. kenttäkohtainen väite (kentta_lahteet).
 *
 * - sitovuustaso: lähteen virallisuus URL-tasolla (dokumentit.sitovuustaso).
 * - luottamus: yksittäisen faktaväitteen luottamus lähteen perusteella
 *   (kentta_lahteet.luottamus: vahvistettu / epavarma / ristiriitainen).
 *
 * Älä johda toista toisesta automaattisesti.
 */

export const LAHDE_TYYPIT = [
  "paatos",
  "viranomaisasiakirja",
  "rekisteri",
  "hankkeen_oma",
  "media",
  "menetelma",
  "muu",
] as const;

export type LahdeTyyppi = (typeof LAHDE_TYYPIT)[number];

export const SITOVUUSTASOT = ["sitova", "virallinen", "epavirallinen"] as const;

export type Sitovuustaso = (typeof SITOVUUSTASOT)[number];

export const LAHDE_TYYPPI_NIMET: Record<LahdeTyyppi, string> = {
  paatos: "Viranomaisen päätös tai lupa",
  viranomaisasiakirja: "Viranomaisasiakirja",
  rekisteri: "Rakenteinen rekisteri",
  hankkeen_oma: "Hanketoimijan materiaali",
  media: "Media tai uutinen",
  menetelma: "Menetelmä (esim. geokoodaus)",
  muu: "Muu lähde",
};

export const SITOVUUSTASO_NIMET: Record<Sitovuustaso, string> = {
  sitova: "Sitova",
  virallinen: "Virallinen",
  epavirallinen: "Epävirallinen",
};

/** Faktaväitteen lähde (ei dokumentin metatietorakennetta). */
export function onFaktalahde(lahde: { tekninen_lahde?: boolean }): boolean {
  return lahde.tekninen_lahde !== true;
}

/** Dokumentin näyttöotsikko: automaattinen rivi näytetään URL:na, mutta raportoidaan erikseen. */
export function naytaDokumenttiOtsikko(dokumentti: {
  url: string;
  otsikko: string;
  otsikko_automaattinen: boolean;
}): string {
  if (dokumentti.otsikko_automaattinen) return dokumentti.url;
  return dokumentti.otsikko;
}

/** Hankkeen dokumenttirekisteri → linkkiteksti kenttälähteille (avain = dokumentin url). */
export function rakennaDokumenttiLinkkiTekstit(
  dokumentit: ReadonlyArray<{
    url: string;
    otsikko: string;
    otsikko_automaattinen: boolean;
  }>,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const d of dokumentit) {
    map.set(d.url, naytaDokumenttiOtsikko(d));
  }
  return map;
}

export function naytaLahdeLinkkiTeksti(
  lahdeUrl: string,
  linkkiTekstit?: ReadonlyMap<string, string>,
): string {
  return linkkiTekstit?.get(lahdeUrl) ?? lahdeUrl;
}

/** Lomakkeen oletus sitovuustaso tyypin perusteella (vain UI-esitäyttö, ei tietokantatriggeriä). */
export function oletusSitovuustaso(tyyppi: LahdeTyyppi): Sitovuustaso {
  switch (tyyppi) {
    case "paatos":
      return "sitova";
    case "viranomaisasiakirja":
    case "rekisteri":
      return "virallinen";
    case "hankkeen_oma":
    case "media":
    case "menetelma":
    case "muu":
      return "epavirallinen";
  }
}
