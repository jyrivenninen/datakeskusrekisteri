import type { HankeVaihe } from "@/lib/supabase/tietokanta";

export type HankeSahkoPrioriteetti = {
  id: string;
  nimi: string;
  kunta: string;
  vaihe: HankeVaihe;
  it_teho_mw: number | null;
  teho_mw: number | null;
  tehoMw: number;
  onTyhjaTarkistus: boolean;
  onVeSahko: boolean;
  dokumentteja: number;
};

const VAIHE_PAINO: Partial<Record<HankeVaihe, number>> = {
  yva_vireilla: 40,
  lupamenettely: 35,
  rakenteilla: 25,
  kaavoitus: 15,
  esiselvitys: 10,
  toiminnassa: 5,
  peruttu: 0,
};

function luku(arvo: number | string | null | undefined): number | null {
  if (arvo == null) return null;
  const n = typeof arvo === "number" ? arvo : Number(arvo);
  return Number.isFinite(n) ? n : null;
}

export function hankeTehoMw(it: number | null, teho: number | null): number {
  return Math.max(luku(it) ?? 0, luku(teho) ?? 0);
}

/** A-jono: teho kyllä, sähkö puuttuu, ei merkitty tyhjäksi, ei VE-sähköä. */
export function kuuluuSahkonkayttoAjonoon(h: {
  sahkonkaytto_twh_a: number | null;
  it_teho_mw: number | null;
  teho_mw: number | null;
  onTyhjaTarkistus: boolean;
  onVeSahko: boolean;
}): boolean {
  if (h.sahkonkaytto_twh_a != null) return false;
  if (h.onVeSahko) return false;
  if (h.onTyhjaTarkistus) return false;
  return hankeTehoMw(h.it_teho_mw, h.teho_mw) > 0;
}

export function jarjestaSahkonkayttoPrioriteetti(rivit: HankeSahkoPrioriteetti[]): HankeSahkoPrioriteetti[] {
  return [...rivit].sort((a, b) => {
    if (b.tehoMw !== a.tehoMw) return b.tehoMw - a.tehoMw;
    const vp = (VAIHE_PAINO[b.vaihe] ?? 0) - (VAIHE_PAINO[a.vaihe] ?? 0);
    if (vp !== 0) return vp;
    if (b.dokumentteja !== a.dokumentteja) return b.dokumentteja - a.dokumentteja;
    return a.nimi.localeCompare(b.nimi, "fi");
  });
}
