/**
 * Tehohavaintojen lukeminen (B2). Tyhjällä taululla ei muuta julkista summaa:
 * prioriteetti VE → havainto (koko_hanke/tavoite/asennettu) → hanketaso.
 */
import type { Vaihtelvali } from "@/lib/hanke-vaihtelvali";
import { hankeTehoMw } from "@/lib/naytto";
import type { Hanke, HankeVaihtoehto } from "@/lib/supabase/tietokanta";

export type Tehohavainto = {
  id: string;
  hanke_id: string;
  mw: number | null;
  mw_min: number | null;
  mw_max: number | null;
  laji: "IT" | "kokonais" | "erittelematon";
  kohde:
    | "koko_hanke"
    | "vaihe"
    | "tavoite"
    | "moduuli"
    | "asennettu"
    | "lupa"
    | "aiempi_suunnitelma";
  rajaus: "tarkka" | "noin" | "alaraja" | "ylaraja" | "vali";
  tila: "voimassa" | "korvattu" | "ei_tue";
  havainto_pvm: string | null;
  korvaava_id?: string | null;
};

export type HankeTehoJulkinenRivi = {
  hanke_id: string;
  teho_min_mw: number | null;
  teho_max_mw: number | null;
  mukana_summassa: boolean;
  kokoluokka_edustaja: string;
  peruttu: boolean;
};

function luku(arvo: number | string | null | undefined): number | null {
  if (arvo == null) return null;
  const n = typeof arvo === "number" ? arvo : Number(arvo);
  return Number.isFinite(n) ? n : null;
}

/** Yksi havaintoryhmä → min/max (ylaraja ei vaikuta miniin). */
export function havaintojenVaihtelvali(
  havainnot: readonly Tehohavainto[],
  kohteet: ReadonlyArray<Tehohavainto["kohde"]>,
): Vaihtelvali | null {
  const voimassa = havainnot.filter(
    (h) => h.tila === "voimassa" && kohteet.includes(h.kohde),
  );
  if (voimassa.length === 0) return null;
  const minit: number[] = [];
  const maxit: number[] = [];
  for (const h of voimassa) {
    if (h.rajaus === "vali") {
      if (h.mw_min != null) minit.push(Number(h.mw_min));
      if (h.mw_max != null) maxit.push(Number(h.mw_max));
    } else if (h.rajaus === "ylaraja") {
      if (h.mw != null) maxit.push(Number(h.mw));
    } else {
      if (h.mw != null) {
        minit.push(Number(h.mw));
        maxit.push(Number(h.mw));
      }
    }
  }
  if (minit.length === 0 && maxit.length === 0) return null;
  return {
    min: minit.length ? Math.min(...minit) : Math.min(...maxit),
    max: maxit.length ? Math.max(...maxit) : Math.max(...minit),
  };
}

/**
 * Push 1: false → peruttu mukana (live 13 586…/107).
 * Kytke true «Laskentatapa tarkennettu» -julkaisussa → sama kuin
 * hanke_teho_julkinen (13 546…/106, Heinola ulkona).
 */
export const TEHO_SULJE_PERUTUT = false;

/**
 * Sama prioriteetti kuin hanke_teho_julkinen.
 * Tyhjät havainnot → VE / hanketaso kuten ennen.
 * Peruttu: vain jos TEHO_SULJE_PERUTUT (tai opts.suljePerutut).
 */
export function hankeTehoVaihtelvaliB2(
  hanke: Pick<Hanke, "it_teho_mw" | "teho_mw" | "vaihe"> & {
    teho_erittelematon_mw?: number | null;
  },
  vaihtoehdot: readonly Pick<
    HankeVaihtoehto,
    "tunnus" | "it_teho_mw" | "teho_mw"
  >[],
  havainnot: readonly Tehohavainto[] = [],
  opts?: { suljePerutut?: boolean },
): Vaihtelvali | null {
  const sulje = opts?.suljePerutut ?? TEHO_SULJE_PERUTUT;
  if (sulje && hanke.vaihe === "peruttu") return null;

  const veLuvut: number[] = [];
  for (const ve of vaihtoehdot) {
    if (ve.tunnus.trim().toUpperCase() === "VE0") continue;
    const n = hankeTehoMw(ve);
    if (n != null) veLuvut.push(n);
  }
  if (veLuvut.length > 0) {
    return { min: Math.min(...veLuvut), max: Math.max(...veLuvut) };
  }

  const koko = havaintojenVaihtelvali(havainnot, ["koko_hanke"]);
  if (koko) return koko;
  const tavoite = havaintojenVaihtelvali(havainnot, ["tavoite"]);
  if (tavoite) return tavoite;
  if (hanke.vaihe === "toiminnassa") {
    const asennettu = havaintojenVaihtelvali(havainnot, ["asennettu"]);
    if (asennettu) return asennettu;
  }

  const hanketaso = hankeTehoMw(hanke);
  if (hanketaso == null) return null;
  return { min: hanketaso, max: hanketaso };
}

export function tehohavaintoJsoniksi(h: Tehohavainto) {
  return {
    mw: h.mw,
    mw_min: h.mw_min,
    mw_max: h.mw_max,
    laji: h.laji,
    kohde: h.kohde,
    rajaus: h.rajaus,
    tila: h.tila,
    havainto_pvm: h.havainto_pvm,
  };
}

const KOHDE_NIMET: Record<Tehohavainto["kohde"], string> = {
  koko_hanke: "Koko hanke",
  vaihe: "Vaihe",
  tavoite: "Tavoite",
  moduuli: "Moduuli",
  asennettu: "Asennettu",
  lupa: "Lupa",
  aiempi_suunnitelma: "Aiempi suunnitelma",
};

const RAJAUS_NIMET: Record<Tehohavainto["rajaus"], string> = {
  tarkka: "",
  noin: "noin",
  alaraja: "vähintään",
  ylaraja: "enintään",
  vali: "",
};

/** Hankesivun / kortin tekstirivi yhdelle havainnolle. */
export function tehohavaintoTekstirivi(h: Tehohavainto): string {
  const kohde = KOHDE_NIMET[h.kohde];
  const rajaus = RAJAUS_NIMET[h.rajaus];
  const laji =
    h.laji === "erittelematon" ? "" : h.laji === "IT" ? " (IT)" : " (kokonais)";
  let luku: string;
  if (h.rajaus === "vali" && h.mw_min != null && h.mw_max != null) {
    luku = `${h.mw_min}–${h.mw_max} MW`;
  } else {
    luku = `${h.mw ?? "?"} MW`;
  }
  const etuliite = rajaus ? `${rajaus} ` : "";
  return `${kohde}: ${etuliite}${luku}${laji}`;
}

export function lukuTaiNull(arvo: unknown): number | null {
  return luku(arvo as number | string | null);
}
