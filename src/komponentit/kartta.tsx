"use client";

import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MapLibre,
  Marker,
  NavigationControl,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  laskeJohdonmukaisuus,
} from "@/lib/sahko-johdonmukaisuus";
import { KattavuusHankkeita } from "@/komponentit/kattavuus-teksti";
import {
  ENERGIA_MAAKUNTA_TUOTANTO,
  haeMaakuntaSahkontuotantoTwh,
  laskeMaakuntaTuotantoRivit,
  type MaakuntaTuotantoRivi,
} from "@/lib/energiateollisuus-tuotanto";
import {
  laskeMaakuntaYhteenvedot,
  laskeSahkoYhteenveto,
  MAAKUNTA_POHJA_GEO,
  MAAKUNTA_RAJAT_LAHDE_NIMI,
  MAAKUNTA_RAJAT_LAHDE_URL,
  type MaakuntaTila,
  type MaakuntaYhteenveto,
} from "@/lib/maakunta";
import type { FingridLiityntapiste } from "@/lib/fingrid-liityntapisteet";
import { muotoileLuku, muotoileVaihtelvali, VAIHE_NIMET, VAIHE_VARIT } from "@/lib/naytto";
import { HANKE_VAIHEET, type HankeVaihe, type SijaintiAlue, type SijaintiViiva } from "@/lib/supabase/tietokanta";

export type Karttamerkki = {
  id: string;
  nimi: string;
  vaihe?: HankeVaihe;
  lat?: number;
  lon?: number;
  /** IT-teho tai fallback kokonaisteho (MW); halo piirretään vain jos > 0. */
  tehoMw?: number | null;
  /** VE-minimi sähkönkäytöstä (TWh/a), jos lähde antaa vaihteluvälin. */
  sahkonkayttoTwhMin?: number | null;
  /** VE-maksimi sähkönkäytöstä (TWh/a). */
  sahkonkayttoTwhMax?: number | null;
  /** Maakunta hankkeen kentästä tai kunnan koodistosta. */
  maakunta?: string | null;
  alue?: SijaintiAlue | null;
  johdot?: { id: string; reitti: SijaintiViiva }[];
};

/** Keltainen → amber → oranssi tehoasteikko. */
const TEHO_VARI_PYSAKIT: [number, string][] = [
  [1, "#fef9c3"],
  [30, "#fde047"],
  [100, "#fbbf24"],
  [300, "#f59e0b"],
  [1000, "#ea580c"],
];

const TEHO_SADE_PYSAKIT: [number, number][] = [
  [1, 8],
  [10, 14],
  [50, 22],
  [100, 32],
  [500, 50],
  [1000, 68],
];

const TEHO_ZOOM_PYSAKIT: [number, number][] = [
  [4, 0.45],
  [8, 0.9],
  [12, 1.55],
  [16, 2.4],
];

const TEHO_PEITTO_PYSAKIT: [number, number][] = [
  [1, 0.32],
  [50, 0.4],
  [100, 0.46],
  [500, 0.52],
  [1000, 0.56],
];

const OLETUSVARI = "#1d4ed8";

/** Zoom, josta nuppineula korvaa piste-merkin (sama kuin alueiden näyttöraja). */
const NUPPINEULA_ZOOM_MIN = 9;

/** Piste skaalautuu zoomin mukaan (px), jotta se ei katoa teho-halojen alle. */
const PISTE_KOKO_PYSAKIT: [number, number][] = [
  [4, 10],
  [6, 12],
  [8, 16],
  [8.9, 18],
];

/** Manner-Suomi ja Ahvenanmaa, hieman reunusta. */
const SUOMI_RAJAT: [[number, number], [number, number]] = [
  [19.08, 59.45],
  [31.59, 70.09],
];

/** Taustakartan meren sävy laattojen ulkopuolelle. */
const KARTTA_TAYTTO = "#d2e7f0";

function vaiheVari(vaihe?: HankeVaihe): string {
  return vaihe ? VAIHE_VARIT[vaihe] : OLETUSVARI;
}

function variAlueeksi(hex: string, peitto: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(30, 58, 138, ${peitto})`;
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${peitto})`;
}

function parsiAlue(arvo: unknown): SijaintiAlue | null {
  let data = arvo;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (
    data &&
    typeof data === "object" &&
    (data as SijaintiAlue).type === "Polygon" &&
    Array.isArray((data as SijaintiAlue).coordinates)
  ) {
    return data as SijaintiAlue;
  }
  return null;
}

/** Sininen–violetti: erottuu kelta-oranssista IT-teho-halosta. */
const MAAKUNTA_TEHO_VARI_PYSAKIT: [number, string][] = [
  [0, "#f1f5f9"],
  [1, "#dbeafe"],
  [30, "#93c5fd"],
  [100, "#6366f1"],
  [300, "#8b5cf6"],
  [1000, "#5b21b6"],
];

/** Indigo: hankkeiden lukumäärä maakunnassa. */
const MAAKUNTA_LKM_VARI_PYSAKIT: [number, string][] = [
  [0, "#f8fafc"],
  [1, "#e0e7ff"],
  [3, "#c7d2fe"],
  [8, "#818cf8"],
  [15, "#6366f1"],
  [30, "#4338ca"],
];

/** Vihreä: sähkönkäytön summa (TWh/a) maakunnassa. */
const MAAKUNTA_SAHKO_VARI_PYSAKIT: [number, string][] = [
  [0, "#f0fdf4"],
  [0.05, "#bbf7d0"],
  [0.2, "#4ade80"],
  [0.5, "#16a34a"],
  [2, "#15803d"],
  [10, "#14532d"],
];

/** Oranssi: maakunnan nettosähköntuotanto (TWh/a, Energiateollisuus). */
const MAAKUNTA_TUOTANTO_VARI_PYSAKIT: [number, string][] = [
  [0, "#fff7ed"],
  [0.2, "#fed7aa"],
  [1, "#fdba74"],
  [5, "#fb923c"],
  [15, "#ea580c"],
  [30, "#9a3412"],
];

const MAAKUNTA_TILA_JARJESTYS = [
  "hankkeet",
  "it_teho",
  "sahkonkaytto",
  "sahkontuotanto",
] as const satisfies readonly MaakuntaTila[];

const MAAKUNTA_TILA_SELITE: Record<
  MaakuntaTila,
  { otsikko: string; kuvaus: string; gradient: string; min: string; max: string }
