/**
 * Pinta-ala- ja kaava-ala-ehdotusten yksikkövalidointi.
 *
 * - `yksikko = ei_merkitty` → aina epäselvä (koosta riippumatta)
 * - luku > PINTA_ALA_YKSIKKO_RAJA_HA ilman vahvistettua ha → epäselvä
 * - kerrosala (k-m²) ei ole pinta-ala → ei tarjota pinta_ala_ha / kaava_ala_ha
 */

export const PINTA_ALA_YKSIKKO_RAJA_HA = 5000;

export const PINTA_ALA_YKSIKKO_KENTAT = ["pinta_ala_ha", "kaava_ala_ha"] as const;

export type PintaAlaYksikkoVahvistus = "ha" | "m2" | "ei_merkitty";

export function parsiPintaAlaArvo(raaka: string | number | null | undefined): number | null {
  if (raaka == null) return null;
  const s = String(raaka).replace(/[\s\u00a0]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalisoiYksikko(yksikko: string | null | undefined): string {
  return String(yksikko ?? "").trim().toLowerCase();
}

function yksikkoOnHa(yksikko: string): boolean {
  return yksikko === "ha" || yksikko === "hehtaari" || yksikko === "hehtaaria";
}

/**
 * Kerrosala / rakennusoikeus (k-m²) — ei maa-/kaava-ala.
 * Jos `arvo` on annettu, tarkistetaan että juuri se luku liittyy k-m²:ään
 * (sama lainaus voi sisältää sekä m²-pinta-alan että k-m²-rakennusoikeuden).
 */
export function lainausOnKerrosala(
  lainaus: string | null | undefined,
  arvo?: string | number | null,
): boolean {
  if (!lainaus) return false;
  if (arvo != null && String(arvo).trim() !== "") {
    const n = String(arvo).replace(/[\s\u00a0]/g, "").replace(",", ".");
    if (/^\d+(\.\d+)?$/.test(n)) {
      const digitPattern = n
        .replace(/\./g, "[.,]")
        .split("")
        .join("\\s?");
      const kerrosalaNumero = new RegExp(
        `(?:(?:rakennusoikeus|kerrosala)[^\\d]{0,40})?${digitPattern}\\s*k-?\\s*m[²2]|` +
          `${digitPattern}\\s*(?:k-?\\s*m[²2]|kem2)|` +
          `k-?\\s*m[²2][^\\d]{0,15}${digitPattern}`,
        "i",
      );
      return kerrosalaNumero.test(lainaus);
    }
  }
  return /k-?\s*m[²2]|kerrosala|rakennusoikeus|kem2|k-m2/i.test(lainaus);
}

type KenttaTieto = {
  arvo?: string | null;
  yksikko?: string | null;
  lainaus?: string | null;
};

/** Kerrosalaehdotus pinta-/kaava-alakentälle — hylättävä, ei julkaistava. */
export function kerrosalaPintaAlaKentat(
  kentat: Record<string, KenttaTieto> | null | undefined,
): Array<{ kentta: string; arvo: number | null }> {
  if (!kentat) return [];
  const tulos: Array<{ kentta: string; arvo: number | null }> = [];
  for (const kentta of PINTA_ALA_YKSIKKO_KENTAT) {
    const tieto = kentat[kentta];
    if (!tieto) continue;
    if (lainausOnKerrosala(tieto.lainaus, tieto.arvo)) {
      tulos.push({ kentta, arvo: parsiPintaAlaArvo(tieto.arvo) });
    }
  }
  return tulos;
}

export function ehdotuksellaKerrosalaPintaAlaksi(sisalto: {
  kentat?: Record<string, KenttaTieto> | null;
} | null | undefined): boolean {
  return kerrosalaPintaAlaKentat(sisalto?.kentat).length > 0;
}

/**
 * Epäselvä yksikkö: ei_merkitty, tai yli rajan ilman vahvistettua ha.
 * Kerrosalaa ei lasketa tähän — se on erillinen hylkäyssyy.
 */
export function epaselvatPintaAlaKentat(
  kentat: Record<string, KenttaTieto> | null | undefined,
): Array<{ kentta: string; arvo: number }> {
  if (!kentat) return [];
  const tulos: Array<{ kentta: string; arvo: number }> = [];
  for (const kentta of PINTA_ALA_YKSIKKO_KENTAT) {
    const tieto = kentat[kentta];
    if (!tieto) continue;
    if (lainausOnKerrosala(tieto.lainaus, tieto.arvo)) continue;

    const yksikko = normalisoiYksikko(tieto.yksikko);
    if (yksikkoOnHa(yksikko)) continue;

    const n = parsiPintaAlaArvo(tieto.arvo);
    if (n == null) continue;

    const eiMerkitty =
      yksikko === "ei_merkitty" ||
      yksikko === "ei merkitty" ||
      yksikko === "ei-merkitty";
    if (eiMerkitty || n > PINTA_ALA_YKSIKKO_RAJA_HA) {
      tulos.push({ kentta, arvo: n });
    }
  }
  return tulos;
}

export function ehdotuksellaPintaAlaYksikkoEpaselva(sisalto: {
  kentat?: Record<string, KenttaTieto> | null;
} | null | undefined): boolean {
  return epaselvatPintaAlaKentat(sisalto?.kentat).length > 0;
}

/** m² → ha (3 desimaalia). */
export function muunnaM2Ha(m2: number): number {
  return Math.round((m2 / 10_000) * 1000) / 1000;
}
