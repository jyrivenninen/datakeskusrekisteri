"use client";

import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MapLibre,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  laskeMaakuntaYhteenvedot,
  MAAKUNTA_RAJAT_LAHDE_NIMI,
  MAAKUNTA_RAJAT_LAHDE_URL,
  MAAKUNTA_RAJAT_URL,
  type MaakuntaYhteenveto,
} from "@/lib/maakunta";
import { VAIHE_NIMET, VAIHE_VARIT } from "@/lib/naytto";
import { HANKE_VAIHEET, type HankeVaihe, type SijaintiAlue, type SijaintiViiva } from "@/lib/supabase/tietokanta";

export type Karttamerkki = {
  id: string;
  nimi: string;
  vaihe?: HankeVaihe;
  lat?: number;
  lon?: number;
  /** IT-teho tai fallback kokonaisteho (MW); halo piirretään vain jos > 0. */
  tehoMw?: number | null;
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

/** Sininen–violetti: erottuu kelta-oranssista IT-teho-halosta. */
const MAAKUNTA_TEHO_VARI_PYSAKIT: [number, string][] = [
  [0, "#f1f5f9"],
  [1, "#dbeafe"],
  [30, "#93c5fd"],
  [100, "#6366f1"],
  [300, "#8b5cf6"],
  [1000, "#5b21b6"],
];

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
        },
      };
    }),
  };
}

function lisaaMaakuntaKerrokset(kartta: MapLibre) {
  kartta.addLayer({
    id: "maakunnat-taytto",
    type: "fill",
    source: "maakunnat",
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "tehoMw"], 0],
        ...MAAKUNTA_TEHO_VARI_PYSAKIT.flatMap(([mw, vari]) => [mw, vari]),
      ],
      "fill-opacity": ["case", [">", ["coalesce", ["get", "tehoMw"], 0], 0], 0.52, 0.08],
    },
  });
  kartta.addLayer({
    id: "maakunnat-reuna",
    type: "line",
    source: "maakunnat",
    paint: {
      "line-color": "#334155",
      "line-width": 1.2,
    },
  });
}

