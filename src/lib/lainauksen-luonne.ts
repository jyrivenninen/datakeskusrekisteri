/**
 * Lainauksen rooli asiakirjassa. Heuristiikka otoslaskentaan;
 * tallennettu arvo kentta_lahteet.lainauksen_luonne.
 */

export const LAINAUKSEN_LUONTEET = [
  "paatososa",
  "esitys",
  "valmisteluteksti",
  "muu",
] as const;

export type LainauksenLuonne = (typeof LAINAUKSEN_LUONTEET)[number];

export const LAINAUKSEN_LUONNE_NIMET: Record<LainauksenLuonne, string> = {
  paatososa: "Päätösosa",
  esitys: "Esitys",
  valmisteluteksti: "Valmisteluteksti",
  muu: "Muu",
};

/** Heuristiikka lainauksen tekstistä (ei korvaa ihmisen merkintää). */
export function luokitteleLainauksenLuonne(
  lainaus: string | null | undefined,
): LainauksenLuonne | null {
  const t = (lainaus ?? "").trim();
  if (!t) return null;

  // Hyväksytty päätösehdotus = päätösosa, ei esitys
  if (
    /\bpäätösehdotus hyväksyttiin\b/i.test(t) ||
    /\behdotus hyväksyttiin\b/i.test(t)
  ) {
    return "paatososa";
  }

  if (/\bhyväksy[aäi]+ esitettäväksi\b/i.test(t)) return "esitys";
  if (/\besittää\b/i.test(t) && /\bkaupunginhallitukselle|valtuustolle\b/i.test(t)) {
    return "esitys";
  }
  if (/\besitettäväksi\b/i.test(t)) return "esitys";
  // Pelkkä "päätösehdotus" ilman hyväksyntää → esitys/ehdotus
  if (/\bpäätösehdotus\b/i.test(t) && !/\bhyväksy/i.test(t)) {
    return "esitys";
  }

  if (
    /\bvalmistelija\b/i.test(t) ||
    /\btaustaa\b/i.test(t) ||
    /\bnäkymät\b/i.test(t) ||
    /\byhteenvetona voidaan todeta\b/i.test(t) ||
    /\btyypillisesti\b/i.test(t)
  ) {
    return "valmisteluteksti";
  }

  if (
    /\bpäättää\b/i.test(t) ||
    /\bpäätti\b/i.test(t) ||
    /\bhyväksyttiin\b/i.test(t) ||
    /\behdotus hyväksyttiin\b/i.test(t) ||
    /\bmyönsi\b/i.test(t) ||
    /\bmyöntää\b/i.test(t)
  ) {
    return "paatososa";
  }

  return null;
}
