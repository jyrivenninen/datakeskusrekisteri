import { ImageResponse } from "next/og";
import { OgKortti } from "@/lib/og-kortti";
import { haeOgHanke, haeOgHankkeet } from "@/lib/og-hankkeet";
import { karttapisteNakyy } from "@/lib/og-suomi";
import { muotoileLuku, VAIHE_NIMET } from "@/lib/naytto";
import { OG_KORKEUS, OG_LEVEYS, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const alt = "Hankkeen sijainti Suomen kartalla";
export const size = { width: OG_LEVEYS, height: OG_KORKEUS };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Kuva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [hanke, kaikki] = await Promise.all([haeOgHanke(id), haeOgHankkeet()]);
  const pisteet = kaikki.flatMap((rivi) =>
    rivi.lat != null && rivi.lon != null && karttapisteNakyy(rivi.lat, rivi.lon)
      ? [{ lat: rivi.lat, lon: rivi.lon }]
      : [],
  );
  const korostus =
    hanke?.lat != null && hanke.lon != null ? { lat: hanke.lat, lon: hanke.lon } : null;
  const kuvaus = hanke
    ? [
        hanke.kunta,
        VAIHE_NIMET[hanke.vaihe],
        hanke.tehoMw != null ? `${muotoileLuku(hanke.tehoMw)} MW` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Hanketta ei löytynyt.";

  return new ImageResponse(
    (
      <OgKortti
        otsikko={hanke?.nimi ?? "Hanketta ei löytynyt"}
        kuvaus={kuvaus}
        alaviite={SIVUSTON_OTSIKKO}
        pisteet={pisteet}
        korostus={korostus}
      />
    ),
    { ...size },
  );
}