> = {
  hankkeet: {
    otsikko: "Hankkeet",
    kuvaus: "Maakunnan väri = valittujen vaiheiden hankkeiden lukumäärä. Keltainen halo = IT-teho pisteessä.",
    gradient: "linear-gradient(to right, #e0e7ff, #c7d2fe, #818cf8, #6366f1, #4338ca)",
    min: "0",
    max: "30+",
  },
  it_teho: {
    otsikko: "IT-teho yhteensä",
    kuvaus: "Maakunnan väri = valittujen hankkeiden IT-teho tai kokonaisteho (MW) yhteensä. Keltainen halo = saman hankkeen teho pisteessä.",
    gradient: "linear-gradient(to right, #dbeafe, #93c5fd, #6366f1, #8b5cf6, #5b21b6)",
    min: "0 MW",
    max: "1000+ MW",
  },
  sahkonkaytto: {
    otsikko: "Sähkönkäyttö",
    kuvaus: "Maakunnan väri = valittujen hankkeiden sähkönkäytön alaraja (TWh/a) yhteensä, jos lähde antaa arvon. Keltainen halo = IT-teho (MW).",
    gradient: "linear-gradient(to right, #bbf7d0, #4ade80, #16a34a, #15803d, #14532d)",
    min: "0",
    max: "10+ TWh/a",
  },
  sahkontuotanto: {
    otsikko: "Sähköntuotanto",
    kuvaus: `Maakunnan väri = nettosähköntuotanto (TWh/a), ${ENERGIA_MAAKUNTA_TUOTANTO.vuosi}. Voimalaitosten sijainti määrää maakunnan — ei kulutusta. Keltainen halo = hankkeiden IT-teho.`,
    gradient: "linear-gradient(to right, #fed7aa, #fdba74, #fb923c, #ea580c, #9a3412)",
    min: "0",
    max: "30+ TWh/a",
  },
};

function jarjestaMaakunnat(
  yhteenvedot: MaakuntaYhteenveto[],
  tila: MaakuntaTila,
): MaakuntaYhteenveto[] {
  return [...yhteenvedot].sort((a, b) => {
    const avain =
      tila === "hankkeet"
        ? "hankkeetLkm"
        : tila === "it_teho"
          ? "tehoMw"
          : "sahkonkayttoTwhMin";
    if (b[avain] !== a[avain]) return b[avain] - a[avain];
    return a.nimi.localeCompare(b.nimi, "fi");
  });
}

function muotoileMaakuntaArvo(yhteenveto: MaakuntaYhteenveto, tila: MaakuntaTila): string {
  if (tila === "hankkeet") {
    return `${yhteenveto.hankkeetLkm} hanketta`;
  }
  if (tila === "it_teho") {
    return `${new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 }).format(yhteenveto.tehoMw)} MW (${yhteenveto.tehoLkm}/${yhteenveto.hankkeetLkm})`;
  }
  if (yhteenveto.sahkonkayttoLkm === 0) {
    return `— (${yhteenveto.hankkeetLkm})`;
  }
  return `${muotoileVaihtelvali(yhteenveto.sahkonkayttoTwhMin, yhteenveto.sahkonkayttoTwhMax, "TWh/a")} (${yhteenveto.sahkonkayttoLkm}/${yhteenveto.hankkeetLkm})`;
}

function muotoileTuotantoRivi(rivi: MaakuntaTuotantoRivi): string {
  const tuotanto = `${muotoileLuku(rivi.sahkontuotantoTwh)} TWh/a`;
  if (rivi.sahkonkayttoLkm === 0) return tuotanto;
  return `${tuotanto} (hank. ${muotoileVaihtelvali(rivi.sahkonkayttoTwhMin, rivi.sahkonkayttoTwhMax, "TWh/a")})`;
}

function muotoileJohdonmukaisuusTeksti(merkki: Karttamerkki): string {
  const t = laskeJohdonmukaisuus(
    merkki.tehoMw,
    merkki.sahkonkayttoTwhMin,
    merkki.sahkonkayttoTwhMax,
  );
  if (t.itTehoMw == null || t.kulutusMwMin == null || t.kulutusMwMax == null) return "";
  return `IT ${muotoileLuku(t.itTehoMw)} MW · kulutus ${muotoileVaihtelvali(t.kulutusMwMin, t.kulutusMwMax, "MW")}`;
}

function taustakarttaTyyli(avain: string): StyleSpecification {
  return {
    version: 8,
    name: "MML taustakartta",
    sources: {
      taustakartta: {
        type: "raster",
        tiles: [
          `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/taustakartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${encodeURIComponent(avain)}`,
        ],
        tileSize: 256,
        attribution: "Maanmittauslaitos",
        maxzoom: 18,
      },
    },
    layers: [
      {
        id: "pohja",
        type: "background",
        paint: { "background-color": KARTTA_TAYTTO },
      },
      {
        id: "taustakartta",
        type: "raster",
        source: "taustakartta",
      },
    ],
  };
}

function parsiViiva(arvo: unknown): SijaintiViiva | null {
  let data = arvo;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (
    data &&
    typeof data === "object" &&
    ((data as SijaintiViiva).type === "LineString" ||
      (data as SijaintiViiva).type === "MultiLineString") &&
    Array.isArray((data as SijaintiViiva).coordinates)
  ) {
    return data as SijaintiViiva;
  }
  return null;
}

function viivanPisteet(viiva: SijaintiViiva): number[][] {
  if (viiva.type === "LineString") return viiva.coordinates as number[][];
  return (viiva.coordinates as number[][][]).flat();
}

function laajennaViivalla(rajat: LngLatBounds, viiva: SijaintiViiva) {
  for (const piste of viivanPisteet(viiva)) {
    if (piste.length >= 2) rajat.extend([piste[0], piste[1]]);
  }
}

function piirraViiva(kartta: MapLibre, svg: SVGSVGElement, viiva: SijaintiViiva) {
  const osat: number[][][] =
    viiva.type === "LineString"
      ? [viiva.coordinates as number[][]]
      : (viiva.coordinates as number[][][]);
  for (const viivaOsa of osat) {
    if (viivaOsa.length < 2) continue;
    const d = viivaOsa.map((piste, i) => {
      const xy = kartta.project([piste[0], piste[1]]);
      return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
    });
    const polku = document.createElementNS("http://www.w3.org/2000/svg", "path");
    polku.setAttribute("d", d.join(" "));
    polku.setAttribute("fill", "none");
    polku.setAttribute("stroke", "#0f766e");
    polku.setAttribute("stroke-width", "3");
    polku.setAttribute("stroke-dasharray", "8 5");
    svg.appendChild(polku);
  }
}
function laajennaAlueella(rajat: LngLatBounds, alue: SijaintiAlue) {
  for (const rengas of alue.coordinates) {
    for (const piste of rengas) {
      if (piste.length >= 2) rajat.extend([piste[0], piste[1]]);
    }
  }
}

function merkinKeskipiste(merkki: Karttamerkki): { lon: number; lat: number } | null {
  if (merkki.lat != null && merkki.lon != null) {
    return { lat: merkki.lat, lon: merkki.lon };
  }
  const alue = parsiAlue(merkki.alue);
  return alue ? alueenKeskipiste(alue) : null;
}

