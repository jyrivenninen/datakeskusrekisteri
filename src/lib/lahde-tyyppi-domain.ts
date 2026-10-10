import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";

export type LahdeTyyppiEhdotusKonteksti = {
  /** Toimijan verkkotunnukset (esim. organisaatio.verkko_osoite → host). */
  toimijaTunnukset?: readonly string[];
};

/** Domain/polku-pohjainen ehdotus (ei kielimallia). null = ei ehdotusta. */
export function ehdotaLahdeTyyppiUrlille(
  url: string,
  konteksti?: LahdeTyyppiEhdotusKonteksti,
): LahdeTyyppi | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const polku = parsed.pathname.toLowerCase();
  const koko = `${host}${polku}`;

  if (onMenetelma(host)) return "menetelma";
  if (onRekisteri(host, polku, koko)) return "rekisteri";
  if (onMedia(host)) return "media";
  if (onViranomaisasiakirja(host, polku, koko)) return "viranomaisasiakirja";
  if (onHankkeenOma(host, konteksti?.toimijaTunnukset)) return "hankkeen_oma";
  if (onKoostepalvelu(host)) return "muu";

  return null;
}

/**
 * Tietokannan lahde_tyyppi + domain-ehdotus (vain laskentaan, ei kirjoita tietokantaan).
 * Kun dokumentti on edelleen oletus muu, käytetään domain-sääntöä.
 */
export function tehokasLahdeTyyppi(
  tietokantaTyyppi: LahdeTyyppi,
  url: string,
  konteksti?: LahdeTyyppiEhdotusKonteksti,
): LahdeTyyppi {
  if (tietokantaTyyppi !== "muu") return tietokantaTyyppi;
  return ehdotaLahdeTyyppiUrlille(url, konteksti) ?? "muu";
}

export function verkkoTunnusUrlista(url: string): string | null {
  return puraDomain(url);
}

export function verkkoTunnusOrganisaatiosta(verkkoOsoite: string | null | undefined): string | null {
  if (!verkkoOsoite?.trim()) return null;
  try {
    return new URL(verkkoOsoite.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** PRH YTJ website.url (usein ilman skhemata). */
export function verkkotunnusYtjWebsite(websiteUrl: string | null | undefined): string | null {
  const raw = websiteUrl?.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function organisaationVerkkoTunnukset(org: {
  verkkotunnus?: string | null;
  verkko_osoite?: string | null;
}): string[] {
  const tunnukset = new Set<string>();
  const t = org.verkkotunnus?.trim().toLowerCase();
  if (t) tunnukset.add(t);
  const osoite = verkkoTunnusOrganisaatiosta(org.verkko_osoite);
  if (osoite) tunnukset.add(osoite);
  return [...tunnukset];
}

function onHankkeenOma(host: string, tunnukset: readonly string[] | undefined): boolean {
  if (!tunnukset?.length) return false;
  return tunnukset.some(
    (t) => host === t || host.endsWith(`.${t}`),
  );
}

function onRekisteri(host: string, polku: string, koko: string): boolean {
  const rekisteriHostit = [
    "stat.fi",
    "tilastokeskus.fi",
    "fingrid.fi",
    "prh.fi",
    "ytj.fi",
    "mml.fi",
    "maanmittauslaitos.fi",
    "kartta.fi",
    "paikkatietoikkuna.fi",
    "avoindata.suomi.fi",
    "paikkatiedot.ymparisto.fi",
    "ryhti.syke.fi",
    "api.stat.fi",
  ];
  if (rekisteriHostit.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  if (host.includes("ryhti") || koko.includes("ryhti")) return true;
  if (host.includes("fingrid") && polku.includes("/api")) return true;
  return false;
}

/** Lehtidomainit, jotka esiintyvät rekisterin URL-datasta (ei yleistä lehtilistaa). */
const MEDIA_HOSTIT = [
  "yle.fi",
  "hs.fi",
  "is.fi",
  "iltalehti.fi",
  "mtvuutiset.fi",
  "kauppalehti.fi",
  "taloussanomat.fi",
  "turunsanomat.fi",
  "aamulehti.fi",
  "kaleva.fi",
  "savonsanomat.fi",
  "satakunnankansa.fi",
  "ts.fi",
  "stt.info",
  "stt.fi",
  "bloomberg.com",
  "reuters.com",
  "kangasalansanomat.fi",
  "pyhajarvensanomat.fi",
  "hameensanomat.fi",
  "kmvlehti.fi",
  "sipoonsanomat.fi",
  "valkeakoskensanomat.fi",
  "rakennuslehti.fi",
  "epressi.com",
  "erikoissanomat.fi",
  "haapavesi-lehti.fi",
  "janakkalansanomat.fi",
  "jarviseudunsanomat.fi",
  "kainuunsanomat.fi",
  "kauhajoki-lehti.fi",
  "kouvolansanomat.fi",
  "loviisansanomat.fi",
  "nokianuutiset.fi",
  "uudenkaupunginsanomat.fi",
  "warkaudenlehti.fi",
];

function onMedia(host: string): boolean {
  return MEDIA_HOSTIT.some((h) => host === h || host.endsWith(`.${h}`));
}

const MENETELMA_HOSTIT = ["nominatim.openstreetmap.org"];

function onMenetelma(host: string): boolean {
  return MENETELMA_HOSTIT.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Kolmannen osapuolen koosteet — eivät hankkeen_oma, vaan muu. */
const KOOSTEPALVELU_HOSTIT = [
  "datacentermap.com",
  "peeringdb.com",
  "wikipedia.org",
  "openstreetmap.org",
];

function onKoostepalvelu(host: string): boolean {
  return KOOSTEPALVELU_HOSTIT.some((h) => host === h || host.endsWith(`.${h}`));
}

export function onKoostepalveluUrl(url: string): boolean {
  const host = puraDomain(url);
  if (!host) return false;
  return onKoostepalvelu(host);
}

function onViranomaisasiakirja(host: string, polku: string, koko: string): boolean {
  if (host === "ymparisto.fi" || host.endsWith(".ymparisto.fi")) return true;
  if (host.includes("ymparisto.fi")) return true;

  const asianhallinta =
    host.includes("oncloudos.com") ||
    host.startsWith("dynasty.") ||
    host.includes("dynasty.") ||
    host.startsWith("paatokset.") ||
    host.includes("cloudia.fi") ||
    host.includes("casem") ||
    host.includes("tweb") ||
    host.includes("konsern") ||
    host.includes("asianhallinta") ||
    host.endsWith(".kunta.fi") ||
    polku.includes("drequest.php") ||
    polku.includes("esityslista") ||
    polku.includes("poytakirja") ||
    polku.includes("kuulutus") ||
    polku.includes("yva") ||
    koko.includes("yva-") ||
    koko.includes("/yva/");

  return asianhallinta;
}

export function puraDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
