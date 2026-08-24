import { hankeVaihtelvalit, type Vaihtelvali } from "@/lib/hanke-vaihtelvali";
import type { Hanke, HankeVaihtoehto } from "@/lib/supabase/tietokanta";
import {
  SUOMI_SAHKON_TUOTANTO_2024,
  SUOMI_SAHKONTUOTANTO_CO2_2024,
  twhKertoimellaCo2T,
} from "@/lib/suomi-energia";

export type HankeYhteenvetoSyote = Pick<
  Hanke,
  | "id"
  | "kunta"
  | "vaihe"
  | "teho_mw"
  | "it_teho_mw"
  | "pinta_ala_ha"
  | "sahkonkaytto_twh_a"
  | "generaattorit_lkm"
> & {
  vaihtoehdot?: readonly Pick<
    HankeVaihtoehto,
    | "tunnus"
    | "it_teho_mw"
    | "teho_mw"
    | "pinta_ala_ha"
    | "sahkonkaytto_twh_a"
    | "generaattorit_lkm"
  >[];
};

export type HankeYhteenveto = {
  hankeita: number;
  kuntia: number;
  sahkonkayttoTwhMin: number;
  sahkonkayttoTwhMax: number;
  sahkonkayttoMerkittyLkm: number;
  osuusSuomenTuotannostaMin: number | null;
  osuusSuomenTuotannostaMax: number | null;
  co2TMin: number | null;
  co2TMax: number | null;
  tehoMwMin: number;
  tehoMwMax: number;
  tehoMerkittyLkm: number;
  pintaAlaHaMin: number;
  pintaAlaHaMax: number;
  pintaAlaMerkittyLkm: number;
  generaattoritLkmMin: number;
  generaattoritLkmMax: number;
  generaattoritMerkittyLkm: number;
  rakenteillaTaiToiminnassaLkm: number;
};

function summaaValit(valit: readonly (Vaihtelvali | null)[]): {
  min: number;
  max: number;
  merkitty: number;
} {
  let min = 0;
  let max = 0;
  let merkitty = 0;
  for (const vali of valit) {
    if (!vali) continue;
    min += vali.min;
    max += vali.max;
    merkitty += 1;
  }
  return { min, max, merkitty };
}

export function laskeHankeYhteenveto(
  hankkeet: readonly HankeYhteenvetoSyote[],
): HankeYhteenveto {
  const valit = hankkeet.map((hanke) => hankeVaihtelvalit(hanke, hanke.vaihtoehdot ?? []));
  const sahko = summaaValit(valit.map((v) => v.sahkonkaytto));
  const teho = summaaValit(valit.map((v) => v.teho));
  const pinta = summaaValit(valit.map((v) => v.pintaAla));
  const generaattorit = summaaValit(valit.map((v) => v.generaattorit));
  const kuntia = new Set(hankkeet.map((hanke) => hanke.kunta).filter(Boolean)).size;
  const osuusMin = sahko.merkitty > 0 ? sahko.min / SUOMI_SAHKON_TUOTANTO_2024.twh : null;
  const osuusMax = sahko.merkitty > 0 ? sahko.max / SUOMI_SAHKON_TUOTANTO_2024.twh : null;
  const co2TMin =
    sahko.merkitty > 0
      ? twhKertoimellaCo2T(sahko.min, SUOMI_SAHKONTUOTANTO_CO2_2024.g_co2_kwh)
      : null;
  const co2TMax =
    sahko.merkitty > 0
      ? twhKertoimellaCo2T(sahko.max, SUOMI_SAHKONTUOTANTO_CO2_2024.g_co2_kwh)
      : null;

  return {
    hankeita: hankkeet.length,
    kuntia,
    sahkonkayttoTwhMin: sahko.min,
    sahkonkayttoTwhMax: sahko.max,
    sahkonkayttoMerkittyLkm: sahko.merkitty,
    osuusSuomenTuotannostaMin: osuusMin,
    osuusSuomenTuotannostaMax: osuusMax,
    co2TMin,
    co2TMax,
    tehoMwMin: teho.min,
    tehoMwMax: teho.max,
    tehoMerkittyLkm: teho.merkitty,
    pintaAlaHaMin: pinta.min,
    pintaAlaHaMax: pinta.max,
    pintaAlaMerkittyLkm: pinta.merkitty,
    generaattoritLkmMin: generaattorit.min,
    generaattoritLkmMax: generaattorit.max,
    generaattoritMerkittyLkm: generaattorit.merkitty,
    rakenteillaTaiToiminnassaLkm: hankkeet.filter(
      (h) => h.vaihe === "rakenteilla" || h.vaihe === "toiminnassa",
    ).length,
  };
}
