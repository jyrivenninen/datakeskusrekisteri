/**
 * Numeeristen hankekenttien lähdelukujen vertailu ylläpidon jonoon.
 * Poiminta on yksikköihin sidottu, jotta MW ei sekoitu hehtaareihin.
 */

export const LUVUN_RISTIRIITA_KENTAT = [
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "kaava_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
  "generaattori_yksikkoteho_mwe",
  "diesel_vuosikulutus_maara",
  "varavoima_paastot_t_co2e",
  "polttoainevarasto_maara",
] as const;

export type LuvunRistiriitaKentta = (typeof LUVUN_RISTIRIITA_KENTAT)[number];

export type LahdeLuku = {
  lahde_id: string;
  lahde_url: string;
  lainaus: string;
  luottamus: string;
  merkitty: string;
  tila: string;
  /** Poimittu luku kentän yksikössä (ha, MW, …). */
  luku: number;
  /** Alkuperäinen poiminta ennen muuntoa, näyttöön. */
  luku_naytto: string;
};

export type LuvunRistiriitaRivi = {
  avain: string;
  taulu: "hankkeet";
  rivi_id: string;
  hanke_nimi: string;
  hanke_kunta: string;
  kentta: LuvunRistiriitaKentta;
  nykyinen_arvo: number | null;
  lahteet: LahdeLuku[];
  /** ristiriita = eri luvut; kaava_epailys = kaava-ala pinta_ala_ha-kentässä */
  syy?: "ristiriita" | "kaava_epailys";
};

const KAAVA_LAINAUS_RE =
  /(asemakaava|yleiskaava|kaava[- ]?alue|kaavoitett|suunnittelualue|kaavoitusalue|korttelialue)/i;

export function lainausViittaaKaavaAlaan(lainaus: string): boolean {
  if (!lainaus.trim()) return false;
  if (/kaavaillaan/i.test(lainaus)) return false;
  return KAAVA_LAINAUS_RE.test(lainaus);
}

function normalisoiDesimaali(raaka: string): number {
  const siivottu = raaka.replace(/[\s\u00a0]/g, "");
  // Englannin tuhaterotin: 800,000
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(siivottu)) {
    return Number(siivottu.replace(/,/g, ""));
  }
  return Number(siivottu.replace(",", "."));
}

/** Poimii pinta-alan hehtaareina (ha / m² → ha). */
export function poimiPintaAlaHa(lainaus: string): Array<{ luku: number; naytto: string }> {
  const tulos: Array<{ luku: number; naytto: string }> = [];
  const ha = [
    ...lainaus.matchAll(
      /([0-9]+(?:[.,][0-9]+)?)\s*-?\s*(?:ha\b|hehtaar|hectare)/gi,
    ),
  ];
  for (const m of ha) {
    const n = normalisoiDesimaali(m[1]!);
    if (Number.isFinite(n) && n > 0) tulos.push({ luku: n, naytto: `${n} ha` });
  }
  const m2 = [
    ...lainaus.matchAll(
      /([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:[ \u00a0][0-9]{3})*(?:[.,][0-9]+)?)\s*(?:m²|m2|sqm|sq\.?\s*m|square\s*met)/gi,
    ),
  ];
  for (const m of m2) {
    const n = normalisoiDesimaali(m[1]!);
    if (!Number.isFinite(n) || n <= 0) continue;
    // neliömetrit → ha; alle 100 m² jätetään pois (ei alue)
    if (n >= 100) {
      const haArvo = Math.round((n / 10000) * 1000) / 1000;
      tulos.push({ luku: haArvo, naytto: `${n} m² (${haArvo} ha)` });
    }
  }
  return tulos;
}

export function poimiTehoMw(lainaus: string): Array<{ luku: number; naytto: string }> {
  const tulos: Array<{ luku: number; naytto: string }> = [];
  for (const m of lainaus.matchAll(
    /([0-9]+(?:[.,][0-9]+)?)\s*[–\-—]\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:MW|megawatt)/gi,
  )) {
    for (const raaka of [m[1]!, m[2]!]) {
      const n = normalisoiDesimaali(raaka);
      if (Number.isFinite(n) && n > 0) tulos.push({ luku: n, naytto: `${n} MW` });
    }
  }
  for (const m of lainaus.matchAll(
    /([0-9]+(?:[.,][0-9]+)?)\s*(?:MW|megawatt)/gi,
  )) {
    const n = normalisoiDesimaali(m[1]!);
    if (Number.isFinite(n) && n > 0) tulos.push({ luku: n, naytto: `${n} MW` });
  }
  const nayhty = new Set<number>();
  return tulos.filter((rivi) => {
    if (nayhty.has(rivi.luku)) return false;
    nayhty.add(rivi.luku);
    return true;
  });
}

