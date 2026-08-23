import { KENTAN_TILA_NIMET, type KentanTila } from "@/lib/naytto";

const VALO_LUOKAT: Record<KentanTila, string> = {
  vahvistettu: "bg-green-800",
  vahvistamaton: "bg-amber-600",
  puuttuu: "bg-red-800",
};

export function Liikennevalo({ tila }: { tila: KentanTila }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={`Tila: ${KENTAN_TILA_NIMET[tila]}`}
      >
        <span
          className={`inline-block size-2.5 shrink-0 rounded-full ${tila === "puuttuu" ? VALO_LUOKAT.puuttuu : "bg-red-800/25"}`}
        />
        <span
          className={`inline-block size-2.5 shrink-0 rounded-full ${tila === "vahvistamaton" ? VALO_LUOKAT.vahvistamaton : "bg-amber-600/25"}`}
        />
        <span
          className={`inline-block size-2.5 shrink-0 rounded-full ${tila === "vahvistettu" ? VALO_LUOKAT.vahvistettu : "bg-green-800/25"}`}
        />
      </span>
      <span className="text-muted">{KENTAN_TILA_NIMET[tila]}</span>
    </span>
  );
}