function interpoloiLuku(pysakit: [number, number][], arvo: number): number {
  if (pysakit.length === 0) return 0;
  if (arvo <= pysakit[0][0]) return pysakit[0][1];
  for (let i = 1; i < pysakit.length; i++) {
    const [x0, y0] = pysakit[i - 1];
    const [x1, y1] = pysakit[i];
    if (arvo <= x1) {
      const t = (arvo - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return pysakit[pysakit.length - 1][1];
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

function interpoloiVari(pysakit: [number, string][], arvo: number): string {
  if (pysakit.length === 0) return "#fde047";
  if (arvo <= pysakit[0][0]) return pysakit[0][1];
  for (let i = 1; i < pysakit.length; i++) {
    const [x0, c0] = pysakit[i - 1];
    const [x1, c1] = pysakit[i];
    if (arvo <= x1) {
      const t = (arvo - x0) / (x1 - x0);
      const [r0, g0, b0] = hexRgb(c0);
      const [r1, g1, b1] = hexRgb(c1);
      return rgbHex(r0 + t * (r1 - r0), g0 + t * (g1 - g0), b0 + t * (b1 - b0));
    }
  }
  return pysakit[pysakit.length - 1][1];
}

function tehoSadePx(tehoMw: number, zoom: number): number {
  return interpoloiLuku(TEHO_SADE_PYSAKIT, tehoMw) * interpoloiLuku(TEHO_ZOOM_PYSAKIT, zoom);
}

function lisaaTehoSuodatin(svg: SVGSVGElement) {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const suodatin = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  suodatin.setAttribute("id", "teho-sumu");
  suodatin.setAttribute("x", "-50%");
  suodatin.setAttribute("y", "-50%");
  suodatin.setAttribute("width", "200%");
  suodatin.setAttribute("height", "200%");
  const sumu = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
  sumu.setAttribute("stdDeviation", "6");
  suodatin.appendChild(sumu);
  defs.appendChild(suodatin);
  svg.appendChild(defs);
}

function piirraTehoHalot(kartta: MapLibre, svg: SVGSVGElement, merkit: Karttamerkki[]) {
  const zoom = kartta.getZoom();
  for (const merkki of merkit) {
    if (merkki.tehoMw == null || merkki.tehoMw <= 0) continue;
    const keskipiste = merkinKeskipiste(merkki);
    if (!keskipiste) continue;
    const xy = kartta.project([keskipiste.lon, keskipiste.lat]);
    const sade = tehoSadePx(merkki.tehoMw, zoom);
    const ympyra = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ympyra.setAttribute("cx", xy.x.toFixed(1));
    ympyra.setAttribute("cy", xy.y.toFixed(1));
    ympyra.setAttribute("r", sade.toFixed(1));
    ympyra.setAttribute("fill", interpoloiVari(TEHO_VARI_PYSAKIT, merkki.tehoMw));
    ympyra.setAttribute("fill-opacity", interpoloiLuku(TEHO_PEITTO_PYSAKIT, merkki.tehoMw).toFixed(2));
    ympyra.setAttribute("filter", "url(#teho-sumu)");
    svg.appendChild(ympyra);
  }
}

function merkkiNakyvissa(merkki: Pick<Karttamerkki, "vaihe">, aktiviset: Set<HankeVaihe>): boolean {
  if (!merkki.vaihe) return aktiviset.size > 0;
  return aktiviset.has(merkki.vaihe);
}

function suodataMerkit(merkit: Karttamerkki[], aktiviset: Set<HankeVaihe>): Karttamerkki[] {
  return merkit.filter((merkki) => merkkiNakyvissa(merkki, aktiviset));
}

function yhdistaMaakuntaGeo(
  pohja: FeatureCollection,
  yhteenvedot: MaakuntaYhteenveto[],
): FeatureCollection {
  const tehot = new Map(yhteenvedot.map((yhteenveto) => [yhteenveto.nimi, yhteenveto]));
  return {
    ...pohja,
    features: pohja.features.map((feature) => {
      const nimi = String(feature.properties?.nimi ?? "");
      const yhteenveto = tehot.get(nimi);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          tehoMw: yhteenveto?.tehoMw ?? 0,
          hankkeetLkm: yhteenveto?.hankkeetLkm ?? 0,
          sahkonkayttoTwhMin: yhteenveto?.sahkonkayttoTwhMin ?? 0,
          sahkonkayttoLkm: yhteenveto?.sahkonkayttoLkm ?? 0,
          sahkontuotantoTwh: haeMaakuntaSahkontuotantoTwh(nimi) ?? 0,
        },
      };
    }),
  };
}

function piirraMaakuntaGeometria(
  kartta: MapLibre,
  svg: SVGSVGElement,
  geometry: Polygon | MultiPolygon,
  fill: string,
  fillOpacity: number,
  stroke?: string,
) {
  const polygonit =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  for (const polygon of polygonit) {
    for (const rengas of polygon) {
      if (rengas.length < 3) continue;
      const d =
        rengas
          .map((piste, i) => {
            const xy = kartta.project([piste[0], piste[1]]);
            return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
          })
          .join(" ") + " Z";
      const polku = document.createElementNS("http://www.w3.org/2000/svg", "path");
      polku.setAttribute("d", d);
      polku.setAttribute("fill", fill);
      polku.setAttribute("fill-opacity", fillOpacity.toFixed(2));
      if (stroke) {
        polku.setAttribute("stroke", stroke);
        polku.setAttribute("stroke-width", "1.2");
      }
      svg.appendChild(polku);
    }
  }
}

/** SVG-kerros: sama ajitus kuin teho-haloilla (piirretään paivitaNakyvyys-kutsussa). */
function piirraMaakuntaKerros(
  kartta: MapLibre,
  svg: SVGSVGElement,
  pohja: FeatureCollection,
  suodatetut: Karttamerkki[],
  nayta: boolean,
  tila: MaakuntaTila,
) {
  const kehys = kartta.getContainer();
  const leveys = kehys.clientWidth;
  const korkeus = kehys.clientHeight;
  svg.setAttribute("width", String(leveys));
  svg.setAttribute("height", String(korkeus));
  svg.setAttribute("viewBox", `0 0 ${leveys} ${korkeus}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!nayta) return;

  const data = yhdistaMaakuntaGeo(pohja, laskeMaakuntaYhteenvedot(suodatetut));

  for (const feature of data.features) {
    const geom = feature.geometry;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;
    let vari = "#f8fafc";
    let peitto = 0.06;
    if (tila === "hankkeet") {
      const lkm = Number(feature.properties?.hankkeetLkm ?? 0);
      vari = interpoloiVari(MAAKUNTA_LKM_VARI_PYSAKIT, lkm);
      peitto = lkm > 0 ? 0.5 : 0.06;
    } else if (tila === "it_teho") {
      const tehoMw = Number(feature.properties?.tehoMw ?? 0);
      vari = interpoloiVari(MAAKUNTA_TEHO_VARI_PYSAKIT, tehoMw);
      peitto = tehoMw > 0 ? 0.55 : 0.06;
    } else if (tila === "sahkonkaytto") {
      const twh = Number(feature.properties?.sahkonkayttoTwhMin ?? 0);
      vari = interpoloiVari(MAAKUNTA_SAHKO_VARI_PYSAKIT, twh);
      peitto = twh > 0 ? 0.5 : 0.06;
    } else {
      const twh = Number(feature.properties?.sahkontuotantoTwh ?? 0);
      vari = interpoloiVari(MAAKUNTA_TUOTANTO_VARI_PYSAKIT, twh);
      peitto = twh > 0 ? 0.52 : 0.06;
    }
    piirraMaakuntaGeometria(kartta, svg, geom, vari, peitto, "#334155");
  }
}

function kaikkiVaiheetAktiviset(): Set<HankeVaihe> {
  return new Set(HANKE_VAIHEET);
}

function alueenKeskipiste(alue: SijaintiAlue): { lon: number; lat: number } | null {
  const rengas = alue.coordinates[0];
  if (!rengas || rengas.length < 3) return null;
  let summaLon = 0;
  let summaLat = 0;
  let lkm = 0;
  for (const piste of rengas) {
    if (piste.length < 2) continue;
    summaLon += piste[0];
    summaLat += piste[1];
    lkm += 1;
  }
  if (lkm === 0) return null;
  return { lon: summaLon / lkm, lat: summaLat / lkm };
}

function luoKarttamerkki(merkki: Karttamerkki) {
  const el = document.createElement("a");
  el.href = `/hankkeet/${merkki.id}`;
  el.className = "kartta-merkki kartta-merkki--piste";
  const vaihenimi = merkki.vaihe ? VAIHE_NIMET[merkki.vaihe] : null;
  el.setAttribute("aria-label", vaihenimi ? `${merkki.nimi}, ${vaihenimi}` : merkki.nimi);

  const piste = document.createElement("span");
  piste.className = "kartta-merkki-piste";
  piste.setAttribute("aria-hidden", "true");
  piste.style.backgroundColor = vaiheVari(merkki.vaihe);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "kartta-merkki-nuppineula");
  svg.setAttribute("viewBox", "0 0 28 40");
  svg.setAttribute("width", "28");
  svg.setAttribute("height", "40");
  svg.setAttribute("aria-hidden", "true");

  const tausta = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tausta.setAttribute(
    "d",
    "M14 1.5c-6.4 0-11.5 5-11.5 11.2 0 8.6 11.5 25.3 11.5 25.3s11.5-16.7 11.5-25.3C25.5 6.5 20.4 1.5 14 1.5z",
  );
  tausta.setAttribute("fill", vaiheVari(merkki.vaihe));
  tausta.setAttribute("stroke", "#fff");
  tausta.setAttribute("stroke-width", "2");

  const keskus = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  keskus.setAttribute("cx", "14");
  keskus.setAttribute("cy", "12.2");
  keskus.setAttribute("r", "4.2");
  keskus.setAttribute("fill", "#fff");

  svg.appendChild(tausta);
  svg.appendChild(keskus);
  el.appendChild(piste);
  el.appendChild(svg);
  return el;
}

function paivitaMerkkiTyyppi(elementti: HTMLElement, zoom: number) {
  const nuppineula = zoom >= NUPPINEULA_ZOOM_MIN;
  elementti.classList.toggle("kartta-merkki--nuppineula", nuppineula);
  elementti.classList.toggle("kartta-merkki--piste", !nuppineula);
  const piste = elementti.querySelector<HTMLElement>(".kartta-merkki-piste");
  if (piste && !nuppineula) {
    const koko = interpoloiLuku(PISTE_KOKO_PYSAKIT, zoom);
    piste.style.setProperty("--piste-koko", `${koko}px`);
  }
}

function piirraJohdonmukaisuusRenkaat(
  kartta: MapLibre,
  svg: SVGSVGElement,
  merkit: Karttamerkki[],
) {
  const zoom = kartta.getZoom();
  for (const merkki of merkit) {
    const tarkistus = laskeJohdonmukaisuus(
      merkki.tehoMw,
      merkki.sahkonkayttoTwhMin,
      merkki.sahkonkayttoTwhMax,
    );
    if (tarkistus.tila !== "tarkista") continue;
    const keskipiste = merkinKeskipiste(merkki);
    if (!keskipiste) continue;
    const xy = kartta.project([keskipiste.lon, keskipiste.lat]);
    const perus = merkki.tehoMw != null && merkki.tehoMw > 0 ? merkki.tehoMw : 50;
    const sade = tehoSadePx(perus, zoom) + 8;
    const ympyra = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ympyra.setAttribute("cx", xy.x.toFixed(1));
    ympyra.setAttribute("cy", xy.y.toFixed(1));
    ympyra.setAttribute("r", sade.toFixed(1));
    ympyra.setAttribute("fill", "none");
    ympyra.setAttribute("stroke", "#dc2626");
    ympyra.setAttribute("stroke-width", "2.5");
    ympyra.setAttribute("stroke-dasharray", "7 5");
    svg.appendChild(ympyra);
  }
}

function piirraTehoHalotKerros(
  kartta: MapLibre,
  svg: SVGSVGElement,
  merkit: Karttamerkki[],
  naytaTeho: boolean,
  naytaJohdonmukaisuus: boolean,
) {
  const kehys = kartta.getContainer();
  const leveys = kehys.clientWidth;
  const korkeus = kehys.clientHeight;
  svg.setAttribute("width", String(leveys));
  svg.setAttribute("height", String(korkeus));
  svg.setAttribute("viewBox", `0 0 ${leveys} ${korkeus}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!naytaTeho && !naytaJohdonmukaisuus) return;
  if (naytaTeho) {
    lisaaTehoSuodatin(svg);
    piirraTehoHalot(kartta, svg, merkit);
  }
  if (naytaJohdonmukaisuus) {
    piirraJohdonmukaisuusRenkaat(kartta, svg, merkit);
  }
}

function piirraAlueetJaJohdot(kartta: MapLibre, svg: SVGSVGElement, merkit: Karttamerkki[]) {
  const kehys = kartta.getContainer();
  const leveys = kehys.clientWidth;
  const korkeus = kehys.clientHeight;
  svg.setAttribute("width", String(leveys));
  svg.setAttribute("height", String(korkeus));
  svg.setAttribute("viewBox", `0 0 ${leveys} ${korkeus}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const naytaAlueet = kartta.getZoom() >= 9;

  for (const merkki of merkit) {
    const alue = parsiAlue(merkki.alue);
    const rengas = alue?.coordinates[0];
    if (naytaAlueet && rengas && rengas.length >= 3) {
      const osat = rengas.map((piste, i) => {
        const xy = kartta.project([piste[0], piste[1]]);
        return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
      });
      const polku = document.createElementNS("http://www.w3.org/2000/svg", "path");
      polku.setAttribute("d", `${osat.join(" ")} Z`);
      const vari = vaiheVari(merkki.vaihe);
      polku.setAttribute("fill", variAlueeksi(vari, 0.4));
      polku.setAttribute("stroke", vari);
      polku.setAttribute("stroke-width", "2");
      svg.appendChild(polku);
    }
    if (!naytaAlueet) continue;
    for (const johto of merkki.johdot ?? []) {
      const viiva = parsiViiva(johto.reitti);
      if (viiva) piirraViiva(kartta, svg, viiva);
    }
  }
}

function piirraLiityntapisteet(
  kartta: MapLibre,
  svg: SVGSVGElement,
  pisteet: FingridLiityntapiste[],
  nayta: boolean,
) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!nayta || pisteet.length === 0) return;
  const zoom = kartta.getZoom();
  if (zoom < 6) return;
  const koko = zoom >= 10 ? 7 : 5;
  for (const piste of pisteet) {
    const xy = kartta.project([piste.lon, piste.lat]);
    const nelio = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    nelio.setAttribute("x", String(xy.x - koko / 2));
    nelio.setAttribute("y", String(xy.y - koko / 2));
    nelio.setAttribute("width", String(koko));
    nelio.setAttribute("height", String(koko));
    nelio.setAttribute("fill", "#7c3aed");
    nelio.setAttribute("stroke", "#fff");
    nelio.setAttribute("stroke-width", "1");
    nelio.setAttribute("opacity", "0.85");
    svg.appendChild(nelio);
  }
}

export function Kartta({
  merkit,
  luokka,
  vaiheLkm,
  kartallaLkm,
  sovitaSuomeen = false,
  tuotantoVertailu = null,
  liityntapisteet = [],
  asettelu = "upotettu",
  sovitaIkkunaan = false,
  taydennNayttoHref,
}: {
  merkit: Karttamerkki[];
  luokka?: string;
  vaiheLkm?: Partial<Record<HankeVaihe, number>>;
  /** Kartalla näkyvien hankkeiden kokonaismäärä (legendin otsikko). */
  kartallaLkm?: number;
  sovitaSuomeen?: boolean;
  /** Fingridin valtakunnallinen kokonaistuotanto; hankeluvut lasketaan vaihesuodattimesta. */
  tuotantoVertailu?: {
    fingridMw: number;
    fingridPaivitetty: string;
    tuotantotyypit: { nimi: string; mw: number; lahde_url: string }[];
  } | null;
  /** Sähköasemat (OSM, ≥110 kV) — ei Fingridin virallista sijaintidataa. */
  liityntapisteet?: FingridLiityntapiste[];
  /** Upotettu etusivulle tai koko näytön karttasivu. */
  asettelu?: "upotettu" | "koko";
  /** Rajaa kartta+legenda näkyvään ikkunaan (etusivu). */
  sovitaIkkunaan?: boolean;
  /** Linkki koko näytön kartalle; näytetään vain upotetussa tilassa. */
  taydennNayttoHref?: string;
}) {
  const kehys = useRef<HTMLDivElement>(null);
  const karttaRef = useRef<MapLibre | null>(null);
  const svgMaakuntaRef = useRef<SVGSVGElement | null>(null);
  const svgTehoRef = useRef<SVGSVGElement | null>(null);
  const svgGeometriaRef = useRef<SVGSVGElement | null>(null);
  const svgLiityntapisteRef = useRef<SVGSVGElement | null>(null);
  const liityntapisteetRef = useRef<FingridLiityntapiste[]>(liityntapisteet);
  const merkitNytRef = useRef<Karttamerkki[]>([]);
  const merkkiluokatRef = useRef<Map<string, { marker: Marker; vaihe?: HankeVaihe }>>(new Map());
  const aktivisetVaiheetRef = useRef<Set<HankeVaihe>>(kaikkiVaiheetAktiviset());
  const naytaTehoHalotRef = useRef(true);
  const naytaJohdonmukaisuusRef = useRef(false);
  const naytaMaakunnatRef = useRef(true);
  const maakuntaTilaRef = useRef<MaakuntaTila>("hankkeet");
  const avain = process.env.NEXT_PUBLIC_MML_API_AVAIN;
  const merkitAvain = JSON.stringify(merkit);
  const [aktivisetVaiheet, setAktivisetVaiheet] = useState<Set<HankeVaihe>>(kaikkiVaiheetAktiviset);
  const [naytaTehoHalot, setNaytaTehoHalot] = useState(true);
  const [naytaJohdonmukaisuus, setNaytaJohdonmukaisuus] = useState(false);
  const [naytaMaakunnat, setNaytaMaakunnat] = useState(true);
  const [maakuntaTila, setMaakuntaTila] = useState<MaakuntaTila>("hankkeet");
  const [naytaLiityntapisteet, setNaytaLiityntapisteet] = useState(false);

  liityntapisteetRef.current = liityntapisteet;

  aktivisetVaiheetRef.current = aktivisetVaiheet;
  naytaTehoHalotRef.current = naytaTehoHalot;
  naytaJohdonmukaisuusRef.current = naytaJohdonmukaisuus;
  naytaMaakunnatRef.current = naytaMaakunnat;
  maakuntaTilaRef.current = maakuntaTila;
  const naytaLiityntapisteetRef = useRef(naytaLiityntapisteet);
  naytaLiityntapisteetRef.current = naytaLiityntapisteet;

  useEffect(() => {
    setAktivisetVaiheet(kaikkiVaiheetAktiviset());
  }, [merkitAvain]);

  const paivitaNakyvyys = () => {
    const kartta = karttaRef.current;
    const svgMaakunta = svgMaakuntaRef.current;
    const svgTeho = svgTehoRef.current;
    const svgGeometria = svgGeometriaRef.current;
    const svgLiityntapiste = svgLiityntapisteRef.current;
    const merkitNyt = merkitNytRef.current;
    const aktiviset = aktivisetVaiheetRef.current;
    const naytaTeho = naytaTehoHalotRef.current;
    const naytaJohdonmukaisuus = naytaJohdonmukaisuusRef.current;
    if (!kartta || !svgMaakunta || !svgTeho || !svgGeometria || !svgLiityntapiste) return;

    const zoom = kartta.getZoom();
    for (const [, { marker, vaihe }] of merkkiluokatRef.current) {
      const elementti = marker.getElement();
      const nayta = merkkiNakyvissa({ vaihe }, aktiviset);
      elementti.style.display = nayta ? "" : "none";
      if (nayta) paivitaMerkkiTyyppi(elementti, zoom);
    }

    const suodatetut = suodataMerkit(merkitNyt, aktiviset);
    piirraMaakuntaKerros(
      kartta,
      svgMaakunta,
      MAAKUNTA_POHJA_GEO,
      suodatetut,
      naytaMaakunnatRef.current,
      maakuntaTilaRef.current,
    );
    piirraTehoHalotKerros(kartta, svgTeho, suodatetut, naytaTeho, naytaJohdonmukaisuus);
    piirraAlueetJaJohdot(kartta, svgGeometria, suodatetut);
    piirraLiityntapisteet(
      kartta,
      svgLiityntapiste,
      liityntapisteetRef.current,
      naytaLiityntapisteetRef.current,
    );
  };

  const vaihdaVaihe = (vaihe: HankeVaihe) => {
    setAktivisetVaiheet((edelliset) => {
      const seuraavat = new Set(edelliset);
      if (seuraavat.has(vaihe)) {
        seuraavat.delete(vaihe);
      } else {
        seuraavat.add(vaihe);
      }
      return seuraavat;
    });
  };

  useEffect(() => {
    paivitaNakyvyys();
  }, [aktivisetVaiheet, naytaTehoHalot, naytaJohdonmukaisuus, naytaMaakunnat, maakuntaTila, naytaLiityntapisteet, liityntapisteet]);

  useEffect(() => {
    if (!kehys.current || !avain) return;
    const merkitNyt: Karttamerkki[] = JSON.parse(merkitAvain).map((merkki: Karttamerkki) => ({
      ...merkki,
      alue: parsiAlue(merkki.alue),
      johdot: (merkki.johdot ?? [])
        .map((johto) => {
          const reitti = parsiViiva(johto.reitti);
          return reitti ? { id: johto.id, reitti } : null;
        })
        .filter((johto): johto is { id: string; reitti: SijaintiViiva } => johto != null),
    }));

    merkitNytRef.current = merkitNyt;

    const kartta = new MapLibre({
      container: kehys.current,
      style: taustakarttaTyyli(avain),
      center: [26.0, 64.5],
      zoom: 4.4,
      attributionControl: { compact: true },
    });
    kartta.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const svgMaakunta = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgMaakunta.setAttribute("aria-hidden", "true");
    svgMaakunta.setAttribute("class", "kartta-maakunta-kerros");
    svgMaakunta.style.cssText =
      "position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible;";

    const svgTeho = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgTeho.setAttribute("aria-hidden", "true");
    svgTeho.setAttribute("class", "kartta-teho-kerros");
    svgTeho.style.cssText =
      "position:absolute;inset:0;z-index:1;pointer-events:none;overflow:visible;";

    const svgGeometria = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgGeometria.setAttribute("aria-hidden", "true");
    svgGeometria.setAttribute("class", "kartta-geometria-kerros");
    svgGeometria.style.cssText =
      "position:absolute;inset:0;z-index:2;pointer-events:none;overflow:visible;";

    const svgLiityntapiste = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgLiityntapiste.setAttribute("aria-hidden", "true");
    svgLiityntapiste.setAttribute("class", "kartta-liityntapiste-kerros");
    svgLiityntapiste.style.cssText =
      "position:absolute;inset:0;z-index:3;pointer-events:none;overflow:visible;";

    kartta.getCanvasContainer().appendChild(svgMaakunta);
    kartta.getCanvasContainer().appendChild(svgTeho);
    kartta.getCanvasContainer().appendChild(svgGeometria);
    kartta.getCanvasContainer().appendChild(svgLiityntapiste);

    karttaRef.current = kartta;
    svgMaakuntaRef.current = svgMaakunta;
    svgTehoRef.current = svgTeho;
    svgGeometriaRef.current = svgGeometria;
    svgLiityntapisteRef.current = svgLiityntapiste;

    merkkiluokatRef.current = new Map();
    for (const merkki of merkitNyt) {
      const keskipiste =
        merkki.lat != null && merkki.lon != null
          ? { lat: merkki.lat, lon: merkki.lon }
          : merkki.alue
            ? alueenKeskipiste(merkki.alue)
            : null;
      if (!keskipiste) continue;
      const elementti = luoKarttamerkki(merkki);
      const marker = new Marker({ element: elementti, anchor: "center" })
        .setLngLat([keskipiste.lon, keskipiste.lat])
        .addTo(kartta);
      paivitaMerkkiTyyppi(elementti, kartta.getZoom());
      merkkiluokatRef.current.set(merkki.id, { marker, vaihe: merkki.vaihe });
    }

    const merkkiluokat = [...merkkiluokatRef.current.values()].map(({ marker }) => marker);

    const rajat = new LngLatBounds();
    let onRajoja = false;
    for (const merkki of merkitNyt) {
      if (merkki.lat != null && merkki.lon != null) {
        rajat.extend([merkki.lon, merkki.lat]);
        onRajoja = true;
      }
      if (merkki.alue) {
        laajennaAlueella(rajat, merkki.alue);
        onRajoja = true;
      }
      for (const johto of merkki.johdot ?? []) {
        const viiva = parsiViiva(johto.reitti);
        if (!viiva) continue;
        laajennaViivalla(rajat, viiva);
        onRajoja = true;
      }
    }

    const paivita = () => paivitaNakyvyys();

    const rajaaKartta = () => {
      paivitaNakyvyys();
      kartta.resize();
      if (sovitaSuomeen) {
        kartta.fitBounds(SUOMI_RAJAT, { padding: 24, maxZoom: 6 });
        paivita();
        return;
      }
      const yhdellaGeometria =
        merkitNyt.length === 1 &&
        Boolean(merkitNyt[0]?.alue || (merkitNyt[0]?.johdot && merkitNyt[0].johdot.length > 0));
      if (yhdellaGeometria && onRajoja) {
        kartta.fitBounds(rajat, { padding: 36, maxZoom: 16 });
      } else if (merkitNyt.length === 1 && merkitNyt[0].lat != null && merkitNyt[0].lon != null) {
        kartta.setCenter([merkitNyt[0].lon, merkitNyt[0].lat]);
        kartta.setZoom(14);
      } else if (onRajoja) {
        kartta.fitBounds(rajat, { padding: 48, maxZoom: 14 });
      }
      paivita();
    };

    kartta.on("move", paivita);
    kartta.on("resize", paivita);

    const kokoTarkkailija = new ResizeObserver(() => {
      kartta.resize();
      paivita();
    });
    const karttaKehys = kehys.current;
    if (karttaKehys) kokoTarkkailija.observe(karttaKehys);

    if (kartta.loaded()) {
      rajaaKartta();
    } else {
      kartta.once("load", rajaaKartta);
    }

    const resizeKartta = () => {
      kartta.resize();
      paivitaNakyvyys();
    };

    requestAnimationFrame(() => {
      resizeKartta();
      requestAnimationFrame(resizeKartta);
    });
    const resizeAjastin = window.setTimeout(resizeKartta, 150);

    return () => {
      window.clearTimeout(resizeAjastin);
      kokoTarkkailija.disconnect();
      kartta.off("move", paivita);
      kartta.off("resize", paivita);
      merkkiluokat.forEach((merkki) => merkki.remove());
      merkkiluokatRef.current.clear();
      svgMaakunta.remove();
      svgTeho.remove();
      svgGeometria.remove();
      svgMaakuntaRef.current = null;
      svgTehoRef.current = null;
      svgGeometriaRef.current = null;
      kartta.remove();
      karttaRef.current = null;
    };
  }, [avain, merkitAvain, sovitaSuomeen]);

  if (!avain) {
    return (
      <p className="rounded border border-border bg-surface px-4 py-3 text-sm">
        Karttaa ei näytetä, ennen kuin Maanmittauslaitoksen avoin kartta-avain
        on asetettu.
      </p>
    );
  }

  const nakyvatMerkit = suodataMerkit(merkit, aktivisetVaiheet);
  const nakyvatLkm = nakyvatMerkit.length;
  const hankkeetMw = nakyvatMerkit.reduce((summa, merkki) => summa + (merkki.tehoMw ?? 0), 0);
  const hankkeetTehoLkm = nakyvatMerkit.filter(
    (merkki) => merkki.tehoMw != null && merkki.tehoMw > 0,
  ).length;
  const hankkeetMaakunnittain = laskeMaakuntaYhteenvedot(nakyvatMerkit);
  const maakuntaYhteenvedot = jarjestaMaakunnat(hankkeetMaakunnittain, maakuntaTila);
  const tuotantoRivit =
    maakuntaTila === "sahkontuotanto"
      ? laskeMaakuntaTuotantoRivit(hankkeetMaakunnittain)
      : [];
  const maakunnatonLkm = nakyvatMerkit.filter((merkki) => !merkki.maakunta?.trim()).length;
  const sahkoYhteenveto = laskeSahkoYhteenveto(nakyvatMerkit);
  const maakuntaSelite = MAAKUNTA_TILA_SELITE[maakuntaTila];
  const johdonmukaisuusTarkistettavat = nakyvatMerkit.filter(
    (merkki) =>
      laskeJohdonmukaisuus(
        merkki.tehoMw,
        merkki.sahkonkayttoTwhMin,
        merkki.sahkonkayttoTwhMax,
      ).tila === "tarkista",
  );
  const johdonmukaisuusVertailtavat = nakyvatMerkit.filter(
    (merkki) =>
      laskeJohdonmukaisuus(
        merkki.tehoMw,
        merkki.sahkonkayttoTwhMin,
        merkki.sahkonkayttoTwhMax,
      ).tila !== "puuttuu",
  ).length;

  const fingridTeksti =
    tuotantoVertailu != null
      ? new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 }).format(
          tuotantoVertailu.fingridMw,
        )
      : null;
  const hankkeetTeksti =
    tuotantoVertailu != null
      ? new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 }).format(hankkeetMw)
      : null;
  const suhdeTeksti =
    tuotantoVertailu != null && tuotantoVertailu.fingridMw > 0
      ? new Intl.NumberFormat("fi-FI", {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1,
        }).format((hankkeetMw / tuotantoVertailu.fingridMw) * 100)
      : null;

  return (
    <div
      className={[
        asettelu === "koko" || sovitaIkkunaan
          ? "flex h-full min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:items-stretch"
          : "flex flex-col gap-4 sm:flex-row sm:items-stretch",
      ].join(" ")}
    >
      <div
        ref={kehys}
        className={[
          "relative min-h-0 min-w-0 flex-1 overflow-hidden rounded border border-border",
          asettelu === "koko" || sovitaIkkunaan
            ? "min-h-[12rem]"
            : "min-h-[min(70svh,42rem)] sm:min-h-[28rem] sm:h-auto sm:self-stretch",
          luokka ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="region"
        aria-label="Hankkeiden sijaintikartta"
      >
        {taydennNayttoHref ? (
          <a
            href={taydennNayttoHref}
            className="absolute left-2 top-2 z-10 rounded border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm hover:bg-surface"
          >
            Avaa koko näytöllä
          </a>
        ) : null}
      </div>
      <aside
        className={
          asettelu === "koko" || sovitaIkkunaan
            ? "max-h-[38%] min-h-0 shrink-0 overflow-y-auto sm:max-h-none sm:w-52"
            : "sm:w-52 sm:shrink-0"
        }
        aria-labelledby="kartta-selite-otsikko"
      >
        <h3 id="kartta-selite-otsikko" className="text-sm font-semibold">
          Vaihe
        </h3>
        <p className="mt-1 text-xs text-muted">Valitse näytettävät vaiheet.</p>
        <ul className="mt-2 space-y-1 text-sm" role="group" aria-label="Vaihesuodatin">
          {HANKE_VAIHEET.map((vaihe) => {
            const lkm = vaiheLkm?.[vaihe];
            const aktivoitu = aktivisetVaiheet.has(vaihe);
            return (
              <li key={vaihe}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/30 ${aktivoitu ? "" : "text-muted"}`}
                  aria-pressed={aktivoitu}
                  onClick={() => vaihdaVaihe(vaihe)}
                >
                  <span
                    className="inline-block size-3 shrink-0 rounded-full border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
                    style={{
                      backgroundColor: aktivoitu ? VAIHE_VARIT[vaihe] : "transparent",
                      borderColor: aktivoitu ? "#fff" : VAIHE_VARIT[vaihe],
                      boxShadow: aktivoitu ? "0 0 0 1px rgba(0,0,0,0.25)" : undefined,
                    }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">{VAIHE_NIMET[vaihe]}</span>
                  {lkm != null ? (
                    <span className="tabular-nums text-muted" aria-label={`${lkm} hanketta`}>
                      {lkm}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {kartallaLkm != null ? (
          <p className="mt-2 flex items-center gap-2 border-t border-border pt-2 text-sm">
            <span className="inline-block size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">Näkyvissä</span>
            <span
              className="tabular-nums font-semibold"
              aria-label={`${nakyvatLkm} hanketta näkyvissä kartalla`}
            >
              {nakyvatLkm}
            </span>
          </p>
        ) : null}
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            className={`flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/30 ${naytaTehoHalot ? "" : "text-muted"}`}
            aria-pressed={naytaTehoHalot}
            onClick={() => setNaytaTehoHalot((edellinen) => !edellinen)}
          >
            <span
              className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full border-2"
              style={{
                background: naytaTehoHalot
                  ? "linear-gradient(to right, #fef9c3, #fde047, #fbbf24, #f59e0b, #ea580c)"
                  : "transparent",
                borderColor: naytaTehoHalot ? "#fbbf24" : "#d97706",
              }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">IT-teho</span>
              <span className="mt-1 block text-xs leading-relaxed">
                Keltainen halo kuvaa IT-tehoa tai kokonaistehoa (MW).
              </span>
            </span>
          </button>
          <div
            className={`mt-2 h-3 w-full rounded border border-border transition-opacity ${naytaTehoHalot ? "" : "opacity-40"}`}
            style={{
              background:
                "linear-gradient(to right, #fef9c3, #fde047, #fbbf24, #f59e0b, #ea580c)",
            }}
            role="img"
            aria-hidden="true"
          />
          <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
            <span>1 MW</span>
            <span>1000+ MW</span>
          </div>
        </div>
        {johdonmukaisuusTarkistettavat.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              className={`flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/30 ${naytaJohdonmukaisuus ? "" : "text-muted"}`}
              aria-pressed={naytaJohdonmukaisuus}
              onClick={() => setNaytaJohdonmukaisuus((edellinen) => !edellinen)}
            >
              <span
                className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full border-2 border-dashed"
                style={{
                  borderColor: naytaJohdonmukaisuus ? "#dc2626" : "#94a3b8",
                  backgroundColor: naytaJohdonmukaisuus ? "rgba(220,38,38,0.15)" : "transparent",
                }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">IT-teho vs. kulutus</span>
                <span className="mt-1 block text-xs leading-relaxed">
                  Punainen katkoviiva, jos IT-teho (MW) ja dokumentoidun vuosikulutuksen
                  keskiteho poikkeavat selvästi. Suuntaa-antava; kulutus voi sisältää jäähdytyksen.
                </span>
              </span>
            </button>
            <p className="mt-2 text-xs tabular-nums text-muted">
              Tarkistettavaa {johdonmukaisuusTarkistettavat.length}/
              {johdonmukaisuusVertailtavat} vertailtavaa hanketta
            </p>
            {naytaJohdonmukaisuus ? (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                {johdonmukaisuusTarkistettavat.map((merkki) => (
                  <li key={merkki.id}>
                    <a href={`/hankkeet/${merkki.id}`} className="text-link underline">
                      {merkki.nimi}
                    </a>
                    <span className="mt-0.5 block tabular-nums text-muted">
                      {muotoileJohdonmukaisuusTeksti(merkki)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {liityntapisteet.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              className={`flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/30 ${naytaLiityntapisteet ? "" : "text-muted"}`}
              aria-pressed={naytaLiityntapisteet}
              onClick={() => setNaytaLiityntapisteet((edellinen) => !edellinen)}
            >
              <span
                className="mt-0.5 inline-block size-3 shrink-0 border border-white"
                style={{
                  backgroundColor: naytaLiityntapisteet ? "#7c3aed" : "transparent",
                  borderColor: naytaLiityntapisteet ? "#fff" : "#94a3b8",
                }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Sähköasemat (≥110 kV)</span>
                <span className="mt-1 block text-xs leading-relaxed">
                  OpenStreetMap, ei Fingridin virallista sijaintidataa. Näkyy zoomissa ≥6.
                  Virallinen liityntätieto:{" "}
                  <a
                    href="https://www.fingrid.fi/kantaverkko/liitynta-kantaverkkoon/verkkokiikari/"
                    className="text-link underline"
                  >
                    Verkkokiikari
                  </a>
                  .
                </span>
              </span>
            </button>
            <p className="mt-2 text-xs tabular-nums text-muted">
              {liityntapisteet.length} asemaa kartalla
            </p>
          </div>
        ) : null}
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            className={`flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/30 ${naytaMaakunnat ? "" : "text-muted"}`}
            aria-pressed={naytaMaakunnat}
            onClick={() => setNaytaMaakunnat((edellinen) => !edellinen)}
          >
            <span
              className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border-2"
              style={{
                backgroundColor: naytaMaakunnat ? "#6366f1" : "transparent",
                borderColor: naytaMaakunnat ? "#475569" : "#94a3b8",
                opacity: naytaMaakunnat ? 0.55 : 1,
              }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Maakunnittain</span>
              <span className="mt-1 block text-xs leading-relaxed">
                {maakuntaSelite.kuvaus}
              </span>
            </span>
          </button>
          <fieldset
            className={`mt-2 space-y-1 ${naytaMaakunnat ? "" : "pointer-events-none opacity-40"}`}
            aria-label="Maakuntakerroksen mittari"
          >
            {MAAKUNTA_TILA_JARJESTYS.map((tila) => (
              <label
                key={tila}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/30"
              >
                <input
                  type="radio"
                  name="maakunta-tila"
                  className="shrink-0"
                  checked={maakuntaTila === tila}
                  onChange={() => setMaakuntaTila(tila)}
                />
                <span>{MAAKUNTA_TILA_SELITE[tila].otsikko}</span>
              </label>
            ))}
          </fieldset>
          <div
            className={`mt-2 h-3 w-full rounded border border-border transition-opacity ${naytaMaakunnat ? "" : "opacity-40"}`}
            style={{ background: maakuntaSelite.gradient }}
            role="img"
            aria-hidden="true"
          />
          <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
            <span>{maakuntaSelite.min}</span>
            <span>{maakuntaSelite.max}</span>
          </div>
          {maakuntaTila === "sahkontuotanto" ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {tuotantoRivit.map((rivi) => (
                <li
                  key={rivi.nimi}
                  className="flex items-baseline justify-between gap-2 tabular-nums"
                >
                  <span className="min-w-0 truncate">{rivi.nimi}</span>
                  <span className="shrink-0 text-right font-semibold">
                    {muotoileTuotantoRivi(rivi)}
                  </span>
                </li>
              ))}
            </ul>
          ) : maakuntaYhteenvedot.length > 0 ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {maakuntaYhteenvedot.map((yhteenveto) => (
                <li
                  key={yhteenveto.nimi}
                  className="flex items-baseline justify-between gap-2 tabular-nums"
                >
                  <span className="min-w-0 truncate">{yhteenveto.nimi}</span>
                  <span className="shrink-0 font-semibold">
                    {muotoileMaakuntaArvo(yhteenveto, maakuntaTila)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Ei hankkeita maakunnittain valituilla vaiheilla.
            </p>
          )}
          {maakuntaTila === "sahkontuotanto" ? (
            <p className="mt-2 text-xs text-muted">{ENERGIA_MAAKUNTA_TUOTANTO.huomautus}</p>
          ) : null}
          {maakunnatonLkm > 0 ? (
            <p className="mt-2 text-xs text-muted">
              {maakunnatonLkm} hankkeella maakuntaa ei voitu ratkaista.
            </p>
          ) : null}
          <p className="mt-2 text-xs">
            <a href={MAAKUNTA_RAJAT_LAHDE_URL} className="text-link underline">
              Lähde: {MAAKUNTA_RAJAT_LAHDE_NIMI}
            </a>
            {maakuntaTila === "sahkontuotanto" ? (
              <>
                {" · "}
                <a href={ENERGIA_MAAKUNTA_TUOTANTO.lahde_sivu_url} className="text-link underline">
                  {ENERGIA_MAAKUNTA_TUOTANTO.lahde_nimi} ({ENERGIA_MAAKUNTA_TUOTANTO.vuosi})
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-sm font-semibold">Sähkönkäyttö (valitut hankkeet)</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            YVA- ja lupadokumenttien sähkönkäyttö (TWh/a). IT-teho (MW) on eri
            suure; vertailu Fingridin tuotantoon alla on vain suuntaa-antava.
          </p>
          <dl className="mt-2 text-sm">
            <dt className="text-muted">Yhteensä</dt>
            <dd className="font-semibold tabular-nums">
              {sahkoYhteenveto.merkittyLkm > 0
                ? muotoileVaihtelvali(
                    sahkoYhteenveto.min,
                    sahkoYhteenveto.max,
                    "TWh/a",
                  )
                : "—"}
            </dd>
            <dt className="mt-1 text-xs text-muted">Kattavuus</dt>
            <dd className="text-xs tabular-nums text-muted">
              <KattavuusHankkeita
                merkitty={sahkoYhteenveto.merkittyLkm}
                kaikki={sahkoYhteenveto.kaikkiLkm}
              />
            </dd>
          </dl>
        </div>
        {tuotantoVertailu ? (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-sm font-semibold">Tuotanto vs. datakeskukset</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Fingridin mitaama Suomen kokonaistuotanto (MW) verrattuna kartalla
              valittujen hankkeiden IT-tehoon. Sähkönkäyttö (TWh/a) on eri
              yksikkö — katso yllä.
            </p>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-muted">Suomen tuotanto nyt</dt>
                <dd className="font-semibold tabular-nums">{fingridTeksti} MW</dd>
              </div>
              {tuotantoVertailu.tuotantotyypit.length > 0 ? (
                <div>
                  <dt className="text-muted">Tuotantotyypit (Fingrid)</dt>
                  <dd>
                    <ul className="mt-1 space-y-1 text-sm">
                      {tuotantoVertailu.tuotantotyypit.map((tyyppi) => (
                        <li key={tyyppi.lahde_url} className="flex justify-between gap-2">
                          <a href={tyyppi.lahde_url} className="text-link underline">
                            {tyyppi.nimi}
                          </a>
                          <span className="shrink-0 tabular-nums font-semibold">
                            {new Intl.NumberFormat("fi-FI", {
                              maximumFractionDigits: 0,
                            }).format(tyyppi.mw)}{" "}
                            MW
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted">
                      Valtakunnalliset sarjat; eivät kata koko kokonaistuotantoa eivätkä
                      sijaintia.
                    </p>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">
                  Valitut hankkeet kartalla (
                  <KattavuusHankkeita merkitty={hankkeetTehoLkm} kaikki={nakyvatLkm} />)
                </dt>
                <dd className="font-semibold tabular-nums">{hankkeetTeksti} MW</dd>
              </div>
              {suhdeTeksti ? (
                <div>
                  <dt className="text-muted">Suhde (hankkeet / tuotanto)</dt>
                  <dd className="font-semibold tabular-nums">{suhdeTeksti} %</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-2 text-xs text-muted">
              Fingrid {new Date(tuotantoVertailu.fingridPaivitetty).toLocaleString("fi-FI")}.
              Tuotanto on valtakunnallista eikä kata sijaintia.
            </p>
            <p className="mt-1 text-xs">
              <a
                href="https://data.fingrid.fi/datasets/192"
                className="text-link underline"
              >
                Lähde: Fingrid, kokonaistuotanto
              </a>
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