export function poimiTwh(lainaus: string): Array<{ luku: number; naytto: string }> {
  const tulos: Array<{ luku: number; naytto: string }> = [];
  for (const m of lainaus.matchAll(
    /([0-9]+(?:[.,][0-9]+)?)\s*(?:TWh)/gi,
  )) {
    const n = normalisoiDesimaali(m[1]!);
    if (Number.isFinite(n) && n > 0) tulos.push({ luku: n, naytto: `${n} TWh` });
  }
  return tulos;
}

export function poimiKokonaisluku(lainaus: string): Array<{ luku: number; naytto: string }> {
  const tulos: Array<{ luku: number; naytto: string }> = [];
  for (const m of lainaus.matchAll(
    /\b([0-9]{1,4})\s*(?:kpl|generaattor|yksikkö|diesel|kappale)/gi,
  )) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) tulos.push({ luku: n, naytto: String(n) });
  }
  return tulos;
}

export function poimiKentanLuvut(
  kentta: string,
  lainaus: string,
): Array<{ luku: number; naytto: string }> {
  if (kentta === "pinta_ala_ha" || kentta === "kaava_ala_ha") {
    return poimiPintaAlaHa(lainaus);
  }
  if (
    kentta === "teho_mw" ||
    kentta === "it_teho_mw" ||
    kentta === "generaattori_polttoaineteho_mw" ||
    kentta === "generaattori_yksikkoteho_mwe"
  ) {
    return poimiTehoMw(lainaus);
  }
  if (kentta === "sahkonkaytto_twh_a") return poimiTwh(lainaus);
  if (
    kentta === "generaattorit_lkm" ||
    kentta === "generaattorit_kaytossa_max_lkm"
  ) {
    return poimiKokonaisluku(lainaus);
  }
  // diesel, päästöt, polttoainevarasto: suurin järkevä luku ilman vuotta
  const tulos: Array<{ luku: number; naytto: string }> = [];
  for (const m of lainaus.matchAll(/([0-9]+(?:[.,][0-9]+)?)/g)) {
    const n = normalisoiDesimaali(m[1]!);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n >= 1900 && n <= 2100) continue;
    tulos.push({ luku: n, naytto: String(n) });
  }
  return tulos;
}

/** Valitse lähteen edustava luku (suurin poimittu). */
export function edustavaLuku(
  poimitut: Array<{ luku: number; naytto: string }>,
): { luku: number; naytto: string } | null {
  if (poimitut.length === 0) return null;
  return poimitut.reduce((a, b) => (b.luku > a.luku ? b : a));
}

export type KenttaLahdeRivi = {
  id: string;
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  lainaus: string | null;
  luottamus: string;
  merkitty: string;
  tila: string | null;
};

export type HankeLukuRivi = {
  id: string;
  nimi: string;
  kunta: string;
  teho_mw: number | null;
  it_teho_mw: number | null;
  pinta_ala_ha: number | null;
  kaava_ala_ha: number | null;
  sahkonkaytto_twh_a: number | null;
  generaattorit_lkm: number | null;
  generaattorit_kaytossa_max_lkm: number | null;
  generaattori_polttoaineteho_mw: number | null;
  generaattori_yksikkoteho_mwe: number | null;
  diesel_vuosikulutus_maara: number | null;
  varavoima_paastot_t_co2e: number | null;
};

function hankeKenttaArvo(
  hanke: HankeLukuRivi,
  kentta: LuvunRistiriitaKentta,
): number | null {
  const arvo = (hanke as Record<string, unknown>)[kentta];
  if (arvo == null || arvo === "") return null;
  const n = Number(arvo);
  return Number.isFinite(n) ? n : null;
}

