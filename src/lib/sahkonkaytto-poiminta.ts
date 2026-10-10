/** Sähkönkäytön (TWh/a) poiminta asiakirjatekstistä — regex, ei mallia. */

export type SahkonkayttoOsuma = {
  twh_a: number;
  lainaus: string;
  luottamus: "epavarma" | "vahvistettu";
  yksikko: "TWh" | "GWh" | "MWh_vuosi";
  raaka_luku: number;
};

const EPAVARMA_SANAT = /arviolta|noin|karkeasti|yksinkertaistaen|enintään|enimmillään|jopa|n\s*\./i;

/** Suomen numeromuoto → float (välilyönti tuhaterotin, pilkku desimaali). */
export function parseSuomalainenLuku(teksti: string): number | null {
  const siivottu = teksti.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(siivottu);
  return Number.isFinite(n) ? n : null;
}

function kontekstiEpavarma(konteksti: string): boolean {
  return EPAVARMA_SANAT.test(konteksti);
}

function mwIlmanEnergiaa(konteksti: string): boolean {
  if (/\bTWh\b/i.test(konteksti) || /\bGWh\b/i.test(konteksti)) return false;
  if (/MWh\s*\/?\s*vuosi/i.test(konteksti)) return false;
  if (/sähkön\s*kulutus|sähköntarve|vuosikulutus/i.test(konteksti)) return false;
  return /\b\d[\d\s,.]*\s*MW\b/i.test(konteksti);
}

function luoOsuma(
  raaka: number,
  yksikko: SahkonkayttoOsuma["yksikko"],
  konteksti: string,
  lainaus: string,
): SahkonkayttoOsuma | null {
  if (mwIlmanEnergiaa(konteksti)) return null;

  let twh: number;
  switch (yksikko) {
    case "TWh":
      twh = raaka;
      break;
    case "GWh":
      twh = raaka / 1000;
      break;
    case "MWh_vuosi":
      twh = raaka / 1_000_000;
      break;
    default:
      return null;
  }

  if (twh <= 0 || twh > 100) return null;

  return {
    twh_a: Math.round(twh * 1000) / 1000,
    lainaus: lainaus.trim().slice(0, 500),
    luottamus: kontekstiEpavarma(konteksti) ? "epavarma" : "vahvistettu",
    yksikko,
    raaka_luku: raaka,
  };
}

const ENERGIAMALLIT: Array<{
  re: RegExp;
  yksikko: SahkonkayttoOsuma["yksikko"];
  ryhmaLuku: number;
}> = [
  {
    re: /(\d[\d\s]*(?:[,.]\d+)?)\s*TWh\s*\/?\s*a?/gi,
    yksikko: "TWh",
    ryhmaLuku: 1,
  },
  {
    re: /(\d[\d\s]*(?:[,.]\d+)?)\s*GWh\s*\/?\s*a?/gi,
    yksikko: "GWh",
    ryhmaLuku: 1,
  },
  {
    re: /(\d[\d\s]*(?:[,.]\d+)?)\s*MWh\s*\/?\s*vuosi/gi,
    yksikko: "MWh_vuosi",
    ryhmaLuku: 1,
  },
  {
    re: /vuotuinen\s+sähkönkulutus[^.\n]{0,120}?(\d[\d\s]*(?:[,.]\d+)?)\s*GWh/gi,
    yksikko: "GWh",
    ryhmaLuku: 1,
  },
  {
    re: /sähkön\s*kulutus[^.\n]{0,120}?(\d[\d\s]*(?:[,.]\d+)?)\s*GWh/gi,
    yksikko: "GWh",
    ryhmaLuku: 1,
  },
];

/** Paras osuma tekstistä (suurin luotettava TWh). */
export function poimiSahkonkayttoTekstista(teksti: string): SahkonkayttoOsuma | null {
  if (!teksti.trim()) return null;

  const osumat: SahkonkayttoOsuma[] = [];

  for (const { re, yksikko, ryhmaLuku } of ENERGIAMALLIT) {
    re.lastIndex = 0;
    for (const m of teksti.matchAll(re)) {
      const raakaTeksti = m[ryhmaLuku];
      if (!raakaTeksti) continue;
      const raaka = parseSuomalainenLuku(raakaTeksti);
      if (raaka == null) continue;
      const alku = Math.max(0, (m.index ?? 0) - 80);
      const loppu = Math.min(teksti.length, (m.index ?? 0) + m[0].length + 80);
      const konteksti = teksti.slice(alku, loppu);
      const lainaus = teksti.slice(alku, loppu).replace(/\s+/g, " ");
      const osuma = luoOsuma(raaka, yksikko, konteksti, lainaus);
      if (osuma) osumat.push(osuma);
    }
  }

  if (osumat.length === 0) return null;

  osumat.sort((a, b) => {
    if (a.luottamus !== b.luottamus) {
      return a.luottamus === "vahvistettu" ? -1 : 1;
    }
    return b.twh_a - a.twh_a;
  });

  return osumat[0] ?? null;
}

export function tekstissaEnergiavihje(teksti: string): boolean {
  return /GWh|TWh|sähkön\s*kulutus|sähköntarve|vuosikulutus|MWh\s*\/?\s*vuosi/i.test(teksti);
}

/** Ympäristö.fi-sivun HTML: linkit documents/*.pdf */
export function poimiYmparistoPdfUrlit(html: string): string[] {
  const urlit = new Set<string>();
  for (const m of html.matchAll(
    /href="(https?:\/\/www\.ymparisto\.fi\/sites\/default\/files\/documents\/[^"]+\.pdf[^"]*)"/gi,
  )) {
    try {
      urlit.add(decodeURIComponent(m[1]!.replace(/&amp;/g, "&")));
    } catch {
      urlit.add(m[1]!.replace(/&amp;/g, "&"));
    }
  }
  return [...urlit];
}

export type DokumenttiSahkoHaku = { url: string; laji: string | null; otsikko: string };

/** YVA / energia-asiakirjat ensin. */
export function jarjestaDokumentitSahkoHakuun(dokumentit: DokumenttiSahkoHaku[]): DokumenttiSahkoHaku[] {
  function piste(d: DokumenttiSahkoHaku): number {
    let s = 0;
    if (d.laji === "yva_selostus") s += 100;
    else if (d.laji === "yva_ohjelma") s += 90;
    const u = d.url.toLowerCase();
    const o = d.otsikko.toLowerCase();
    if (u.includes("ymparisto.fi") && u.includes(".pdf")) s += 80;
    if (/selostus|yva|ympäristövaikutus/i.test(o) || /selostus|yva/i.test(u)) s += 40;
    if (u.endsWith(".pdf")) s += 20;
    return s;
  }
  return [...dokumentit].sort((a, b) => piste(b) - piste(a));
}
