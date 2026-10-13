import {
  MAARAAIKA_HUOMIO_SELITE,
  type MaaraajaHuomio,
} from "@/lib/maaraaja-huomio";

/** Näkyvä "! …"-merkintä + sr-only-selite (aria-label spanissa ei ole luotettava). */
export function MaaraajaHuomioMerkinta({
  huomio,
}: {
  huomio: MaaraajaHuomio;
}) {
  return (
    <span className="inline-flex shrink-0 items-baseline font-semibold text-foreground">
      <span aria-hidden="true">{huomio.teksti}</span>
      <span className="sr-only">{huomio.ariaLabel}</span>
    </span>
  );
}

export function MaaraajaHuomioSelite() {
  return (
    <p className="mt-3 text-sm text-muted">
      <span aria-hidden="true">{MAARAAIKA_HUOMIO_SELITE}</span>
      <span className="sr-only">
        Huutomerkki tarkoittaa, että määräaika päättyy viikon sisällä.
      </span>
    </p>
  );
}

/** Lievä rivikorostus vaaleassa ja tummassa teemassa (ei pelkkä väri). */
export function maaraajaHuomioRiviLuokka(onHuomio: boolean): string {
  if (!onHuomio) return "";
  return "bg-[color-mix(in_srgb,var(--foreground)_8%,var(--surface))]";
}
