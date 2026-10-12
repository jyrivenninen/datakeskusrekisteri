/**
 * Roolirivin kohteena voi olla vain organisaatio.
 * Henkilönimi hylätään — sitä ei luoda organisaatioksi.
 * Tarvittaessa henkilön nimi kuuluu roolirivin huomautukseen tai lainaukseen.
 */

const YRITYSMUOTO =
  /\b(oy|oyj|ab|ltd|llc|gmbh|inc|corp|group|consulting|arkkitehtitoimisto|suunnittelu|kaupunki|kunta|yliopisto|säätiö|saatio|osuuskunta|ry|rf|kb|ky)\b/i;

/** Kaksi isolla alkavaa sanaa ilman yritysmuotoa → henkilönimi. */
const HENKILO_KAKSINIMI =
  /^[A-ZÅÄÖÜ][a-zåäöü\-]+(?:\s+[A-ZÅÄÖÜ][a-zåäöü\-]+){1,2}$/u;

export function onOrganisaatioNimi(nimi: string): boolean {
  const n = nimi.trim().replace(/\s+/g, " ");
  if (!n || n.toLowerCase() === "ei ilmene") return false;
  if (YRITYSMUOTO.test(n)) return true;
  if (n.includes("/") || n.includes("&") || n.includes(",")) return true;
  if (HENKILO_KAKSINIMI.test(n)) return false;
  // Yksittäinen sana ilman yritysmuotoa (esim. "Ramboll") hyväksytään organisaationa.
  if (!n.includes(" ")) return n.length >= 2;
  // Kolme+ sanaa ilman yritysmuotoa: epävarma → ei organisaatio (usein henkilö + titteli).
  if (n.split(" ").length >= 3 && !YRITYSMUOTO.test(n)) return false;
  return true;
}

export function hylkaaHenkilöOrganisaatioViesti(nimi: string): string {
  return (
    `Roolirivin kohteena voi olla vain organisaatio. ` +
    `«${nimi.trim()}» näyttää henkilönimeltä — älä luo organisaatiota. ` +
    `Säilytä nimi tarvittaessa huomautuksessa tai lainauksessa.`
  );
}
