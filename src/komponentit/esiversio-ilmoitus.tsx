import { kuittaaEsiversio } from "@/app/toiminnot";
import { ESIVERSIO_TEKSTI, OSALLISTUMINEN_TEKSTI } from "@/lib/esiversio";

export function EsiversioIlmoitus() {
  return (
    <dialog
      open
      className="esiversio-ilmoitus max-w-lg rounded border border-border bg-surface p-6 text-foreground shadow-lg"
      aria-labelledby="esiversio-otsikko"
    >
      <h2 id="esiversio-otsikko" className="text-xl font-semibold">
        Esiversio
      </h2>
      <p className="mt-3 leading-relaxed">{ESIVERSIO_TEKSTI}</p>
      <p className="mt-3 leading-relaxed">{OSALLISTUMINEN_TEKSTI}</p>
      <p className="mt-3 text-sm text-muted">
        Ilmoita hanke tai täydennys sivulla{" "}
        <a href="/ilmoitus" className="text-link underline">
          Ilmoita hanke
        </a>
        . Palaute ja muut viestit sivulla{" "}
        <a href="/yhteys" className="text-link underline">
          Ota yhteyttä
        </a>
        . Lisätietoa on sivulla{" "}
        <a href="/tietoa" className="text-link underline">
          Tietoa palvelusta
        </a>
        .
      </p>
      <form action={kuittaaEsiversio} className="mt-6">
        <button
          type="submit"
          className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Ymmärrän
        </button>
      </form>
    </dialog>
  );
}
