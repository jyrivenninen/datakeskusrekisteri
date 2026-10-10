import type { MetadataRoute } from "next";
import { SIVUSTON_OSOITE } from "@/lib/sivuston-metatiedot";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/yllapito", "/kirjaudu"],
    },
    sitemap: `${SIVUSTON_OSOITE}/sitemap.xml`,
  };
}
