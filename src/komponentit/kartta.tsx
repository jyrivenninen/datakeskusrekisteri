"use client";

import { useEffect, useRef } from "react";
import {
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SijaintiAlue } from "@/lib/supabase/tietokanta";

export type Karttamerkki = {
  id: string;
  nimi: string;
  lat?: number;
  lon?: number;
  alue?: SijaintiAlue | null;
};

function alueKokoelma(merkit: Karttamerkki[]) {
  return {
    type: "FeatureCollection" as const,
    features: merkit
      .filter((merkki) => merkki.alue?.type === "Polygon" && merkki.alue.coordinates?.length)
      .map((merkki) => ({
        type: "Feature" as const,
        properties: { id: merkki.id, nimi: merkki.nimi },
        geometry: {
          type: "Polygon" as const,
          coordinates: merkki.alue!.coordinates,
        },
      })),
  };
}

function taustakarttaTyyli(avain: string, merkit: Karttamerkki[]): StyleSpecification {
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
      hankealueet: {
        type: "geojson",
        data: alueKokoelma(merkit),
      },
    },
    layers: [
      {
        id: "taustakartta",
        type: "raster",
        source: "taustakartta",
      },
      {
        id: "hankealue-taytto",
        type: "fill",
        source: "hankealueet",
        paint: {
          "fill-color": "#1e3a8a",
          "fill-opacity": 0.4,
        },
      },
      {
        id: "hankealue-reuna",
        type: "line",
        source: "hankealueet",
        paint: {
          "line-color": "#1e3a8a",
          "line-width": 2,
        },
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
  const merkitAvain = JSON.stringify(merkit);

  useEffect(() => {
    if (!kehys.current || !avain) return;
    const merkitNyt: Karttamerkki[] = JSON.parse(merkitAvain);

    const kartta = new Map({
      container: kehys.current,
      style: taustakarttaTyyli(avain, merkitNyt),
      center: [26.0, 64.5],
      zoom: 4.4,
      attributionControl: { compact: true },
    });
    kartta.addControl(new NavigationControl({ showCompass: false }), "top-right");

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
      if (merkki.alue?.coordinates) {
        laajennaAlueella(rajat, merkki.alue);
        onRajoja = true;
      }
    }

    const rajaaKartta = () => {
      const lahde = kartta.getSource("hankealueet") as GeoJSONSource | undefined;
      lahde?.setData(alueKokoelma(merkitNyt));
      const yhdellaAlue = merkitNyt.length === 1 && merkitNyt[0]?.alue;
      if (yhdellaAlue && onRajoja) {
        kartta.fitBounds(rajat, { padding: 36, maxZoom: 16 });
      } else if (merkitNyt.length === 1 && merkitNyt[0].lat != null && merkitNyt[0].lon != null) {
        kartta.setCenter([merkitNyt[0].lon, merkitNyt[0].lat]);
        kartta.setZoom(14);
      } else if (onRajoja) {
        kartta.fitBounds(rajat, { padding: 48, maxZoom: 14 });
      }
    };

    if (kartta.loaded()) {
      rajaaKartta();
    } else {
      kartta.once("load", rajaaKartta);
    }

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

    return () => {
      merkkiluokat.forEach((merkki) => merkki.remove());
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
      className="h-[28rem] w-full overflow-hidden rounded border border-border"
      role="region"
      aria-label="Hankkeiden sijaintikartta"
    />
  );
}
