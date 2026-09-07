/** Vuosikulutus (TWh/a) → keskimääräinen teho (MW), 8760 h/v. */
export const TWH_A_KESKITEHO_MW = 1_000_000 / 8760;

export type JohdonmukaisuusTila = "puuttuu" | "yhteensopiva" | "tarkista";

export type Johdonmukaisuus = {
  tila: JohdonmukaisuusTila;
  itTehoMw: number | null;
  kulutusMwMin: number | null;
  kulutusMwMax: number | null;
  /** Lyhyt havainto, jos tarkistus suositeltu. */
  syy: string | null;
};

/** Muunna TWh/a keskitehoksi megawatteina. */
export function twhKaMw(twh: number): number {
  return twh * TWH_A_KESKITEHO_MW;
}

/**
 * Vertaa IT-tehoa (MW) dokumentoidun vuosikulutuksen keskitehoon.
 * Kulutus voi sisältää jäähdytyksen; IT-teho voi olla nimellisteho — tarkistus on suuntaa-antava.
 */
export function laskeJohdonmukaisuus(
  itTehoMw: number | null | undefined,
  sahkonkayttoTwhMin: number | null | undefined,
  sahkonkayttoTwhMax: number | null | undefined,
): Johdonmukaisuus {
  const teho = itTehoMw != null && itTehoMw > 0 && Number.isFinite(itTehoMw) ? itTehoMw : null;
  const twhMin = sahkonkayttoTwhMin;
  const twhMax = sahkonkayttoTwhMax;
  const puuttuu: Johdonmukaisuus = {
    tila: "puuttuu",
    itTehoMw: teho,
    kulutusMwMin: null,
    kulutusMwMax: null,
    syy: null,
  };
  if (
    teho == null ||
    twhMin == null ||
    twhMax == null ||
    !Number.isFinite(twhMin) ||
    !Number.isFinite(twhMax)
  ) {
    return puuttuu;
  }

  const mwMin = twhKaMw(twhMin);
  const mwMax = twhKaMw(twhMax);

  /** Matala hyötysuhde / osittainen kuorma. */
  const alaraja = teho * 0.15;
  /** Korkea PUE + apulaitteet. */
  const ylaraja = teho * 6;

  if (mwMax < alaraja) {
    return {
      tila: "tarkista",
      itTehoMw: teho,
      kulutusMwMin: mwMin,
      kulutusMwMax: mwMax,
      syy: "Dokumentoitu kulutus on selvästi pienempi kuin IT-teho.",
    };
  }
  if (mwMin > ylaraja) {
    return {
      tila: "tarkista",
      itTehoMw: teho,
      kulutusMwMin: mwMin,
      kulutusMwMax: mwMax,
      syy: "Dokumentoitu kulutus on selvästi suurempi kuin IT-teho.",
    };
  }

  return {
    tila: "yhteensopiva",
    itTehoMw: teho,
    kulutusMwMin: mwMin,
    kulutusMwMax: mwMax,
    syy: null,
  };
}
