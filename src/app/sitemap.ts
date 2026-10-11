import type { MetadataRoute } from "next";
import { kuntaSivuPolku } from "@/lib/kunta-slug";
import { haeOgHankkeet } from "@/lib/og-hankkeet";
import { SIVUSTON_OSOITE } from "@/lib/sivuston-metatiedot";
import { haeKunnatJoissaHankkeita } from "@/lib/supabase/kyselyt";

export const revalidate = 3600;

const JULKISET_POLUT = [
  "/",
  "/kartta",
  "/kunnat",
  "/maaraajat",
  "/muutokset",
  "/tietoa",
  "/yhteys",
  "/opas/yva-mielipide",
  "/ilmoitus",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [hankkeet, { kunnat }] = await Promise.all([
    haeOgHankkeet(),
    haeKunnatJoissaHankkeita(),
  ]);
  const sivut = JULKISET_POLUT.map((polku) => ({
    url: polku === "/" ? SIVUSTON_OSOITE : `${SIVUSTON_OSOITE}${polku}`,
  }));
  const hankeSivut = hankkeet.map((hanke) => ({
    url: `${SIVUSTON_OSOITE}/hankkeet/${hanke.id}`,
  }));
  const kuntaSivut = kunnat.map((kunta) => ({
    url: `${SIVUSTON_OSOITE}${kuntaSivuPolku(kunta.slug)}`,
  }));
  return [...sivut, ...kuntaSivut, ...hankeSivut];
}
