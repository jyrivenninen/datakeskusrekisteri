"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SijaintiAlue } from "@/lib/supabase/tietokanta";

export type Karttamerkki = {
  id: string;
  nimi: string;
  lat?: number;
  lon?: number;
  alue?: SijaintiAlue | null;
};

const ALUE_MINZOOM = 12;

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

function laajennaAlueella(rajat: LngLatBounds, alue: SijaintiAlue) {
  for (const rengas of alue.coordinates) {
    for (const piste of rengas) {
      if (piste.length >= 2) rajat.extend([piste[0], piste[1]]);
    }
  }
}

export function Kartta({ merkit }: { merkit: Karttamerkki[] }) {
  const kehys = useRef<HTMLDivElement>(null);
  const avain = process.env.NEXT_PUBLIC_MML_API_AVAIN;

  useEffect(() => {
    if (!kehys.current || !avain) return;

    const kartta = new Map({
      container: kehys.current,
      style: taustakarttaTyyli(avain),
      center: [26.0, 64.5],
      zoom: 4.4,
      attributionControl: { compact: true },
    });
    kartta.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const merkkiluokat: Marker[] = [];

    kartta.on("load", () => {
      const alueet = merkit.filter((merkki) => merkki.alue?.type === "Polygon");
      kartta.addSource("hankealueet", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: alueet.map((merkki) => ({
            type: "Feature" as const,
            properties: { id: merkki.id, nimi: merkki.nimi },
            geometry: merkki.alue as SijaintiAlue,
          })),
        },
      });
      kartta.addLayer({
        id: "hankealue-taytto",
        type: "fill",
        source: "hankealueet",
        minzoom: ALUE_MINZOOM,
        paint: {
          "fill-color": "#1e3a8a",
          "fill-opacity": 0.35,
        },
      });
      kartta.addLayer({
        id: "hankealue-reuna",
        type: "line",
        source: "hankealueet",
        minzoom: ALUE_MINZOOM,
        paint: {
          "line-color": "#1e3a8a",
          "line-width": 2,
        },
      });
      kartta.on("click", "hankealue-taytto", (tapahtuma) => {
        const id = tapahtuma.features?.[0]?.properties?.id;
        if (typeof id === "string") window.location.assign(`/hankkeet/${id}`);
      });
      kartta.on("mouseenter", "hankealue-taytto", () => {
        kartta.getCanvas().style.cursor = "pointer";
      });
      kartta.on("mouseleave", "hankealue-taytto", () => {
        kartta.getCanvas().style.cursor = "";
      });
    });

    for (const merkki of merkit) {
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
    for (const merkki of merkit) {
      if (merkki.lat != null && merkki.lon != null) {
        rajat.extend([merkki.lon, merkki.lat]);
        onRajoja = true;
      }
      if (merkki.alue) {
        laajennaAlueella(rajat, merkki.alue);
        onRajoja = true;
      }
    }
    const yhdellaAlue = merkit.length === 1 && merkit[0]?.alue;
    if (yhdellaAlue) {
      kartta.fitBounds(rajat, { padding: 40, maxZoom: 15 });
    } else if (merkit.length === 1 && merkit[0].lat != null && merkit[0].lon != null) {
      kartta.setCenter([merkit[0].lon, merkit[0].lat]);
      kartta.setZoom(11);
    } else if (onRajoja) {
      kartta.fitBounds(rajat, { padding: 48, maxZoom: 11 });
    }

    return () => {
      merkkiluokat.forEach((merkki) => merkki.remove());
      kartta.remove();
    };
  }, [avain, merkit]);

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
      className="h-80 w-full overflow-hidden rounded border border-border"
      role="region"
      aria-label="Hankkeiden sijaintikartta"
    />
  );
}
