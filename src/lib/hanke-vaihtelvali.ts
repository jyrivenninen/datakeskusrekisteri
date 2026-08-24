import { hankeTehoMw, type KokoLuokka } from "@/lib/naytto";
import type { Hanke, HankeVaihtoehto } from "@/lib/supabase/tietokanta";

export type Vaihtelvali = { min: number; max: number };

export type HankeVaihtelvalit = {
  teho: Vaihtelvali | null;
  pintaAla: Vaihtelvali | null;
  sahkonkaytto: Vaihtelvali | null;
  generaattorit: Vaihtelvali | null;
};

type HankeLuvut = Pick<
  Hanke,
  "it_teho_mw" | "teho_mw" | "pinta_ala_ha" | "sahkonkaytto_twh_a" | "generaattorit_lkm"
>;

type VaihtoehtoLuvut = Pick<
  HankeVaihtoehto,
  | "tunnus"
  | "it_teho_mw"
  | "teho_mw"
  | "pinta_ala_ha"
  | "sahkonkaytto_twh_a"
  | "generaattorit_lkm"
>;

function luku(arvo: number | string | null | undefined): number | null {
  if (arvo == null) return null;
  const n = typeof arvo === "number" ? arvo : Number(arvo);
  return Number.isFinite(n) ? n : null;
}

export function onVe0(tunnus: string): boolean {
  return tunnus.trim().toUpperCase() === "VE0";
}

export function vaihtelvaliLuvuista(luvut: readonly number[]): Vaihtelvali | null {
  if (luvut.length === 0) return null;
  return { min: Math.min(...luvut), max: Math.max(...luvut) };
}

function kentanVaihtelvali(
  hankeArvo: number | null,
  vaihtoehdot: readonly VaihtoehtoLuvut[],
  veArvo: (vaihtoehto: VaihtoehtoLuvut) => number | null,
): Vaihtelvali | null {
  const veLuvut: number[] = [];
  for (const vaihtoehto of vaihtoehdot) {
    if (onVe0(vaihtoehto.tunnus)) continue;
    const n = veArvo(vaihtoehto);
    if (n != null) veLuvut.push(n);
  }
  if (veLuvut.length > 0) return vaihtelvaliLuvuista(veLuvut);
  if (hankeArvo == null) return null;
  return { min: hankeArvo, max: hankeArvo };
}

/** VE-luvut, jos merkitty; muuten hanketason luku. VE1 ja VE2 eivät yhdisty. */
export function hankeVaihtelvalit(
  hanke: HankeLuvut,
  vaihtoehdot: readonly VaihtoehtoLuvut[],
): HankeVaihtelvalit {
  return {
    teho: kentanVaihtelvali(hankeTehoMw(hanke), vaihtoehdot, (ve) => hankeTehoMw(ve)),
    pintaAla: kentanVaihtelvali(luku(hanke.pinta_ala_ha), vaihtoehdot, (ve) =>
      luku(ve.pinta_ala_ha),
    ),
    sahkonkaytto: kentanVaihtelvali(luku(hanke.sahkonkaytto_twh_a), vaihtoehdot, (ve) =>
      luku(ve.sahkonkaytto_twh_a),
    ),
    generaattorit: kentanVaihtelvali(luku(hanke.generaattorit_lkm), vaihtoehdot, (ve) =>
      luku(ve.generaattorit_lkm),
    ),
  };
}

export function tehoLuokatVaihtelvalista(vali: Vaihtelvali | null): KokoLuokka[] {
  if (!vali) return ["ei_ilmoitettu"];
  const luokat: KokoLuokka[] = [];
  if (vali.min < 50) luokat.push("pieni");
  if (vali.min <= 200 && vali.max >= 50) luokat.push("keski");
  if (vali.max > 200) luokat.push("suuri");
  return luokat;
}

export function hankeOsuvatKokoLuokkaan(
  hanke: HankeLuvut,
  vaihtoehdot: readonly VaihtoehtoLuvut[],
  koko: KokoLuokka,
): boolean {
  const luokat = tehoLuokatVaihtelvalista(hankeVaihtelvalit(hanke, vaihtoehdot).teho);
  return luokat.includes(koko);
}
