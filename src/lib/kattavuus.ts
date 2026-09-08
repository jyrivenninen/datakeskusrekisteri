/** Kattavuus kolmanneksin mukaan: matala → keskitaso → hyvä. */
export type KattavuusLuokka = "matala" | "keskitaso" | "hyva";

export function kattavuusOsuus(merkitty: number, kaikki: number): number | null {
  if (kaikki <= 0) return null;
  return merkitty / kaikki;
}

export function kattavuusLuokka(merkitty: number, kaikki: number): KattavuusLuokka {
  const osuus = kattavuusOsuus(merkitty, kaikki);
  if (osuus == null) return "matala";
  if (osuus < 1 / 3) return "matala";
  if (osuus < 2 / 3) return "keskitaso";
  return "hyva";
}

export const KATTAVUUS_VARI_LUOKAT: Record<KattavuusLuokka, string> = {
  matala: "font-semibold text-red-600 dark:text-red-400",
  keskitaso: "font-semibold text-amber-600 dark:text-amber-400",
  hyva: "font-semibold text-green-600 dark:text-green-400",
};

export function kattavuusVariLuokka(merkitty: number, kaikki: number): string {
  return KATTAVUUS_VARI_LUOKAT[kattavuusLuokka(merkitty, kaikki)];
}

export function kattavuusSelite(merkitty: number, kaikki: number): string {
  const osuus = kattavuusOsuus(merkitty, kaikki);
  if (osuus == null) return "Ei hankkeita vertailuun";
  const prosentti = new Intl.NumberFormat("fi-FI", {
    maximumFractionDigits: 0,
  }).format(osuus * 100);
  return `${prosentti} % hankkeista — ${KATTAVUUS_LUOKKA_NIMET[kattavuusLuokka(merkitty, kaikki)]}`;
}

const KATTAVUUS_LUOKKA_NIMET: Record<KattavuusLuokka, string> = {
  matala: "heikko kattavuus",
  keskitaso: "keskitason kattavuus",
  hyva: "hyvä kattavuus",
};
