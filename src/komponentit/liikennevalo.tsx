import { KENTAN_TILA_NIMET, type KentanTila } from "@/lib/naytto";

const LAMPUT: { avain: KentanTila; vari: "punainen" | "keltainen" | "vihrea" }[] = [
  { avain: "puuttuu", vari: "punainen" },
  { avain: "vahvistamaton", vari: "keltainen" },
  { avain: "vahvistettu", vari: "vihrea" },
];

export function Liikennevalo({
  tila,
  tiivis = false,
}: {
  tila: KentanTila;
  tiivis?: boolean;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-sm">
      <span
        className="liikennevalo"
        role="img"
        aria-label={`Tila: ${KENTAN_TILA_NIMET[tila]}`}
      >
        {LAMPUT.map((lamppu) => (
          <span
            key={lamppu.avain}
            className="liikennevalo-pallo"
            data-vari={lamppu.vari}
            data-paalla={tila === lamppu.avain ? "true" : "false"}
          />
        ))}
      </span>
      {tiivis ? null : <span className="text-muted">{KENTAN_TILA_NIMET[tila]}</span>}
    </span>
  );
}
