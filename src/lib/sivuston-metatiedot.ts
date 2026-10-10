import type { Metadata } from "next";
import { hankeTehoMw, muotoileLuku, VAIHE_NIMET } from "@/lib/naytto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

export const SIVUSTON_OSOITE = "https://www.datakeskusrekisteri.fi";
export const SIVUSTON_NIMI = "Datakeskusrekisteri";
export const SIVUSTON_OTSIKKO = "Datakeskushankkeiden kansallinen rekisteri";
export const SIVUSTON_KUVAUS =
  "Avoin hanketietokanta ja prosessiopas Suomessa vireillä olevista datakeskushankkeista, niiden etenemisestä ja määräajoista.";

export const OG_LEVEYS = 1200;
export const OG_KORKEUS = 630;

/** Open Graph- ja Twitter-kortti yhdelle sivulle. Kuvan lisää opengraph-image.tsx. */
export function kortinMetatiedot(opts: {
  otsikko: string;
  kuvaus: string;
  polku: string;
  tyyppi?: "website" | "article";
}): Metadata {
  return {
    title: opts.otsikko,
    description: opts.kuvaus,
    openGraph: {
      title: opts.otsikko,
      description: opts.kuvaus,
      url: opts.polku,
      siteName: SIVUSTON_NIMI,
      locale: "fi_FI",
      type: opts.tyyppi ?? "website",
    },
    twitter: {
      card: "summary_large_image",
      title: opts.otsikko,
      description: opts.kuvaus,
    },
    alternates: {
      canonical: opts.polku,
    },
  };
}

export function hankeOgKuvaus(hanke: {
  nimi: string;
  kunta: string;
  vaihe: HankeVaihe;
  teho_mw: number | null;
  it_teho_mw: number | null;
}): string {
  const teho = hankeTehoMw(hanke);
  const osat = [hanke.nimi, hanke.kunta, VAIHE_NIMET[hanke.vaihe]];
  if (teho != null) osat.push(`${muotoileLuku(teho)} MW`);
  return `${osat.join(". ")}.`;
}
