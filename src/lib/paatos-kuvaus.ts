/**
 * Päätöskuvauksen muotoilu: erottaa esityksen/ehdotuksen hyväksynnästä.
 * Lainaus määrää — ei arvata toimielimen aikomuksia.
 */

/** Selkeä esitys toiselle toimielimelle (ei lopullinen hyväksyntä). */
const ESITYS_MERKIT = [
  /\besittää\b/i,
  /\besitti\b/i,
  /\besitettäväksi\b/i,
  /\besittää kaupunginhallitukselle\b/i,
  /\besittää valtuustolle\b/i,
  /\bvie[d]?ään\b.*\bhyväksyttäväksi\b/i,
  /\bhyväksyy esitettäväksi\b/i,
  /\bhyväksyi esitettäväksi\b/i,
];

/** Lopullinen päätös / hyväksyntä. */
const HYVAKSYNTA_MERKIT = [
  /\bhyväksyi\b/i,
  /\bhyväksynyt\b/i,
  /\bhyväksytty\b/i,
  /\behdotus hyväksyttiin\b/i,
  /\bmyönsi\b/i,
  /\bmyöntää\b/i,
  /\bpäätti\b/i,
  /\bpäättää\b/i,
  /\bantoi\b/i,
];

export type PaatosKuvausLuokka = "esitys" | "hyvaksynta" | "epa_selva";

/** Luokittelee lainauksen: esitys toiselle toimielimelle vs. päätös. */
export function luokittelePaatosLainaus(lainaus: string | null | undefined): PaatosKuvausLuokka {
  const t = (lainaus ?? "").trim();
  if (!t) return "epa_selva";

  // "hyväksyi/hyväksyy esitettäväksi" = esitys, vaikka sisältää hyväksy-
  if (/\bhyväksy[aäi]+ esitettäväksi\b/i.test(t)) return "esitys";
  if (/\besitettäväksi\b/i.test(t) && /\besittää\b|\besitti\b/i.test(t)) {
    return "esitys";
  }

  const onEsitys = ESITYS_MERKIT.some((r) => r.test(t));
  const onHyv = HYVAKSYNTA_MERKIT.some((r) => r.test(t));

  // "Päätösehdotus … Päätös: Ehdotus hyväksyttiin" = hyväksyntä
  if (/\behdotus hyväksyttiin\b/i.test(t) || /\bpäätös\b.*\bhyväksy/i.test(t)) {
    if (!/\besitettäväksi\b/i.test(t)) return "hyvaksynta";
  }

  if (onEsitys && !onHyv) return "esitys";
  if (onEsitys && onHyv) {
    if (/\besittää\b/i.test(t) || /\besitettäväksi\b/i.test(t)) return "esitys";
    return "hyvaksynta";
  }
  if (onHyv) return "hyvaksynta";
  return "epa_selva";
}

/**
 * Korjaa kuvauksen verbin lainauksen mukaan.
 * - esitys → ei väitä lopullista "hyväksyi [kaavan]" ilman "esitettäväksi"
 * - hyväksyntä → ei muuteta
 */
export function muotoilePaatosKuvaus(
  kuvaus: string,
  lainaus: string | null | undefined,
): string {
  const luokka = luokittelePaatosLainaus(lainaus);
  const k = kuvaus.trim();
  if (!k || luokka !== "esitys") return k;

  // Jo oikein muotoiltu esitys (sisältää esitettäväksi / esitti / esittää)
  if (
    /\besitettäväksi\b/i.test(k) ||
    /\besitti\b/i.test(k) ||
    /\besittää\b/i.test(k)
  ) {
    return k;
  }

  // "X hyväksyi Y" → "X esitti Y" kun lainaus on esitys eikä kuvaus kerro esitystä
  return k
    .replace(/\bhyväksyi\b/gi, "esitti")
    .replace(/\bhyväksynyt\b/gi, "esittänyt")
    .replace(/\bhyväksyy\b/gi, "esittää");
}

/** Onko kuvaus ristiriidassa lainauksen kanssa (hyväksyi vs esitys). */
export function paatosKuvausRistiriita(
  kuvaus: string,
  lainaus: string | null | undefined,
): boolean {
  const luokka = luokittelePaatosLainaus(lainaus);
  if (luokka !== "esitys") return false;
  // Esitysmuoto ok, jos kuvaus jo kertoo esitettäväksi / esitti / esittää
  if (
    /\besitettäväksi\b/i.test(kuvaus) ||
    /\besitti\b/i.test(kuvaus) ||
    /\besittää\b/i.test(kuvaus)
  ) {
    return false;
  }
  return /\bhyväksyi\b/i.test(kuvaus) || /\bhyväksynyt\b/i.test(kuvaus);
}
