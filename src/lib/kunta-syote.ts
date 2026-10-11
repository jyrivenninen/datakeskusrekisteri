import { AVOIN_DATA_LISENSSI, AVOIN_DATA_VERSIO } from "@/lib/avoin-data";
import { kuntaSivuPolku } from "@/lib/kunta-slug";
import {
  lahdeLinkinNimi,
  muutosYlarivi,
  RSS_MAARA,
  type JulkaistuMuutosNakyma,
} from "@/lib/muutos-naytto";
import { MAARAAJA_NIMET } from "@/lib/naytto";
import type { TulevaMaaraaika } from "@/lib/supabase/kyselyt";

export { RSS_MAARA };

export type KuntaSyoteMeta = {
  nimi: string;
  slug: string;
  maakunta: string | null;
};

function xmlTeksti(arvo: string): string {
  return arvo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rakennaKuntaRss(
  kunta: KuntaSyoteMeta,
  muutokset: readonly JulkaistuMuutosNakyma[],
  maaraajat: readonly TulevaMaaraaika[],
  juuri: string,
): string {
  const kanava = `${juuri}${kuntaSivuPolku(kunta.slug)}`;
  const muutosOsat = muutokset.map((rivi) => {
    const yla = muutosYlarivi(rivi.kentta, rivi.uusi_arvo);
    const otsikko = `${yla} — ${rivi.hanke.nimi}`;
    const hankeUrl = `${juuri}/hankkeet/${rivi.hanke.id}`;
    const lahde = rivi.lahde_url
      ? ` Lähde: ${lahdeLinkinNimi(rivi.lahde_otsikko, rivi.lahde_url)} ${rivi.lahde_url}`
      : "";
    const kuvaus = `${yla}. ${rivi.hanke.nimi} (${kunta.nimi}).${lahde}`;
    return [
      "<item>",
      `<title>${xmlTeksti(otsikko)}</title>`,
      `<link>${xmlTeksti(hankeUrl)}</link>`,
      `<guid isPermaLink="false">${xmlTeksti(`muutos:${rivi.id}`)}</guid>`,
      `<pubDate>${xmlTeksti(new Date(rivi.hyvaksytty_pvm).toUTCString())}</pubDate>`,
      `<category>muutos</category>`,
      `<description>${xmlTeksti(kuvaus)}</description>`,
      "</item>",
    ].join("");
  });

  const maaraajaOsat = maaraajat.map((rivi) => {
    const tyyppi = MAARAAJA_NIMET[rivi.tyyppi];
    const otsikko = `${tyyppi} — ${rivi.hanke.nimi}`;
    const hankeUrl = `${juuri}/hankkeet/${rivi.hanke.id}`;
    const kuvaus = `Tuleva määräaika ${rivi.paattyy_pvm}: ${tyyppi}. ${rivi.hanke.nimi} (${kunta.nimi}).`;
    return [
      "<item>",
      `<title>${xmlTeksti(otsikko)}</title>`,
      `<link>${xmlTeksti(hankeUrl)}</link>`,
      `<guid isPermaLink="false">${xmlTeksti(`maaraaika:${rivi.id}`)}</guid>`,
      `<pubDate>${xmlTeksti(new Date(rivi.paattyy_pvm + "T12:00:00Z").toUTCString())}</pubDate>`,
      `<category>maaraaika</category>`,
      `<description>${xmlTeksti(kuvaus)}</description>`,
      "</item>",
    ].join("");
  });

  const uusinMuutos = muutokset[0]?.hyvaksytty_pvm;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    `<title>${xmlTeksti(`Datakeskusrekisteri: ${kunta.nimi}`)}</title>`,
    `<link>${xmlTeksti(kanava)}</link>`,
    `<description>${xmlTeksti(
      `Hyväksytyt hankemuutokset ja tulevat määräajat kunnassa ${kunta.nimi}.`,
    )}</description>`,
    "<language>fi</language>",
    uusinMuutos
      ? `<lastBuildDate>${xmlTeksti(new Date(uusinMuutos).toUTCString())}</lastBuildDate>`
      : "",
    ...muutosOsat,
    ...maaraajaOsat,
    "</channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("");
}

export function rakennaKuntaJson(
  kunta: KuntaSyoteMeta,
  muutokset: readonly JulkaistuMuutosNakyma[],
  maaraajat: readonly TulevaMaaraaika[],
  juuri: string,
) {
  const polku = kuntaSivuPolku(kunta.slug);
  const uusin = muutokset.reduce((paras, rivi) => {
    return rivi.hyvaksytty_pvm > paras ? rivi.hyvaksytty_pvm : paras;
  }, muutokset[0]?.hyvaksytty_pvm ?? new Date(0).toISOString());

  return {
    versio: AVOIN_DATA_VERSIO,
    lisenssi: AVOIN_DATA_LISENSSI,
    paivitetty_pvm: uusin,
    kunta: {
      nimi: kunta.nimi,
      slug: kunta.slug,
      maakunta: kunta.maakunta,
    },
    muutoksia: muutokset.length,
    maaraikoja: maaraajat.length,
    linkit: {
      html: `${juuri}${polku}`,
      json: `${juuri}${polku}/json`,
      rss: `${juuri}${polku}/rss`,
    },
    muutokset: muutokset.map((rivi) => ({
      id: rivi.id,
      hyvaksytty_pvm: rivi.hyvaksytty_pvm,
      kentta: rivi.kentta,
      uusi_arvo: rivi.uusi_arvo,
      hanke: rivi.hanke,
      lahde: rivi.lahde_url
        ? {
            otsikko: rivi.lahde_otsikko,
            url: rivi.lahde_url,
          }
        : null,
      hanke_url: `${juuri}/hankkeet/${rivi.hanke.id}`,
    })),
    maaraajat: maaraajat.map((rivi) => ({
      id: rivi.id,
      tyyppi: rivi.tyyppi,
      alkaa_pvm: rivi.alkaa_pvm,
      paattyy_pvm: rivi.paattyy_pvm,
      hanke: rivi.hanke,
      hanke_url: `${juuri}/hankkeet/${rivi.hanke.id}`,
    })),
  };
}
