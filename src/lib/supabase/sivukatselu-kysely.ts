import type { SupabaseClient } from "@supabase/supabase-js";

export type SivukatseluPaiva = { paiva: string; lkm: number };
export type SivukatseluPolku = { polku: string; lkm: number };

export type SivukatseluYhteenveto = {
  paivittain: SivukatseluPaiva[];
  suosituimmat: SivukatseluPolku[];
  yhteensa30pv: number;
  tauluPuuttuu: boolean;
};

export async function haeSivukatseluYhteenveto(
  supabase: SupabaseClient,
  paivia = 30,
): Promise<SivukatseluYhteenveto> {
  const tyhja: SivukatseluYhteenveto = {
    paivittain: [],
    suosituimmat: [],
    yhteensa30pv: 0,
    tauluPuuttuu: false,
  };

  const { data: paivittain, error: paivaVirhe } = await supabase.rpc("sivukatselut_paivittain", {
    p_paivia: paivia,
  });
  if (paivaVirhe) {
    if (paivaVirhe.code === "PGRST202" || paivaVirhe.message.includes("does not exist")) {
      return { ...tyhja, tauluPuuttuu: true };
    }
    return tyhja;
  }

  const { data: suosituimmat, error: polkuVirhe } = await supabase.rpc(
    "sivukatselut_suosituimmat",
    { p_paivia: paivia, p_rajat: 15 },
  );
  if (polkuVirhe) {
    return {
      paivittain: (paivittain ?? []) as SivukatseluPaiva[],
      suosituimmat: [],
      yhteensa30pv: 0,
      tauluPuuttuu: false,
    };
  }

  const paivat = (paivittain ?? []) as SivukatseluPaiva[];
  const yhteensa = paivat.reduce((summa, rivi) => summa + Number(rivi.lkm), 0);

  return {
    paivittain: paivat,
    suosituimmat: (suosituimmat ?? []) as SivukatseluPolku[],
    yhteensa30pv: yhteensa,
    tauluPuuttuu: false,
  };
}
