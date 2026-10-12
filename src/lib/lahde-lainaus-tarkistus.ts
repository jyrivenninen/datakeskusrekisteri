/**
 * Koneellinen tarkistus: esiintyykö kentän arvo lainauksessa.
 * Vaihe jätetään ihmisen tarkistettavaksi.
 */

export const TUNNISTE_KENTAT = [
  "kaavatunnus",
  "kortteli",
  "kiinteistotunnus",
] as const;

export const NUMEERISET_KENTAT = [
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
] as const;

export type LainausTarkistusTulos =
  | { tulos: "ok" }
  | { tulos: "ohita"; syy: "vaihe" | "tyhja_arvo" | "tuntematon_kentta" }
  | { tulos: "ei_tue"; syy: string };

/** Poistaa välilyönnit; pilkku → piste. */
export function normalisoiLukuMerkkijono(s: string): string {
  return s.replace(/\s+/g, "").replace(/,/g, ".");
}

/** Mahdolliset lukumuodot, joilla arvo voi esiintyä lainauksessa. */
export function lukuVariantit(arvo: string): string[] {
  const n = normalisoiLukuMerkkijono(arvo.trim());
  if (!n) return [];
  const out = new Set<string>([n]);
  if (/\.\d*0+$/.test(n)) {
    out.add(n.replace(/\.?0+$/, "") || "0");
  }
  const num = Number(n);
  if (Number.isFinite(num)) {
    out.add(String(num));
    out.add(String(num).replace(".", ","));
    if (Number.isInteger(num)) {
      out.add(String(num));
    }
  }
  return [...out].filter(Boolean);
}

export function lukuEsiintyyLainauksessa(
  arvo: string,
  lainaus: string,
): boolean {
  const L = normalisoiLukuMerkkijono(lainaus);
  if (!L) return false;
  return lukuVariantit(arvo).some((v) => {
    const nv = normalisoiLukuMerkkijono(v);
    return nv.length > 0 && L.includes(nv);
  });
}

/** Poistaa kaava-/asemakaava-etuliitteet vertailua varten. */
export function normalisoiKaavatunnus(s: string): string {
  return s
    .trim()
    .replace(
      /^(asema\s*)?kaava(\s*(nro|numero|tunnus|n:o))?[\s:.–-]*/i,
      "",
    )
    .replace(/^(nro|numero|n:o)[\s:.–-]*/i, "")
    .trim();
}

export function kaavatunnusEsiintyyLainauksessa(
  arvo: string,
  lainaus: string,
): boolean {
  const a = arvo.trim();
  if (!a) return false;
  if (lainaus.includes(a)) return true;
  const na = normalisoiKaavatunnus(a);
  if (!na) return false;
  if (lainaus.includes(na)) return true;
  // lainaus "kaavanro 553" → normalisoitu sisältää 553
  const nl = normalisoiKaavatunnus(lainaus);
  return nl.includes(na) || lainaus.toLowerCase().includes(na.toLowerCase());
}

/** Pilkoo "2516, 2517, 2518" tai yksittäisen "2319-1". */
export function kortteliOsat(arvo: string): string[] {
  return arvo
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * "korttelin 2319 tontin 1" / "kortteli 2319 tontti 1" → "2319-1".
 * "K2319T1" → "2319-1".
 */
export function poimiKortteliTonttiMuodot(lainaus: string): Set<string> {
  const out = new Set<string>();
  const re =
    /kortteli(?:n|ssa|sta)?\s*(\d+)\s*(?:[:,–-]?\s*)?(?:tont(?:in|ti|tia|in)?)\s*(\d+)/gi;
  for (const m of lainaus.matchAll(re)) {
    out.add(`${m[1]}-${m[2]}`);
    out.add(m[1]);
  }
  const kRe = /\bK\s*(\d+)\s*T\s*(\d+)\b/gi;
  for (const m of lainaus.matchAll(kRe)) {
    out.add(`${m[1]}-${m[2]}`);
    out.add(m[1]);
  }
  return out;
}

export function kortteliEsiintyyLainauksessa(
  arvo: string,
  lainaus: string,
): boolean {
  const osat = kortteliOsat(arvo);
  if (osat.length === 0) return false;
  const poimitut = poimiKortteliTonttiMuodot(lainaus);
  return osat.every((osa) => {
    if (lainaus.includes(osa)) return true;
    if (poimitut.has(osa)) return true;
    const m = /^(\d+)-(\d+)$/.exec(osa);
    if (m) {
      if (poimitut.has(`${m[1]}-${m[2]}`)) return true;
      const re = new RegExp(
        `kortteli(?:n|ssa|sta)?\\s*${m[1]}\\s*(?:[:,–-]?\\s*)?(?:tont(?:in|ti|tia|in)?)\\s*${m[2]}`,
        "i",
      );
      if (re.test(lainaus)) return true;
      const kRe = new RegExp(`K\\s*${m[1]}\\s*T\\s*${m[2]}`, "i");
      if (kRe.test(lainaus)) return true;
    }
    return false;
  });
}

/** Yleinen tunniste (kiinteistötunnus ym.): sellaisenaan. */
export function tunnisteEsiintyyLainauksessa(
  arvo: string,
  lainaus: string,
): boolean {
  const a = arvo.trim();
  if (!a) return false;
  return lainaus.includes(a);
}

export function tarkistaArvoLainauksessa(
  kentta: string,
  arvo: string | null | undefined,
  lainaus: string | null | undefined,
): LainausTarkistusTulos {
  if (kentta === "vaihe") {
    return { tulos: "ohita", syy: "vaihe" };
  }
  const a = (arvo ?? "").trim();
  const l = lainaus ?? "";
  if (!a) return { tulos: "ohita", syy: "tyhja_arvo" };

  if (kentta === "kortteli") {
    if (kortteliEsiintyyLainauksessa(a, l)) return { tulos: "ok" };
    return {
      tulos: "ei_tue",
      syy: `Kortteli «${a}» ei esiinny lainauksessa (eikä X-Y / kortteli–tontti -muotona).`,
    };
  }

  if (kentta === "kaavatunnus") {
    if (kaavatunnusEsiintyyLainauksessa(a, l)) return { tulos: "ok" };
    return {
      tulos: "ei_tue",
      syy: `Kaavatunnus «${a}» ei esiinny lainauksessa (etuliitteet poistettu).`,
    };
  }

  if (kentta === "kiinteistotunnus") {
    if (tunnisteEsiintyyLainauksessa(a, l)) return { tulos: "ok" };
    return {
      tulos: "ei_tue",
      syy: `Tunniste «${a}» ei esiinny lainauksessa sellaisenaan.`,
    };
  }

  if ((NUMEERISET_KENTAT as readonly string[]).includes(kentta)) {
    if (lukuEsiintyyLainauksessa(a, l)) return { tulos: "ok" };
    return {
      tulos: "ei_tue",
      syy: `Luku «${a}» ei esiinny lainauksessa normalisoituna.`,
    };
  }

  return { tulos: "ohita", syy: "tuntematon_kentta" };
}
