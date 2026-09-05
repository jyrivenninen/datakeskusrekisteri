/** Maakuntarajat: Tilastokeskus WFS tilastointialueet:maakunta4500k, CC BY 4.0. */

export const MAAKUNTA_RAJAT_URL = "/geo/maakunnat.geojson";
export const MAAKUNTA_RAJAT_LAHDE_URL =
  "https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:maakunta4500k&outputFormat=application/json";
export const MAAKUNTA_RAJAT_LAHDE_NIMI = "Tilastokeskus, maakuntarajat (1:4 500 000)";

export type MaakuntaYhteenveto = {
  nimi: string;
  hankkeetLkm: number;
  tehoMw: number;
  tehoLkm: number;
};

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
  merkit: ReadonlyArray<{ maakunta?: string | null; tehoMw?: number | null }>,
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
    };
    nykyinen.hankkeetLkm += 1;
    if (merkki.tehoMw != null && merkki.tehoMw > 0) {
      nykyinen.tehoMw += merkki.tehoMw;
      nykyinen.tehoLkm += 1;
    }
    kartta.set(nimi, nykyinen);
  }
  return [...kartta.values()].sort((a, b) => {
    if (b.tehoMw !== a.tehoMw) return b.tehoMw - a.tehoMw;
    return a.nimi.localeCompare(b.nimi, "fi");
  });
}
