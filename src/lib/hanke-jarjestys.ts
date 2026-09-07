import { hankeVaihtelvalit, onVe0 } from "@/lib/hanke-vaihtelvali";
import { hankeTehoMw } from "@/lib/naytto";
import type { HankeListalla } from "@/lib/supabase/kyselyt";

export const HANKE_JARJESTYS_VAIHTOEHDOT = [
  { arvo: "nimi", nimi: "Nimi (A–Ö)" },
  { arvo: "teho", nimi: "Teho (suurin ensin)" },
  { arvo: "it_teho", nimi: "IT-teho (suurin ensin)" },
  { arvo: "sahkonkaytto", nimi: "Sähkönkäyttö (suurin ensin)" },
  { arvo: "pinta_ala", nimi: "Pinta-ala (suurin ensin)" },
  { arvo: "generaattorit", nimi: "Generaattorit (suurin ensin)" },
  { arvo: "paivitetty", nimi: "Viimeksi päivitetty" },
] as const;

export type HankeJarjestys = (typeof HANKE_JARJESTYS_VAIHTOEHDOT)[number]["arvo"];

const JARJESTYS_ARVOT = new Set<string>(HANKE_JARJESTYS_VAIHTOEHDOT.map((v) => v.arvo));

export function onHankeJarjestys(arvo: string): arvo is HankeJarjestys {
  return JARJESTYS_ARVOT.has(arvo);
}

export function parsiHankeJarjestys(raw: string | undefined): HankeJarjestys {
  if (raw && onHankeJarjestys(raw)) return raw;
  return "nimi";
}

function luku(arvo: number | null | undefined): number | null {
  if (arvo == null) return null;
  const n = Number(arvo);
  return Number.isFinite(n) ? n : null;
}

function itTehoMax(hanke: HankeListalla): number | null {
  const veLuvut: number[] = [];
  for (const vaihtoehto of hanke.vaihtoehdot ?? []) {
    if (onVe0(vaihtoehto.tunnus)) continue;
    const n = luku(vaihtoehto.it_teho_mw);
    if (n != null) veLuvut.push(n);
  }
  if (veLuvut.length > 0) return Math.max(...veLuvut);
  return luku(hanke.it_teho_mw);
}

function tehoMax(hanke: HankeListalla): number | null {
  const vali = hankeVaihtelvalit(hanke, hanke.vaihtoehdot ?? []).teho;
  if (vali) return vali.max;
  return hankeTehoMw(hanke);
}

function vaihtelvaliMax(
  hanke: HankeListalla,
  avain: "pintaAla" | "sahkonkaytto" | "generaattorit",
): number | null {
  const vali = hankeVaihtelvalit(hanke, hanke.vaihtoehdot ?? [])[avain];
  return vali?.max ?? null;
}

function vertaaLaskevaLuku(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function vertaaNimi(a: HankeListalla, b: HankeListalla): number {
  return a.nimi.localeCompare(b.nimi, "fi");
}

function jarjestysAvain(hanke: HankeListalla, jarjestys: HankeJarjestys): number | string | null {
  switch (jarjestys) {
    case "teho":
      return tehoMax(hanke);
    case "it_teho":
      return itTehoMax(hanke);
    case "sahkonkaytto":
      return vaihtelvaliMax(hanke, "sahkonkaytto");
    case "pinta_ala":
      return vaihtelvaliMax(hanke, "pintaAla");
    case "generaattorit":
      return vaihtelvaliMax(hanke, "generaattorit");
    case "paivitetty":
      return hanke.paivitetty_pvm;
    case "nimi":
      return hanke.nimi;
    default:
      return hanke.nimi;
  }
}

export function jarjestaHankkeet(
  hankkeet: readonly HankeListalla[],
  jarjestys: HankeJarjestys = "nimi",
): HankeListalla[] {
  const kopio = [...hankkeet];
  kopio.sort((a, b) => {
    const avainA = jarjestysAvain(a, jarjestys);
    const avainB = jarjestysAvain(b, jarjestys);

    if (jarjestys === "nimi") {
      const nimi = String(avainA).localeCompare(String(avainB), "fi");
      return nimi !== 0 ? nimi : vertaaNimi(a, b);
    }

    if (jarjestys === "paivitetty") {
      const pvm = String(avainB).localeCompare(String(avainA), "fi");
      return pvm !== 0 ? pvm : vertaaNimi(a, b);
    }

    const lukuVertailu = vertaaLaskevaLuku(
      typeof avainA === "number" ? avainA : null,
      typeof avainB === "number" ? avainB : null,
    );
    return lukuVertailu !== 0 ? lukuVertailu : vertaaNimi(a, b);
  });
  return kopio;
}
