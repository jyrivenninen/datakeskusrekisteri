/** Energiateollisuus ry: vuosittainen sähköntuotanto maakunnittain (GWh → TWh). */

import tuotantoRaw from "@/data/sahkontuotanto-maakunnittain.json";
import type { MaakuntaYhteenveto } from "@/lib/maakunta";

type TuotantoTietue = {
  yhteensa_gwh: number;
};

type TuotantoAineisto = {
  vuosi: number;
  yksikko: string;
  lahde_url: string;
  lahde_sivu_url: string;
  lahde_nimi: string;
  huomautus: string;
  maakunnat: Record<string, TuotantoTietue>;
};

const AINEISTO = tuotantoRaw as TuotantoAineisto;

export const ENERGIA_MAAKUNTA_TUOTANTO = {
  vuosi: AINEISTO.vuosi,
  lahde_url: AINEISTO.lahde_url,
  lahde_sivu_url: AINEISTO.lahde_sivu_url,
  lahde_nimi: AINEISTO.lahde_nimi,
  huomautus: AINEISTO.huomautus,
} as const;

export type MaakuntaTuotantoRivi = {
  nimi: string;
  sahkontuotantoTwh: number;
  hankkeetLkm: number;
  sahkonkayttoTwhMin: number;
  sahkonkayttoTwhMax: number;
  sahkonkayttoLkm: number;
};

function gwhTwh(gwh: number): number {
  return gwh / 1000;
}

/** Maakunnan nettotuotanto TWh/a (Energiateollisuus, viimeisin vuosi aineistossa). */
export function haeMaakuntaSahkontuotantoTwh(maakunta: string): number | null {
  const tietue = AINEISTO.maakunnat[maakunta.trim()];
  if (!tietue) return null;
  return gwhTwh(tietue.yhteensa_gwh);
}

/** Kaikki maakunnat tuotantotiedolla, yhdistettynä valittujen hankkeiden yhteenvetoon. */
export function laskeMaakuntaTuotantoRivit(
  hankkeet: MaakuntaYhteenveto[],
): MaakuntaTuotantoRivi[] {
  const hankkeetKartta = new Map(hankkeet.map((yhteenveto) => [yhteenveto.nimi, yhteenveto]));
  return Object.entries(AINEISTO.maakunnat)
    .map(([nimi, tietue]) => {
      const hanke = hankkeetKartta.get(nimi);
      return {
        nimi,
        sahkontuotantoTwh: gwhTwh(tietue.yhteensa_gwh),
        hankkeetLkm: hanke?.hankkeetLkm ?? 0,
        sahkonkayttoTwhMin: hanke?.sahkonkayttoTwhMin ?? 0,
        sahkonkayttoTwhMax: hanke?.sahkonkayttoTwhMax ?? 0,
        sahkonkayttoLkm: hanke?.sahkonkayttoLkm ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.sahkontuotantoTwh !== a.sahkontuotantoTwh) {
        return b.sahkontuotantoTwh - a.sahkontuotantoTwh;
      }
      return a.nimi.localeCompare(b.nimi, "fi");
    });
}
