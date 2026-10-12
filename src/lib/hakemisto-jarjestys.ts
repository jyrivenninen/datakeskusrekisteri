/** Kunnat-, toimijat- ja konsulttihakemistojen järjestys. */

export const HAKEMISTO_JARJESTYS_VAIHTOEHDOT = [
  { arvo: "nimi", nimi: "Nimi (A–Ö)" },
  { arvo: "hankkeita", nimi: "Hankkeita (eniten ensin)" },
] as const;

export type HakemistoJarjestys = (typeof HAKEMISTO_JARJESTYS_VAIHTOEHDOT)[number]["arvo"];

export function parsiHakemistoJarjestys(raw: string | undefined | null): HakemistoJarjestys {
  return raw === "hankkeita" ? "hankkeita" : "nimi";
}

export function hakemistoJarjestysPolku(polku: string, jarjestys: HakemistoJarjestys): string {
  if (jarjestys === "nimi") return polku;
  return `${polku}?jarjestys=${jarjestys}`;
}

export function jarjestaHakemistoRivit<T extends { nimi: string; hankkeita: number }>(
  rivit: T[],
  jarjestys: HakemistoJarjestys,
): T[] {
  const kopio = [...rivit];
  if (jarjestys === "hankkeita") {
    kopio.sort(
      (a, b) => b.hankkeita - a.hankkeita || a.nimi.localeCompare(b.nimi, "fi"),
    );
  } else {
    kopio.sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"));
  }
  return kopio;
}
