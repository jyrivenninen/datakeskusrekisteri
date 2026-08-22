import { HANKE_VAIHEET, type HankeVaihe } from "@/lib/supabase/tietokanta";

export type EhdotettuKentta = {
  arvo: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string | null;
};

export type EhdotusSisalto = {
  kentat: Record<string, EhdotettuKentta>;
};

const NUMEERISET = new Set([
  "it_teho_mw",
  "teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
]);

export const LOMAKE_KENTAT = [
  "nimi",
  "kunta",
  "maakunta",
  "vaihe",
  "toimija_nimi",
  "yva_diaarinumero",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
] as const;

function onHttpsUrl(arvo: string): boolean {
  return /^https?:\/\//.test(arvo);
}

export function rakennaSisalto(
  kentat: Record<string, string>,
  lahdeUrl: string,
  lahdeSivu: string,
  lainaus: string,
): { sisalto: EhdotusSisalto; virhe: string | null } {
  if (!onHttpsUrl(lahdeUrl)) {
    return { sisalto: { kentat: {} }, virhe: "Lähteen osoitteen pitää alkaa http:// tai https://." };
  }
  const sivu = lahdeSivu.trim() === "" ? null : Number(lahdeSivu);
  if (sivu != null && (!Number.isInteger(sivu) || sivu < 1)) {
    return { sisalto: { kentat: {} }, virhe: "Sivunumero ei ole kelvollinen." };
  }

  const tulos: Record<string, EhdotettuKentta> = {};
  for (const [kentta, raaka] of Object.entries(kentat)) {
    const arvo = raaka.trim();
    if (!arvo) continue;
    if (kentta === "vaihe" && !(HANKE_VAIHEET as readonly string[]).includes(arvo)) {
      return { sisalto: { kentat: {} }, virhe: "Vaihe ei ole sallittu." };
    }
    tulos[kentta] = {
      arvo,
      lahde_url: lahdeUrl.trim(),
      lahde_sivu: sivu,
      lainaus: lainaus.trim() || null,
    };
  }

  return { sisalto: { kentat: tulos }, virhe: null };
}

export function tarkistaUusiHanke(sisalto: EhdotusSisalto): string | null {
  for (const pakollinen of ["nimi", "kunta", "vaihe"] as const) {
    if (!sisalto.kentat[pakollinen]?.arvo) {
      return "Uudessa hankkeessa tarvitaan nimi, kunta, vaihe ja lähde.";
    }
  }
  return null;
}

function luku(arvo: string): number | null {
  const korjattu = arvo.replace(",", ".");
  const n = Number(korjattu);
  return Number.isFinite(n) ? n : null;
}

export function kenttaArvoksi(
  kentta: string,
  arvo: string,
): string | number | HankeVaihe | null {
  if (NUMEERISET.has(kentta)) return luku(arvo);
  return arvo;
}
