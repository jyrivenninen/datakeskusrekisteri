import { MUUTOSEHDOTUS_TILA_NIMET, onHavaintoTyyppi } from "@/lib/naytto";
import type { MuutosehdotusTila } from "@/lib/supabase/tietokanta";

const LUOKAT: Record<MuutosehdotusTila, string> = {
  odottaa:
    "border-amber-800 bg-amber-100 text-amber-950 dark:border-amber-300 dark:bg-amber-950 dark:text-amber-50",
  hyvaksytty:
    "border-emerald-800 bg-emerald-100 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-950 dark:text-emerald-50",
  hylatty:
    "border-rose-800 bg-rose-100 text-rose-950 dark:border-rose-300 dark:bg-rose-950 dark:text-rose-50",
};

const RIVI_LUOKAT: Record<MuutosehdotusTila, string> = {
  odottaa: "border-l-amber-600 bg-amber-50/80 dark:bg-amber-950/40",
  hyvaksytty: "border-l-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30",
  hylatty: "border-l-rose-700 bg-rose-50/80 dark:bg-rose-950/30",
};

export function ehdotusTilaRiviLuokka(tila: string): string {
  const avain = tila as MuutosehdotusTila;
  return RIVI_LUOKAT[avain] ?? "";
}

const LUOKKA_RIVI = {
  havainto: "border-l-violet-700 bg-violet-50/90 dark:bg-violet-950/40",
  taydennys: "border-l-teal-700 bg-teal-50/90 dark:bg-teal-950/40",
};

const LUOKKA_MERKKI = {
  havainto:
    "border-violet-800 bg-violet-100 text-violet-950 dark:border-violet-300 dark:bg-violet-950 dark:text-violet-50",
  taydennys:
    "border-teal-800 bg-teal-100 text-teal-950 dark:border-teal-300 dark:bg-teal-950 dark:text-teal-50",
};

export function ehdotusLuokkaRiviLuokka(tyyppi: string): string {
  return onHavaintoTyyppi(tyyppi) ? LUOKKA_RIVI.havainto : LUOKKA_RIVI.taydennys;
}

export function EhdotusLuokka({ tyyppi }: { tyyppi: string }) {
  const havainto = onHavaintoTyyppi(tyyppi);
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-0.5 text-sm font-medium ${havainto ? LUOKKA_MERKKI.havainto : LUOKKA_MERKKI.taydennys}`}
    >
      {havainto ? "Havainto" : "Täydennys"}
    </span>
  );
}

export function EhdotusTila({ tila }: { tila: string }) {
  const avain = tila as MuutosehdotusTila;
  const nimi = MUUTOSEHDOTUS_TILA_NIMET[avain] ?? tila;
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-0.5 text-sm font-medium ${LUOKAT[avain] ?? "border-border"}`}
    >
      {nimi}
    </span>
  );
}
