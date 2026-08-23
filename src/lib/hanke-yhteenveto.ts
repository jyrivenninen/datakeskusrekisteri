import { hankeTehoMw } from "@/lib/naytto";
import type { Hanke } from "@/lib/supabase/tietokanta";
import {
  SUOMI_SAHKON_TUOTANTO_2024,
  SUOMI_SAHKONTUOTANTO_CO2_2024,
  twhKertoimellaCo2T,
} from "@/lib/suomi-energia";

export type HankeYhteenvetoSyote = Pick<
  Hanke,
  | "kunta"
  | "vaihe"
  | "teho_mw"
  | "it_teho_mw"
  | "pinta_ala_ha"
  | "sahkonkaytto_twh_a"
  | "generaattorit_lkm"
>;

export type HankeYhteenveto = {
  hankeita: number;
  kuntia: number;
  sahkonkayttoTwh: number;
  sahkonkayttoMerkittyLkm: number;
  osuusSuomenTuotannosta: number | null;
  co2T: number | null;
  tehoMw: number;
  tehoMerkittyLkm: number;
  pintaAlaHa: number;
  pintaAlaMerkittyLkm: number;
  generaattoritLkm: number;
  generaattoritMerkittyLkm: number;
  rakenteillaTaiToiminnassaLkm: number;
};

function luku(arvo: number | string | null | undefined): number | null {
  if (arvo == null) return null;
  const n = typeof arvo === "number" ? arvo : Number(arvo);
  return Number.isFinite(n) ? n : null;
}

function summaJaKattavuus(
  hankkeet: readonly HankeYhteenvetoSyote[],
  arvo: (hanke: HankeYhteenvetoSyote) => number | null,
): { summa: number; merkitty: number } {
  let summa = 0;
  let merkitty = 0;
  for (const hanke of hankkeet) {
    const n = arvo(hanke);
    if (n == null) continue;
    summa += n;
    merkitty += 1;
  }
  return { summa, merkitty };
}

export function laskeHankeYhteenveto(
  hankkeet: readonly HankeYhteenvetoSyote[],
): HankeYhteenveto {
  const sahko = summaJaKattavuus(hankkeet, (h) => luku(h.sahkonkaytto_twh_a));
  const teho = summaJaKattavuus(hankkeet, (h) => hankeTehoMw(h));
  const pinta = summaJaKattavuus(hankkeet, (h) => luku(h.pinta_ala_ha));
  const generaattorit = summaJaKattavuus(hankkeet, (h) => luku(h.generaattorit_lkm));
  const kuntia = new Set(hankkeet.map((h) => h.kunta).filter(Boolean)).size;
  const osuus =
    sahko.merkitty > 0 ? sahko.summa / SUOMI_SAHKON_TUOTANTO_2024.twh : null;
  const co2T =
    sahko.merkitty > 0
      ? twhKertoimellaCo2T(sahko.summa, SUOMI_SAHKONTUOTANTO_CO2_2024.g_co2_kwh)
      : null;

  return {
    hankeita: hankkeet.length,
    kuntia,
    sahkonkayttoTwh: sahko.summa,
    sahkonkayttoMerkittyLkm: sahko.merkitty,
    osuusSuomenTuotannosta: osuus,
    co2T,
    tehoMw: teho.summa,
    tehoMerkittyLkm: teho.merkitty,
    pintaAlaHa: pinta.summa,
    pintaAlaMerkittyLkm: pinta.merkitty,
    generaattoritLkm: generaattorit.summa,
    generaattoritMerkittyLkm: generaattorit.merkitty,
    rakenteillaTaiToiminnassaLkm: hankkeet.filter(
      (h) => h.vaihe === "rakenteilla" || h.vaihe === "toiminnassa",
    ).length,
  };
}