export function rakennaLuvunRistiriitaRivit(
  lahteet: KenttaLahdeRivi[],
  hankkeet: HankeLukuRivi[],
  kasitellytAvaimet: Set<string>,
): LuvunRistiriitaRivi[] {
  const hankeKartta = new Map(hankkeet.map((h) => [h.id, h]));
  type Ryhma = {
    taulu: string;
    rivi_id: string;
    kentta: LuvunRistiriitaKentta;
    lahteet: LahdeLuku[];
  };
  const ryhmat = new Map<string, Ryhma>();

  for (const lahde of lahteet) {
    if (lahde.taulu !== "hankkeet") continue;
    if (lahde.tila === "korvattu" || lahde.tila === "ei_tue") continue;
    if (!(LUVUN_RISTIRIITA_KENTAT as readonly string[]).includes(lahde.kentta)) {
      continue;
    }
    if (lahde.luottamus === "ristiriitainen") continue;
    if (!lahde.lainaus?.trim()) continue;
    const kentta = lahde.kentta as LuvunRistiriitaKentta;
    const poimitut = poimiKentanLuvut(kentta, lahde.lainaus);
    const edustava = edustavaLuku(poimitut);
    if (!edustava) continue;
    const avain = `${lahde.taulu}:${lahde.rivi_id}:${kentta}`;
    let ryhma = ryhmat.get(avain);
    if (!ryhma) {
      ryhma = { taulu: lahde.taulu, rivi_id: lahde.rivi_id, kentta, lahteet: [] };
      ryhmat.set(avain, ryhma);
    }
    ryhma.lahteet.push({
      lahde_id: lahde.id,
      lahde_url: lahde.lahde_url,
      lainaus: lahde.lainaus,
      luottamus: lahde.luottamus,
      merkitty: lahde.merkitty,
      tila: lahde.tila ?? "voimassa",
      luku: edustava.luku,
      luku_naytto: edustava.naytto,
    });
  }

  const rivit: LuvunRistiriitaRivi[] = [];
  const lisatyt = new Set<string>();
  for (const [avain, ryhma] of ryhmat) {
    if (kasitellytAvaimet.has(avain)) continue;
    if (ryhma.lahteet.length < 2) continue;
    const luvut = new Set(ryhma.lahteet.map((l) => l.luku));
    if (luvut.size < 2) continue;
    const hanke = hankeKartta.get(ryhma.rivi_id);
    if (!hanke) continue;
    rivit.push({
      avain,
      taulu: "hankkeet",
      rivi_id: ryhma.rivi_id,
      hanke_nimi: hanke.nimi,
      hanke_kunta: hanke.kunta,
      kentta: ryhma.kentta,
      nykyinen_arvo: hankeKenttaArvo(hanke, ryhma.kentta),
      lahteet: ryhma.lahteet.sort((a, b) => a.luku - b.luku),
      syy: "ristiriita",
    });
    lisatyt.add(avain);
  }

  // Kaava-ala pinta_ala_ha-kentässä (yksikin lähde riittää), kun kaava_ala_ha tyhjä.
  for (const [avain, ryhma] of ryhmat) {
    if (ryhma.kentta !== "pinta_ala_ha") continue;
    if (kasitellytAvaimet.has(avain) || lisatyt.has(avain)) continue;
    const hanke = hankeKartta.get(ryhma.rivi_id);
    if (!hanke) continue;
    if (hanke.pinta_ala_ha == null || hanke.kaava_ala_ha != null) continue;
    const kaavaLahteet = ryhma.lahteet.filter((l) => lainausViittaaKaavaAlaan(l.lainaus));
    if (kaavaLahteet.length === 0) continue;
    rivit.push({
      avain,
      taulu: "hankkeet",
      rivi_id: ryhma.rivi_id,
      hanke_nimi: hanke.nimi,
      hanke_kunta: hanke.kunta,
      kentta: "pinta_ala_ha",
      nykyinen_arvo: hankeKenttaArvo(hanke, "pinta_ala_ha"),
      lahteet: kaavaLahteet.sort((a, b) => a.luku - b.luku),
      syy: "kaava_epailys",
    });
  }

  rivit.sort((a, b) => {
    if (a.kentta !== b.kentta) {
      // pinta_ala ensin
      if (a.kentta === "pinta_ala_ha") return -1;
      if (b.kentta === "pinta_ala_ha") return 1;
      return a.kentta.localeCompare(b.kentta, "fi");
    }
    // kaava-epäilyt ristiriitojen jälkeen saman kentän sisällä
    if (a.syy !== b.syy) {
      if (a.syy === "ristiriita") return -1;
      if (b.syy === "ristiriita") return 1;
    }
    return a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
  });
  return rivit;
}
