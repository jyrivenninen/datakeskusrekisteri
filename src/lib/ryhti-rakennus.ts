/**
 * Ryhti rakennus- ja osoite-OGC (7A.5.1b). Kohdehaut, ei koko maan pakettia.
 * CC BY 4.0. sykeuserid URL-parametrina, ei tietueen lähde-URL:ssa.
 */

const JUURI =
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1";

const SYKE_USERID_OLETUS = "datakeskusrekisteri";

export const RYHTI_AINEISTOPAKETIT = {
  rakennukset: {
    csv: "https://paikkatiedot.ymparisto.fi/geoserver/www/open_building.csv.gz",
    json: "https://paikkatiedot.ymparisto.fi/geoserver/www/open_building.json.gz",
    gpkg: "https://paikkatiedot.ymparisto.fi/geoserver/www/open_building.gpkg.gz",
  },
  osoitteet: {
    csv: "https://paikkatiedot.ymparisto.fi/geoserver/www/open_address.csv.gz",
    json: "https://paikkatiedot.ymparisto.fi/geoserver/www/open_address.json.gz",
    gpkg: "https://paikkatiedot.ymparisto.fi/geoserver/www/open_address.gpkg.gz",
  },
} as const;

export type RyhtiOsoite = {
  address_key: string;
  building_key: string | null;
  address_fin: string;
  municipality_number: string | null;
  lat: number;
  lon: number;
  lahde_url: string;
};

type OgcKohde = {
  id?: string;
  geometry?: { coordinates?: number[] };
  properties?: Record<string, unknown>;
};

function sykeUserid(): string {
  return process.env.SYKE_RAJAPINTA_TUNNISTE?.trim() || SYKE_USERID_OLETUS;
}

function osoiteSykeTunnisteella(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("sykeuserid")) {
    u.searchParams.set("sykeuserid", sykeUserid());
  }
  return u.toString();
}

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const t = arvo.trim();
  return t === "" ? null : t;
}

function cqlMerkkijono(arvo: string): string {
  return arvo.replaceAll("'", "''");
}

function tietueUrl(kokoelma: string, kohdeId: string): string {
  return `${JUURI}/collections/${kokoelma}/items/${encodeURIComponent(kohdeId)}`;
}

function kohteetSivulta(runko: unknown): OgcKohde[] {
  if (!runko || typeof runko !== "object") return [];
  const sivu = runko as { type?: string; features?: OgcKohde[] };
  if (sivu.type === "Feature" && (runko as OgcKohde).id) {
    return [runko as OgcKohde];
  }
  return sivu.features ?? [];
}

function osoiteKohteesta(kohde: OgcKohde, kokoelma: string): RyhtiOsoite | null {
  const kohdeId = merkkijono(kohde.id)?.replace(/^open_address\./, "");
  const coords = kohde.geometry?.coordinates;
  if (!kohdeId || !coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = kohde.properties ?? {};
  const address_fin = merkkijono(p.address_fin);
  if (!address_fin) return null;
  return {
    address_key: merkkijono(p.address_key) ?? kohdeId,
    building_key: merkkijono(p.building_key),
    address_fin,
    municipality_number: merkkijono(p.municipality_number),
    lat,
    lon,
    lahde_url: tietueUrl(kokoelma, kohdeId),
  };
}

async function haeKokoelma(
  kokoelma: string,
  suodatin: string | null,
  limit: number,
): Promise<RyhtiOsoite[]> {
  const url = new URL(`${JUURI}/collections/${kokoelma}/items`);
  url.searchParams.set("limit", String(Math.min(limit, 50)));
  if (suodatin) {
    url.searchParams.set("filter-lang", "cql2-text");
    url.searchParams.set("filter", suodatin);
  }
  const vastaus = await fetch(osoiteSykeTunnisteella(url.toString()), {
    headers: { Accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(45_000),
    next: { revalidate: 86400 },
  });
  if (!vastaus.ok) return [];
  const runko = (await vastaus.json()) as unknown;
  return kohteetSivulta(runko)
    .map((k) => osoiteKohteesta(k, kokoelma))
    .filter((r): r is RyhtiOsoite => r != null);
}

/** Hakee osoitteita tekstillä (vähintään 4 merkkiä). */
export async function haeRyhtiOsoitteetTekstilla(
  teksti: string,
  kuntaKoodi?: string | null,
  limit = 5,
): Promise<RyhtiOsoite[]> {
  const hakusana = teksti.trim();
  if (hakusana.length < 4) return [];

  const osat: string[] = [];
  const s = cqlMerkkijono(hakusana.toLowerCase());
  osat.push(`strToLowerCase(address_fin) like '%${s}%'`);
  if (kuntaKoodi) {
    const k = cqlMerkkijono(kuntaKoodi.replace(/^0+/, "") || "0");
    const pad = cqlMerkkijono(kuntaKoodi.padStart(3, "0"));
    osat.push(`(municipality_number = '${k}' or municipality_number = '${pad}')`);
  }
  const suodatin =
    kuntaKoodi && osat.length > 1
      ? `(${osat[0]}) and (${osat.slice(1).join(" or ")})`
      : osat[0];

  return haeKokoelma("open_address", suodatin, limit);
}

/** Palauttaa lähimmän Ryhti-osoitteen annetuille koordinaateille (kuntasuodatin). */
export async function haeRyhtiOsoiteLahella(
  lat: number,
  lon: number,
  kuntaKoodi: string | null,
  maxEtaisyysM = 500,
): Promise<RyhtiOsoite | null> {
  if (!kuntaKoodi) return null;
  const k = kuntaKoodi.replace(/^0+/, "") || "0";
  const pad = kuntaKoodi.padStart(3, "0");
  const suodatin = `(municipality_number = '${cqlMerkkijono(k)}' or municipality_number = '${cqlMerkkijono(pad)}')`;
  const osumat = await haeKokoelma("open_address", suodatin, 50);
  if (osumat.length === 0) return null;

  let paras: RyhtiOsoite | null = null;
  let parasEtaisyys = Infinity;
  for (const osuma of osumat) {
    const d = etaisyysMetreina(lat, lon, osuma.lat, osuma.lon);
    if (d <= maxEtaisyysM && d < parasEtaisyys) {
      paras = osuma;
      parasEtaisyys = d;
    }
  }
  return paras;
}

function etaisyysMetreina(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000;
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
