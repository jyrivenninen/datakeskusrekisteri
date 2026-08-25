import { kuittaaEsiversio } from "@/app/toiminnot";

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
      <p className="mt-3 leading-relaxed">
        Rekisteri on esiversio. Tietoja täydennetään ja varmennetaan. Osa
        toiminnoista voi puuttua. Osa tiedoista voi olla puutteellista,
        vanhentunutta tai virheellistä. Tarkista aina alkuperäinen lähde.
      </p>
      <p className="mt-3 text-sm text-muted">
        Lisätietoa on sivulla{" "}
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
