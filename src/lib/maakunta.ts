/** Maakuntarajat: Tilastokeskus WFS tilastointialueet:maakunta4500k, CC BY 4.0. */

import type { FeatureCollection } from "geojson";
import maakunnatRaw from "@/data/maakunnat.json";

export const MAAKUNTA_RAJAT_URL = "/geo/maakunnat.geojson";
export const MAAKUNTA_RAJAT_LAHDE_URL =
  "https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:maakunta4500k&outputFormat=application/json&srsName=urn:ogc:def:crs:EPSG::4326";
export const MAAKUNTA_RAJAT_LAHDE_NIMI = "Tilastokeskus, maakuntarajat (1:4 500 000)";

/** Bundlattu WGS84-rajadata — MapLibre-kerros ei riipu erillisestä fetchistä. */
export const MAAKUNTA_POHJA_GEO: FeatureCollection = {
  type: "FeatureCollection",
  features: (maakunnatRaw as unknown as FeatureCollection).features,
};

export type MaakuntaYhteenveto = {
  nimi: string;
  hankkeetLkm: number;
  tehoMw: number;
  tehoLkm: number;
  /** Sähkönkäytön alaraja (TWh/a), VE-minimien summa. */
  sahkonkayttoTwhMin: number;
  /** Sähkönkäytön yläraja (TWh/a), VE-maksimien summa. */
  sahkonkayttoTwhMax: number;
  sahkonkayttoLkm: number;
};

export type MaakuntaTila = "hankkeet" | "it_teho" | "sahkonkaytto";

export type MaakuntaRatkaistu = {
  maakunta: string | null;
  lahde: "hanke" | "kunta" | null;
};

/** Vertailu kuntanimeille (Syke-koodisto vs. hankkeet.kunta). */
export function normalisoiKuntaNimi(nimi: string): string {
  return nimi.trim().toLocaleLowerCase("fi");
}

export function ratkaiseMaakunta(
  hankeMaakunta: string | null | undefined,
  kunta: string,
  kuntaMaakunnat: ReadonlyMap<string, string>,
): MaakuntaRatkaistu {
  const merkitty = hankeMaakunta?.trim();
  if (merkitty) return { maakunta: merkitty, lahde: "hanke" };
  const johdettu = kuntaMaakunnat.get(normalisoiKuntaNimi(kunta))?.trim();
  if (johdettu) return { maakunta: johdettu, lahde: "kunta" };
  return { maakunta: null, lahde: null };
}

export function laskeMaakuntaYhteenvedot(
  merkit: ReadonlyArray<{
    maakunta?: string | null;
    tehoMw?: number | null;
    sahkonkayttoTwhMin?: number | null;
    sahkonkayttoTwhMax?: number | null;
  }>,
): MaakuntaYhteenveto[] {
  const kartta = new Map<string, MaakuntaYhteenveto>();
  for (const merkki of merkit) {
    const nimi = merkki.maakunta?.trim();
    if (!nimi) continue;
    const nykyinen = kartta.get(nimi) ?? {
      nimi,
      hankkeetLkm: 0,
      tehoMw: 0,
      tehoLkm: 0,
      sahkonkayttoTwhMin: 0,
      sahkonkayttoTwhMax: 0,
      sahkonkayttoLkm: 0,
    };
    nykyinen.hankkeetLkm += 1;
    if (merkki.tehoMw != null && merkki.tehoMw > 0) {
      nykyinen.tehoMw += merkki.tehoMw;
      nykyinen.tehoLkm += 1;
    }
    const sahkoMin = merkki.sahkonkayttoTwhMin;
    const sahkoMax = merkki.sahkonkayttoTwhMax;
    if (
      sahkoMin != null &&
      sahkoMax != null &&
      Number.isFinite(sahkoMin) &&
      Number.isFinite(sahkoMax)
    ) {
      nykyinen.sahkonkayttoTwhMin += sahkoMin;
      nykyinen.sahkonkayttoTwhMax += sahkoMax;
      nykyinen.sahkonkayttoLkm += 1;
    }
    kartta.set(nimi, nykyinen);
  }
  return [...kartta.values()].sort((a, b) => {
    if (b.tehoMw !== a.tehoMw) return b.tehoMw - a.tehoMw;
    return a.nimi.localeCompare(b.nimi, "fi");
  });
}

/** Valittujen karttamerkkien sähkönkäyttö yhteensä (TWh/a). */
export function laskeSahkoYhteenveto(
  merkit: ReadonlyArray<{
    sahkonkayttoTwhMin?: number | null;
    sahkonkayttoTwhMax?: number | null;
  }>,
): { min: number; max: number; merkittyLkm: number; kaikkiLkm: number } {
  let min = 0;
  let max = 0;
  let merkittyLkm = 0;
  for (const merkki of merkit) {
    const a = merkki.sahkonkayttoTwhMin;
    const b = merkki.sahkonkayttoTwhMax;
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    min += a;
    max += b;
    merkittyLkm += 1;
  }
  return { min, max, merkittyLkm, kaikkiLkm: merkit.length };
}
