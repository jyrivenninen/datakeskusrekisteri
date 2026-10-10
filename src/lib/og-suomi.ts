/** Manner-Suomen rantaviiva, [pituusaste, leveysaste]. Karkeistus jaettavaa kuvaa varten. */
export const SUOMI_RANTA: ReadonlyArray<readonly [number, number]> = [
  [22.9, 59.78],
  [23.6, 59.95],
  [24.4, 60.1],
  [25.2, 60.15],
  [26.1, 60.28],
  [26.9, 60.45],
  [27.6, 60.52],
  [28.4, 60.7],
  [29.2, 61.3],
  [30.0, 61.95],
  [31.0, 62.6],
  [31.5, 63.3],
  [30.6, 64.1],
  [30.0, 64.9],
  [29.6, 65.7],
  [29.2, 66.5],
  [28.5, 67.3],
  [27.6, 68.1],
  [26.6, 68.8],
  [25.8, 69.45],
  [25.2, 69.95],
  [24.3, 70.05],
  [23.3, 69.45],
  [22.7, 68.55],
  [23.3, 67.5],
  [24.1, 66.45],
  [24.6, 65.75],
  [25.4, 65.05],
  [24.8, 64.2],
  [23.4, 63.55],
  [21.7, 63.1],
  [21.3, 62.25],
  [21.4, 61.5],
  [21.8, 60.85],
  [22.2, 60.4],
  [22.5, 60.05],
];

export type OgKarttapiste = { lon: number; lat: number };

type Kehys = {
  minLon: number;
  maxLat: number;
  x0: number;
  y0: number;
  aste: number;
  lonMittakaava: number;
};

function kehys(leveys: number, korkeus: number, reunus: number): Kehys {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of SUOMI_RANTA) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const keskiLeveys = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonMittakaava = Math.cos(keskiLeveys);
  const lonVali = (maxLon - minLon) * lonMittakaava;
  const latVali = maxLat - minLat;
  const sisusLeveys = Math.max(leveys - reunus * 2, 1);
  const sisusKorkeus = Math.max(korkeus - reunus * 2, 1);
  const aste = Math.min(sisusLeveys / lonVali, sisusKorkeus / latVali);
  const piirtoLeveys = lonVali * aste;
  const piirtoKorkeus = latVali * aste;
  return {
    minLon,
    maxLat,
    x0: (leveys - piirtoLeveys) / 2,
    y0: (korkeus - piirtoKorkeus) / 2,
    aste,
    lonMittakaava,
  };
}

export function projisoiKartta(
  lon: number,
  lat: number,
  leveys: number,
  korkeus: number,
  reunus = 12,
): { x: number; y: number } {
  const k = kehys(leveys, korkeus, reunus);
  return {
    x: k.x0 + (lon - k.minLon) * k.lonMittakaava * k.aste,
    y: k.y0 + (k.maxLat - lat) * k.aste,
  };
}

export function suomiPolku(leveys: number, korkeus: number): string {
  const osat = SUOMI_RANTA.map(([lon, lat], i) => {
    const { x, y } = projisoiKartta(lon, lat, leveys, korkeus);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `${osat.join(" ")} Z`;
}

export function karttapisteNakyy(lat: number, lon: number): boolean {
  return lat >= 59 && lat <= 70.5 && lon >= 19 && lon <= 32.5;
}
