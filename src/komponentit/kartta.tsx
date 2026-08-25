"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { VAIHE_NIMET, VAIHE_VARIT } from "@/lib/naytto";
import { HANKE_VAIHEET, type HankeVaihe, type SijaintiAlue, type SijaintiViiva } from "@/lib/supabase/tietokanta";

export type Karttamerkki = {
  id: string;
  nimi: string;
  vaihe?: HankeVaihe;
  lat?: number;
  lon?: number;
  alue?: SijaintiAlue | null;
  johdot?: { id: string; reitti: SijaintiViiva }[];
};

const OLETUSVARI = "#1d4ed8";

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

function piirraViiva(kartta: Map, svg: SVGSVGElement, viiva: SijaintiViiva) {
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

function luoNuppineula(merkki: Karttamerkki) {
  const el = document.createElement("a");
  el.href = `/hankkeet/${merkki.id}`;
  el.className = "kartta-nuppineula";
  const vaihenimi = merkki.vaihe ? VAIHE_NIMET[merkki.vaihe] : null;
  el.setAttribute("aria-label", vaihenimi ? `${merkki.nimi}, ${vaihenimi}` : merkki.nimi);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
  el.appendChild(svg);
  return el;
}

function piirraGeometriat(kartta: Map, svg: SVGSVGElement, merkit: Karttamerkki[]) {
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
  sovitaSuomeen = false,
}: {
  merkit: Karttamerkki[];
  luokka?: string;
  vaiheLkm?: Partial<Record<HankeVaihe, number>>;
  sovitaSuomeen?: boolean;
}) {
  const kehys = useRef<HTMLDivElement>(null);
  const avain = process.env.NEXT_PUBLIC_MML_API_AVAIN;
  const merkitAvain = JSON.stringify(merkit);

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

    const kartta = new Map({
      container: kehys.current,
      style: taustakarttaTyyli(avain),
      center: [26.0, 64.5],
      zoom: 4.4,
      attributionControl: { compact: true },
    });
    kartta.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText =
      "position:absolute;inset:0;z-index:1;pointer-events:none;overflow:visible;";
    kartta.getCanvasContainer().appendChild(svg);

    const merkkiluokat: Marker[] = [];
    for (const merkki of merkitNyt) {
      const keskipiste =
        merkki.lat != null && merkki.lon != null
          ? { lat: merkki.lat, lon: merkki.lon }
          : merkki.alue
            ? alueenKeskipiste(merkki.alue)
            : null;
      if (!keskipiste) continue;
      merkkiluokat.push(
        new Marker({ element: luoNuppineula(merkki), anchor: "bottom" })
          .setLngLat([keskipiste.lon, keskipiste.lat])
          .addTo(kartta),
      );
    }

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

    const paivita = () => piirraGeometriat(kartta, svg, merkitNyt);

    const rajaaKartta = () => {
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
    if (kartta.loaded()) {
      rajaaKartta();
    } else {
      kartta.once("load", rajaaKartta);
    }

    return () => {
      kartta.off("move", paivita);
      kartta.off("resize", paivita);
      merkkiluokat.forEach((merkki) => merkki.remove());
      svg.remove();
      kartta.remove();
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

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      <div
        ref={kehys}
        className={`relative min-h-[18rem] w-full min-w-0 flex-1 overflow-hidden rounded border border-border ${luokka ?? "h-[28rem]"}`}
        role="region"
        aria-label="Hankkeiden sijaintikartta"
      />
      <aside
        className="sm:w-52 sm:shrink-0"
        aria-labelledby="kartta-selite-otsikko"
      >
        <h3 id="kartta-selite-otsikko" className="text-sm font-semibold">
          Vaihe
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {HANKE_VAIHEET.map((vaihe) => {
            const lkm = vaiheLkm?.[vaihe];
            return (
              <li key={vaihe} className="flex items-center gap-2">
                <span
                  className="inline-block size-3 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                  style={{ backgroundColor: VAIHE_VARIT[vaihe] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{VAIHE_NIMET[vaihe]}</span>
                {lkm != null ? (
                  <span className="tabular-nums text-muted" aria-label={`${lkm} hanketta`}>
                    {lkm}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
