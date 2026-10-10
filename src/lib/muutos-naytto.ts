import { AVOIN_DATA_LISENSSI, AVOIN_DATA_VERSIO } from "@/lib/avoin-data";
import {
  HANKE_KENTTA_NIMET,
  SIJAINTI_ALUE_TYYPPI_NIMET,
  VAIHE_NIMET,
  onHankeVaihe,
} from "@/lib/naytto";
import type { HankeVaihe, SijaintiAlueTyyppi } from "@/lib/supabase/tietokanta";

export const MUUTOS_SIVU_KOKO = 40;
export const ETUSIVU_RIVEJA = 5;
export const RSS_MAARA = 50;

export type MuutosHanke = {
  id: string;
  nimi: string;
  kunta: string;
  vaihe: HankeVaihe;
};

export type JulkaistuMuutosNakyma = {
  id: string;
  kentta: string;
  uusi_arvo: string | null;
  hyvaksytty_pvm: string;
  lahde_url: string | null;
  lahde_otsikko: string | null;
  hanke: MuutosHanke;
};

export function parsiSivu(arvo: string | undefined): number {
  const n = Number(arvo);
  if (!Number.isInteger(n) || n < 1 || n > 10000) return 1;
  return n;
}

/** Etusivun kapea päivämäärä ilman vuotta: 10.10. */
export function muotoilePvmLyhyt(arvo: string): string {
  const pvm = arvo.slice(0, 10);
  const [, kuukausi, paiva] = pvm.split("-");
  if (!kuukausi || !paiva) return arvo;
  return `${Number(paiva)}.${Number(kuukausi)}.`;
}

export function muutosArvoTeksti(kentta: string, arvo: string): string {
  if (kentta === "vaihe" && onHankeVaihe(arvo)) return VAIHE_NIMET[arvo];
  if (kentta === "sijainti_alue_tyyppi" && arvo in SIJAINTI_ALUE_TYYPPI_NIMET) {
    return SIJAINTI_ALUE_TYYPPI_NIMET[arvo as SijaintiAlueTyyppi];
  }
  return arvo;
}

/** Ensimmäinen rivi ilman päivämäärää: "Vaihe: Kaavoitus" tai "Uusi hanke". */
export function muutosYlarivi(kentta: string, uusiArvo: string | null): string {
  if (kentta === "uusi_hanke") return "Uusi hanke";
  const nimi = HANKE_KENTTA_NIMET[kentta] ?? kentta;
  if (uusiArvo == null || uusiArvo.trim() === "") return `${nimi}: tyhjennetty`;
  return `${nimi}: ${muutosArvoTeksti(kentta, uusiArvo.trim())}`;
}

export function lahdeLinkinNimi(otsikko: string | null, url: string): string {
  const siisti = otsikko?.replace(/\s+/g, " ").trim();
  if (siisti) return siisti;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Lähde";
  }
}

export function yhteensaLause(maara: number, yksi: string, monta: string): string {
  return `Yhteensä ${maara} ${maara === 1 ? yksi : monta}.`;
}

export function sivujaYhteensa(maara: number, koko: number): number {
  if (maara <= 0) return 1;
  return Math.ceil(maara / koko);
}

type ListaPolku = {
  kunta?: string;
  vaihe?: string;
  sivu?: number;
};

function listaPolku(pohja: string, opts: ListaPolku): string {
  const p = new URLSearchParams();
  if (opts.kunta) p.set("kunta", opts.kunta);
  if (opts.vaihe) p.set("vaihe", opts.vaihe);
  if (opts.sivu && opts.sivu > 1) p.set("sivu", String(opts.sivu));
  const qs = p.toString();
  return qs ? `${pohja}?${qs}` : pohja;
}

export function muutoksetPolku(opts: ListaPolku = {}): string {
  return listaPolku("/muutokset", opts);
}

export function maaraajatPolku(opts: ListaPolku = {}): string {
  return listaPolku("/maaraajat", opts);
}

function xmlTeksti(arvo: string): string {
  return arvo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rakennaMuutoksetRss(
  rivit: readonly JulkaistuMuutosNakyma[],
  juuri: string,
): string {
  const kanava = `${juuri}/muutokset`;
  const osat = rivit.map((rivi) => {
    const yla = muutosYlarivi(rivi.kentta, rivi.uusi_arvo);
    const otsikko = `${yla} — ${rivi.hanke.nimi}`;
    const hankeUrl = `${juuri}/hankkeet/${rivi.hanke.id}`;
    const lahde = rivi.lahde_url
      ? ` Lähde: ${lahdeLinkinNimi(rivi.lahde_otsikko, rivi.lahde_url)} ${rivi.lahde_url}`
      : "";
    const kuvaus = `${yla}. ${rivi.hanke.nimi} (${rivi.hanke.kunta}).${lahde}`;
    return [
      "<item>",
      `<title>${xmlTeksti(otsikko)}</title>`,
      `<link>${xmlTeksti(hankeUrl)}</link>`,
      `<guid isPermaLink="false">${xmlTeksti(rivi.id)}</guid>`,
      `<pubDate>${xmlTeksti(new Date(rivi.hyvaksytty_pvm).toUTCString())}</pubDate>`,
      `<description>${xmlTeksti(kuvaus)}</description>`,
      "</item>",
    ].join("");
  });

  const uusin = rivit[0]?.hyvaksytty_pvm;
  const kuva = `${juuri}/muutokset/opengraph-image`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    "<title>Datakeskusrekisteri: viimeksi päivitetty</title>",
    `<link>${xmlTeksti(kanava)}</link>`,
    "<description>Hyväksytyt muutokset julkaistuun hanketietoon.</description>",
    "<language>fi</language>",
    "<image>",
    `<url>${xmlTeksti(kuva)}</url>`,
    "<title>Datakeskusrekisteri: viimeksi päivitetty</title>",
    `<link>${xmlTeksti(kanava)}</link>`,
    "</image>",
    uusin ? `<lastBuildDate>${xmlTeksti(new Date(uusin).toUTCString())}</lastBuildDate>` : "",
    ...osat,
    "</channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("");
}

export function rakennaMuutoksetJson(
  rivit: readonly JulkaistuMuutosNakyma[],
  juuri: string,
) {
  const uusin = rivit.reduce((paras, rivi) => {
    return rivi.hyvaksytty_pvm > paras ? rivi.hyvaksytty_pvm : paras;
  }, rivit[0]?.hyvaksytty_pvm ?? new Date(0).toISOString());

  return {
    versio: AVOIN_DATA_VERSIO,
    lisenssi: AVOIN_DATA_LISENSSI,
    paivitetty_pvm: uusin,
    muutoksia: rivit.length,
    linkit: {
      html: `${juuri}/muutokset`,
      json: `${juuri}/muutokset/json`,
      rss: `${juuri}/muutokset/rss`,
      kuva: `${juuri}/muutokset/opengraph-image`,
    },
    muutokset: rivit.map((rivi) => ({
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
  };
}
