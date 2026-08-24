import { MUUTOSEHDOTUS_TILA_NIMET } from "@/lib/naytto";
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