/** Odottaa tyylin latautumista — addSource ennen load-tapahtumaa kaataa hiljaa koko ketjun. */
function paivitaMaakuntaKerros(
  kartta: MapLibre,
  pohja: FeatureCollection,
  suodatetut: Karttamerkki[],
  nayta: boolean,
) {
  if (!kartta.isStyleLoaded()) return;

  const data = yhdistaMaakuntaGeo(pohja, laskeMaakuntaYhteenvedot(suodatetut));
  const lahde = kartta.getSource("maakunnat") as GeoJSONSource | undefined;

  if (!lahde) {
    kartta.addSource("maakunnat", { type: "geojson", data });
    lisaaMaakuntaKerrokset(kartta);
  } else {
    lahde.setData(data);
  }

  const nakyvyys = nayta ? "visible" : "none";
  if (kartta.getLayer("maakunnat-taytto")) {
    kartta.setLayoutProperty("maakunnat-taytto", "visibility", nakyvyys);
    kartta.setLayoutProperty("maakunnat-reuna", "visibility", nakyvyys);
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

function piirraTehoHalotKerros(
  kartta: MapLibre,
  svg: SVGSVGElement,
  merkit: Karttamerkki[],
  nayta: boolean,
) {
  const kehys = kartta.getContainer();
  const leveys = kehys.clientWidth;
  const korkeus = kehys.clientHeight;
  svg.setAttribute("width", String(leveys));
  svg.setAttribute("height", String(korkeus));
  svg.setAttribute("viewBox", `0 0 ${leveys} ${korkeus}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!nayta) return;
  lisaaTehoSuodatin(svg);
  piirraTehoHalot(kartta, svg, merkit);
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

export function Kartta({
  merkit,
  luokka,
  vaiheLkm,
  kartallaLkm,
  sovitaSuomeen = false,
  tuotantoVertailu = null,
  asettelu = "upotettu",
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
  /** Upotettu etusivulle tai koko näytön karttasivu. */
  asettelu?: "upotettu" | "koko";
  /** Linkki koko näytön kartalle; näytetään vain upotetussa tilassa. */
  taydennNayttoHref?: string;
}) {
  const kehys = useRef<HTMLDivElement>(null);
  const karttaRef = useRef<MapLibre | null>(null);
  const svgTehoRef = useRef<SVGSVGElement | null>(null);
  const svgGeometriaRef = useRef<SVGSVGElement | null>(null);
  const merkitNytRef = useRef<Karttamerkki[]>([]);
  const merkkiluokatRef = useRef<Map<string, { marker: Marker; vaihe?: HankeVaihe }>>(new Map());
  const aktivisetVaiheetRef = useRef<Set<HankeVaihe>>(kaikkiVaiheetAktiviset());
  const naytaTehoHalotRef = useRef(true);
  const naytaMaakunnatRef = useRef(true);
  const maakuntaGeoRef = useRef<FeatureCollection | null>(null);
  const avain = process.env.NEXT_PUBLIC_MML_API_AVAIN;
  const merkitAvain = JSON.stringify(merkit);
  const [aktivisetVaiheet, setAktivisetVaiheet] = useState<Set<HankeVaihe>>(kaikkiVaiheetAktiviset);
  const [naytaTehoHalot, setNaytaTehoHalot] = useState(true);
  const [naytaMaakunnat, setNaytaMaakunnat] = useState(true);

  aktivisetVaiheetRef.current = aktivisetVaiheet;
  naytaTehoHalotRef.current = naytaTehoHalot;
  naytaMaakunnatRef.current = naytaMaakunnat;

  useEffect(() => {
    setAktivisetVaiheet(kaikkiVaiheetAktiviset());
  }, [merkitAvain]);

  const paivitaNakyvyys = () => {
    const kartta = karttaRef.current;
    const svgTeho = svgTehoRef.current;
    const svgGeometria = svgGeometriaRef.current;
    const merkitNyt = merkitNytRef.current;
    const aktiviset = aktivisetVaiheetRef.current;
    const naytaTeho = naytaTehoHalotRef.current;
    if (!kartta || !svgTeho || !svgGeometria) return;

    const zoom = kartta.getZoom();
    for (const [, { marker, vaihe }] of merkkiluokatRef.current) {
      const elementti = marker.getElement();
      const nayta = merkkiNakyvissa({ vaihe }, aktiviset);
      elementti.style.display = nayta ? "" : "none";
      if (nayta) paivitaMerkkiTyyppi(elementti, zoom);
    }

    const suodatetut = suodataMerkit(merkitNyt, aktiviset);
    piirraTehoHalotKerros(kartta, svgTeho, suodatetut, naytaTeho);
    piirraAlueetJaJohdot(kartta, svgGeometria, suodatetut);

    const pohja = maakuntaGeoRef.current;
    if (pohja) {
      paivitaMaakuntaKerros(kartta, pohja, suodatetut, naytaMaakunnatRef.current);
    }
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
  }, [aktivisetVaiheet, naytaTehoHalot, naytaMaakunnat]);

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

    const svgTeho = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgTeho.setAttribute("aria-hidden", "true");
    svgTeho.setAttribute("class", "kartta-teho-kerros");
    svgTeho.style.cssText =
      "position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible;";

    const svgGeometria = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgGeometria.setAttribute("aria-hidden", "true");
    svgGeometria.setAttribute("class", "kartta-geometria-kerros");
    svgGeometria.style.cssText =
      "position:absolute;inset:0;z-index:1;pointer-events:none;overflow:visible;";

    kartta.getCanvasContainer().appendChild(svgTeho);
    kartta.getCanvasContainer().appendChild(svgGeometria);

    karttaRef.current = kartta;
    svgTehoRef.current = svgTeho;
    svgGeometriaRef.current = svgGeometria;

    void fetch(MAAKUNTA_RAJAT_URL)
      .then((vastaus) => {
        if (!vastaus.ok) throw new Error("Maakuntarajat eivät latautuneet");
        return vastaus.json() as Promise<FeatureCollection>;
      })
      .then((geo) => {
        if (karttaRef.current !== kartta) return;
        maakuntaGeoRef.current = geo;
        paivitaNakyvyys();
      })
      .catch(() => {
        /* GeoJSON-lataus epäonnistui; kartta toimii ilman maakuntakerrosta */
      });

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

    return () => {
      kokoTarkkailija.disconnect();
      kartta.off("move", paivita);
      kartta.off("resize", paivita);
      merkkiluokat.forEach((merkki) => merkki.remove());
      merkkiluokatRef.current.clear();
      svgTeho.remove();
      svgGeometria.remove();
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
  const maakuntaYhteenvedot = laskeMaakuntaYhteenvedot(nakyvatMerkit);
  const maakunnatonLkm = nakyvatMerkit.filter((merkki) => !merkki.maakunta?.trim()).length;

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
      className={
        asettelu === "koko"
          ? "flex h-full min-h-0 flex-col gap-4 sm:flex-row sm:items-stretch"
          : "flex flex-col gap-4 sm:flex-row sm:items-stretch"
      }
    >
      <div
        className={
          asettelu === "koko"
            ? "relative min-h-0 min-w-0 flex-1"
            : "relative min-h-[min(70svh,42rem)] min-w-0 flex-1 sm:min-h-[28rem]"
        }
      >
        {taydennNayttoHref ? (
          <a
            href={taydennNayttoHref}
            className="absolute left-2 top-2 z-10 rounded border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm hover:bg-surface"
          >
            Avaa koko näytöllä
          </a>
        ) : null}
        <div
          ref={kehys}
          className={`absolute inset-0 overflow-hidden rounded border border-border ${luokka ?? ""}`}
          role="region"
          aria-label="Hankkeiden sijaintikartta"
        />
      </div>
      <aside
        className={
          asettelu === "koko"
            ? "sm:max-h-full sm:w-52 sm:shrink-0 sm:overflow-y-auto"
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
                Sininen alue = valittujen vaiheiden yhteisteho maakunnassa. Keltainen
                halo = saman hankkeen teho pisteessä.
              </span>
            </span>
          </button>
          <div
            className={`mt-2 h-3 w-full rounded border border-border transition-opacity ${naytaMaakunnat ? "" : "opacity-40"}`}
            style={{
              background: "linear-gradient(to right, #dbeafe, #93c5fd, #6366f1, #8b5cf6, #5b21b6)",
            }}
            role="img"
            aria-hidden="true"
          />
          <div className="mt-1 flex justify-between text-xs tabular-nums text-muted">
            <span>0 MW</span>
            <span>1000+ MW</span>
          </div>
          {maakuntaYhteenvedot.length > 0 ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {maakuntaYhteenvedot.map((yhteenveto) => (
                <li
                  key={yhteenveto.nimi}
                  className="flex items-baseline justify-between gap-2 tabular-nums"
                >
                  <span className="min-w-0 truncate">{yhteenveto.nimi}</span>
                  <span className="shrink-0 font-semibold">
                    {new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 0 }).format(
                      yhteenveto.tehoMw,
                    )}{" "}
                    MW
                    <span className="font-normal text-muted">
                      {" "}
                      ({yhteenveto.tehoLkm}/{yhteenveto.hankkeetLkm})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Ei hankkeita maakunnittain valituilla vaiheilla.
            </p>
          )}
          {maakunnatonLkm > 0 ? (
            <p className="mt-2 text-xs text-muted">
              {maakunnatonLkm} hankkeella maakuntaa ei voitu ratkaista.
            </p>
          ) : null}
          <p className="mt-2 text-xs">
            <a href={MAAKUNTA_RAJAT_LAHDE_URL} className="text-link underline">
              Lähde: {MAAKUNTA_RAJAT_LAHDE_NIMI}
            </a>
          </p>
        </div>
        {tuotantoVertailu ? (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-sm font-semibold">Tuotanto vs. datakeskukset</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Fingridin mitaama Suomen kokonaistuotanto verrattuna kartalla
              valittujen vaiheiden hankkeiden yhteitehoon (IT-teho tai
              kokonaisteho).
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
                  Valitut hankkeet kartalla ({hankkeetTehoLkm}/{nakyvatLkm}{" "}
                  hanketta merkitty)
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
              Tuotanto on valtakunnallista; kartta ei vielä näytä tuotannon sijaintia.
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
