/** Hakusanat esityslistojen ja kuulutusten suodatukseen (7A.6). */

export const OLETUS_HAKUSANAT = [
  "datakeskus",
  "konesali",
  "hyperscale",
  "palvelinkeskus",
  "serverikeskus",
  "datahalli",
  "keskusdata",
  "pilvipalvelu",
  "colocation",
];

export function hakusanat(): string[] {
  const raaka = process.env.KUNTA_ESITYSLISTA_HAKUSANAT?.trim();
  if (!raaka) return OLETUS_HAKUSANAT;
  return raaka
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function osuuHakusanaan(teksti: string, sanat: string[]): string | null {
  const alempi = teksti.toLowerCase();
  for (const sana of sanat) {
    if (alempi.includes(sana)) return sana;
  }
  return null;
}
