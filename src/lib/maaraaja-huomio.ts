/** Määräajan lähestymisvaroitus: kalenteripäivät Europe/Helsinki. */

export const MAARAAIKA_HUOMIO_PAIVAT = 7;

export const MAARAAIKA_HUOMIO_SELITE = "! = viikon sisällä";

/** Kalenteripäivä Suomen aikavyöhykkeellä (YYYY-MM-DD). */
export function helsinkiKalenteripaiva(nyt: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Helsinki",
  }).format(nyt);
}

function pvmOsa(arvo: string): string | null {
  const pvm = arvo.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(pvm) ? pvm : null;
}

function kalenteripaivaEroPaivina(paattyy: string, tanaan: string): number {
  const a = Date.UTC(
    Number(paattyy.slice(0, 4)),
    Number(paattyy.slice(5, 7)) - 1,
    Number(paattyy.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(tanaan.slice(0, 4)),
    Number(tanaan.slice(5, 7)) - 1,
    Number(tanaan.slice(8, 10)),
  );
  return Math.round((a - b) / 86_400_000);
}

/**
 * Avoin määräaika: alkaa_pvm puuttuu tai ≤ tänään, ja paattyy_pvm ≥ tänään
 * (Helsingin kalenteripäivinä). Yhden päivän jakso: alkaa === paattyy.
 */
export function maaraajaOnAuki(
  alkaaPvm: string | null | undefined,
  paattyyPvm: string,
  nyt: Date = new Date(),
): boolean {
  const paattyy = pvmOsa(paattyyPvm);
  if (!paattyy) return false;
  const tanaan = helsinkiKalenteripaiva(nyt);
  if (paattyy < tanaan) return false;
  if (alkaaPvm) {
    const alkaa = pvmOsa(alkaaPvm);
    if (!alkaa) return false;
    if (alkaa > tanaan) return false;
  }
  return true;
}

/** Päiviä jäljellä päättymiseen (Helsinki). Negatiivinen = mennyt. null = epäkelpo. */
export function paiviaJaljellaPaattyy(
  paattyyPvm: string,
  nyt: Date = new Date(),
): number | null {
  const paattyy = pvmOsa(paattyyPvm);
  if (!paattyy) return null;
  return kalenteripaivaEroPaivina(paattyy, helsinkiKalenteripaiva(nyt));
}

export type MaaraajaHuomio = {
  paivia: number;
  teksti: string;
  ariaLabel: string;
};

/**
 * Palauttaa huomion, kun määräaika on avoinna ja 0…MAARAAIKA_HUOMIO_PAIVAT
 * kalenteripäivää jäljellä Helsingissä. Muuten null.
 */
export function maaraajaHuomio(
  alkaaPvm: string | null | undefined,
  paattyyPvm: string,
  nyt: Date = new Date(),
): MaaraajaHuomio | null {
  if (!maaraajaOnAuki(alkaaPvm, paattyyPvm, nyt)) return null;
  const paivia = paiviaJaljellaPaattyy(paattyyPvm, nyt);
  if (paivia == null || paivia < 0 || paivia > MAARAAIKA_HUOMIO_PAIVAT) {
    return null;
  }
  let teksti: string;
  let ariaLabel: string;
  if (paivia === 0) {
    teksti = "! tänään";
    ariaLabel = "Määräaika lähestyy: päättyy tänään";
  } else if (paivia === 1) {
    teksti = "! huomenna";
    ariaLabel = "Määräaika lähestyy: 1 päivä jäljellä";
  } else {
    teksti = `! ${paivia} pv`;
    ariaLabel = `Määräaika lähestyy: ${paivia} päivää jäljellä`;
  }
  return { paivia, teksti, ariaLabel };
}
