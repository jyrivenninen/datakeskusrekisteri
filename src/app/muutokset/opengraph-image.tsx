import { ImageResponse } from "next/og";
import { OgKortti } from "@/lib/og-kortti";
import { haeOgHankkeet } from "@/lib/og-hankkeet";
import { karttapisteNakyy } from "@/lib/og-suomi";
import { OG_KORKEUS, OG_LEVEYS } from "@/lib/sivuston-metatiedot";

export const alt = "Viimeksi päivitetty ja hankkeiden sijainnit";
export const size = { width: OG_LEVEYS, height: OG_KORKEUS };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Kuva() {
  const hankkeet = await haeOgHankkeet();
  const pisteet = hankkeet.flatMap((hanke) =>
    hanke.lat != null && hanke.lon != null && karttapisteNakyy(hanke.lat, hanke.lon)
      ? [{ lat: hanke.lat, lon: hanke.lon }]
      : [],
  );
  return new ImageResponse(
    (
      <OgKortti
        otsikko="Viimeksi päivitetty"
        kuvaus="Hyväksytyt muutokset julkaistuun hanketietoon. Jokaisella rivillä on lähde."
        alaviite={pisteet.length === 1 ? "1 hanke kartalla" : `${pisteet.length} hanketta kartalla`}
        pisteet={pisteet}
      />
    ),
    { ...size },
  );
}
