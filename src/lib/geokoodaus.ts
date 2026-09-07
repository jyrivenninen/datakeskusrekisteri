/**
 * MML avoin geokoodaus (suora haku). Sama avain kuin kartassa.
 * https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search
 */
const JUURI = "https://avoin-paikkatieto.maanmittauslaitos.fi";

type PeliasKohde = {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
};

type PeliasSivu = {
  features?: PeliasKohde[];
};

function mmlAvain(): string {
  const avain =
    process.env.MML_API_AVAIN?.trim() ||
    process.env.NEXT_PUBLIC_MML_API_AVAIN?.trim() ||
    "";
  if (!avain) {
    throw new Error(
      "MML_API_AVAIN tai NEXT_PUBLIC_MML_API_AVAIN tarvitaan geokoodaukseen.",
    );
  }
  return avain;
}

function basicAuth(avain: string): string {
  return `Basic ${Buffer.from(`${avain}:`, "utf8").toString("base64")}`;
}

export type GeokoodausTulos = {
  lat: number;
  lon: number;
  /** Pysyvä viite alkuperäiseen geokoodauspyyntöön (ei avainta URL:ssa). */
  lahde_url: string;
  label: string | null;
};

/** Tarkistaa onko arvo GeoJSON Polygon -objekti. */
export function onSijaintiAluePolygon(arvo: unknown): boolean {
  return (
    arvo != null &&
    typeof arvo === "object" &&
    !Array.isArray(arvo) &&
    (arvo as { type?: string }).type === "Polygon"
  );
}

/** Geokoodaa osoiteteksti koordinaateiksi MML Pelias-hakua käyttäen. */
export async function geokoodaaOsoite(teksti: string): Promise<GeokoodausTulos> {
  const hakusana = teksti.trim();
  if (hakusana.length < 3) {
    throw new Error("Geokoodattava osoite on liian lyhyt.");
  }

  const avain = mmlAvain();
  const url = new URL(`${JUURI}/geocoding/v2/pelias/search`);
  url.searchParams.set("text", hakusana);
  url.searchParams.set("lang", "fi");
  url.searchParams.set("size", "1");

  const vastaus = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(avain),
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!vastaus.ok) {
    throw new Error(`MML-geokoodaus epäonnistui (HTTP ${vastaus.status}).`);
  }

  const sivu = (await vastaus.json()) as PeliasSivu;
  const kohde = (sivu.features ?? [])[0];
  const coords = kohde?.geometry?.coordinates;
  if (!coords || coords.length < 2) {
    throw new Error(`Osoitteelle "${hakusana}" ei löytynyt koordinaatteja.`);
  }

  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Geokoodauksen koordinaatit ovat virheelliset: ${hakusana}`);
  }

  const label =
    typeof kohde?.properties?.label === "string"
      ? kohde.properties.label
      : typeof kohde?.properties?.name === "string"
        ? kohde.properties.name
        : null;

  const lahdeUrl = new URL(`${JUURI}/geocoding/v2/pelias/search`);
  lahdeUrl.searchParams.set("text", hakusana);
  lahdeUrl.searchParams.set("lang", "fi");
  lahdeUrl.searchParams.set("size", "1");

  return { lat, lon, lahde_url: lahdeUrl.toString(), label };
}
