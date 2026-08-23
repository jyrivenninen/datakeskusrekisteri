"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SijaintiAlue, SijaintiViiva } from "@/lib/supabase/tietokanta";

export type Karttamerkki = {
  id: string;
  nimi: string;
  lat?: number;
  lon?: number;
  alue?: SijaintiAlue | null;
  johdot?: { id: string; reitti: SijaintiViiva }[];
};

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

function piirraGeometriat(kartta: Map, svg: SVGSVGElement, merkit: Karttamerkki[]) {
  const kehys = kartta.getContainer();
  const leveys = kehys.clientWidth;
  const korkeus = kehys.clientHeight;
  svg.setAttribute("width", String(leveys));
  svg.setAttribute("height", String(korkeus));
  svg.setAttribute("viewBox", `0 0 ${leveys} ${korkeus}`);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  for (const merkki of merkit) {
    const alue = parsiAlue(merkki.alue);
    const rengas = alue?.coordinates[0];
    if (rengas && rengas.length >= 3) {
      const osat = rengas.map((piste, i) => {
        const xy = kartta.project([piste[0], piste[1]]);
        return `${i === 0 ? "M" : "L"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`;
      });
      const polku = document.createElementNS("http://www.w3.org/2000/svg", "path");
      polku.setAttribute("d", `${osat.join(" ")} Z`);
      polku.setAttribute("fill", "rgba(30, 58, 138, 0.45)");
      polku.setAttribute("stroke", "#1e3a8a");
      polku.setAttribute("stroke-width", "2");
      svg.appendChild(polku);
    }
    for (const johto of merkki.johdot ?? []) {
      const viiva = parsiViiva(johto.reitti);
      if (viiva) piirraViiva(kartta, svg, viiva);
    }
  }
}

export function Kartta({
  merkit,
  luokka,
}: {
  merkit: Karttamerkki[];
  luokka?: string;
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
      if (merkki.lat == null || merkki.lon == null) continue;
      const el = document.createElement("a");
      el.href = `/hankkeet/${merkki.id}`;
      el.className =
        "block h-4 w-4 rounded-full border-2 border-white bg-link shadow outline-none focus:ring-2 focus:ring-link";
      el.setAttribute("aria-label", merkki.nimi);
      merkkiluokat.push(
        new Marker({ element: el }).setLngLat([merkki.lon, merkki.lat]).addTo(kartta),
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
  }, [avain, merkitAvain]);

  if (!avain) {
    return (
      <p className="rounded border border-border bg-surface px-4 py-3 text-sm">
        Karttaa ei näytetä, ennen kuin Maanmittauslaitoksen avoin kartta-avain
        on asetettu.
      </p>
    );
  }

  return (
    <div
      ref={kehys}
      className={`relative w-full overflow-hidden rounded border border-border ${luokka ?? "h-[28rem]"}`}
      role="region"
      aria-label="Hankkeiden sijaintikartta"
    />
  );
}
