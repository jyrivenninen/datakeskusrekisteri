"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map, Marker, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type Karttamerkki = {
  id: string;
  nimi: string;
  lat: number;
  lon: number;
};

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
    for (const merkki of merkit) {
      const el = document.createElement("a");
      el.href = `/hankkeet/${merkki.id}`;
      el.className =
        "block h-4 w-4 rounded-full border-2 border-white bg-link shadow outline-none focus:ring-2 focus:ring-link";
      el.setAttribute("aria-label", merkki.nimi);
      const karttamerkki = new Marker({ element: el })
        .setLngLat([merkki.lon, merkki.lat])
        .addTo(kartta);
      merkkiluokat.push(karttamerkki);
    }

    if (merkit.length === 1) {
      kartta.setCenter([merkit[0].lon, merkit[0].lat]);
      kartta.setZoom(11);
    } else if (merkit.length > 1) {
      const rajat = new LngLatBounds();
      merkit.forEach((merkki) => rajat.extend([merkki.lon, merkki.lat]));
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
