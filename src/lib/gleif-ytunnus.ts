import type { GleifEhdokas } from "@/lib/gleif";

const Y_TUNNUS_MUOTO = /^[0-9]{7}-[0-9]$/;
const SUOMI_RA = "RA000188";

/** Tarkistusmerkki: painot 7,9,10,5,8,4,2; jakojäännös 11. */
function ytunnusTarkistusOk(tunnus: string): boolean {
  if (!Y_TUNNUS_MUOTO.test(tunnus)) return false;
  const numerot = tunnus.replace("-", "");
  const painot = [7, 9, 10, 5, 8, 4, 2];
  let summa = 0;
  for (let i = 0; i < 7; i++) {
    summa += Number(numerot[i]) * painot[i]!;
  }
  const jakojaannos = summa % 11;
  const odotettu =
    jakojaannos === 0 ? 0 : jakojaannos === 1 ? -1 : 11 - jakojaannos;
  if (odotettu < 0) return false;
  return Number(numerot[7]) === odotettu;
}

/**
 * Normalisoi GLEIF-rekisterinumeron Y-tunnukseksi (1234567-8),
 * jos se näyttää suomalaiselta BIS-tunnukselta.
 */
export function normalisoiGleifYtunnus(
  rekisterinumero: string | null | undefined,
): string | null {
  if (!rekisterinumero) return null;
  const raaka = rekisterinumero.trim();
  if (Y_TUNNUS_MUOTO.test(raaka) && ytunnusTarkistusOk(raaka)) return raaka;
  const vainNumerot = raaka.replace(/[\s-]/g, "");
  if (/^[0-9]{8}$/.test(vainNumerot)) {
    const muotoiltu = `${vainNumerot.slice(0, 7)}-${vainNumerot.slice(7)}`;
    if (ytunnusTarkistusOk(muotoiltu)) return muotoiltu;
  }
  return null;
}

/**
 * Palauttaa GLEIF-ehdokkaan suomalaisen Y-tunnuksen, jos maa/RA viittaa Suomeen
 * ja rekisterinumero on kelvollinen Y-tunnus.
 */
export function gleifSuomalainenYtunnus(
  ehdokas: Pick<
    GleifEhdokas,
    "rekisterinumero" | "rekisteriviranomainen" | "maa"
  >,
): string | null {
  const yt = normalisoiGleifYtunnus(ehdokas.rekisterinumero);
  if (!yt) return null;
  const maa = (ehdokas.maa ?? "").toUpperCase();
  const ra = ehdokas.rekisteriviranomainen ?? "";
  const suomi =
    ra === SUOMI_RA ||
    maa === "FI" ||
    maa.startsWith("FI-") ||
    maa === "FIN";
  return suomi ? yt : null;
}
