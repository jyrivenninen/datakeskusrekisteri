import type { MetadataRoute } from "next";
import { haeOgHankkeet } from "@/lib/og-hankkeet";
import { SIVUSTON_OSOITE } from "@/lib/sivuston-metatiedot";

export const revalidate = 3600;

const JULKISET_POLUT = [
  "/",
  "/kartta",
  "/maaraajat",
  "/muutokset",
  "/tietoa",
  "/yhteys",
  "/opas/yva-mielipide",
  "/ilmoitus",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hankkeet = await haeOgHankkeet();
  const sivut = JULKISET_POLUT.map((polku) => ({
    url: polku === "/" ? SIVUSTON_OSOITE : `${SIVUSTON_OSOITE}${polku}`,
  }));
  const hankeSivut = hankkeet.map((hanke) => ({
    url: `${SIVUSTON_OSOITE}/hankkeet/${hanke.id}`,
  }));
  return [...sivut, ...hankeSivut];
}
