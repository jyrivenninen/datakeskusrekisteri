import type { Metadata } from "next";
import { ORGANISAATIO_TYYPPI_NIMET, onOrganisaatioTyyppi } from "@/lib/naytto";
import { ORGANISAATIO_TYYPIT } from "@/lib/supabase/tietokanta";
import { haeJulkaistutOrganisaatiot } from "@/lib/supabase/kyselyt";

export const metadata: Metadata = {
  title: "Hakemisto – Datakeskushankkeiden kansallinen rekisteri",
  description: "Julkaistut organisaatiot.",
};

export const revalidate = 60;

export default async function HakemistoSivu({
  searchParams,
}: {
  searchParams: Promise<{ tyyppi?: string }>;
}) {
  const params = await searchParams;
  const tyyppi = params.tyyppi && onOrganisaatioTyyppi(params.tyyppi) ? params.tyyppi : undefined;
  const { organisaatiot, virhe: orgVirhe } = await haeJulkaistutOrganisaatiot(tyyppi);

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Hakemisto</h1>
      <p className="mt-4 leading-relaxed text-muted">
        Julkaistut organisaatiot. Henkilönimiä tai suoria yhteystietoja ei
        julkaista.
      </p>

      <form method="get" className="mt-6 flex flex-col gap-2 sm:max-w-xs">
        <label htmlFor="tyyppi" className="text-sm font-medium">
          Organisaation tyyppi
        </label>
        <select
          id="tyyppi"
          name="tyyppi"
          defaultValue={tyyppi ?? ""}
          className="rounded border border-border bg-surface px-2 py-2 text-foreground"
        >
          <option value="">Kaikki tyypit</option>
          {ORGANISAATIO_TYYPIT.map((arvo) => (
            <option key={arvo} value={arvo}>
              {ORGANISAATIO_TYYPPI_NIMET[arvo]}
            </option>
          ))}
        </select>
        <button type="submit" className="mt-1 w-fit rounded border border-border px-3 py-2 text-sm">
          Suodata
        </button>
      </form>

      <section className="mt-10" aria-labelledby="organisaatiot-otsikko">
        <h2 id="organisaatiot-otsikko" className="text-xl font-semibold">
          Organisaatiot
        </h2>
        {orgVirhe ? (
          <p className="mt-3 text-sm">{orgVirhe}</p>
        ) : organisaatiot.length === 0 ? (
          <p className="mt-3">Ei julkaistuja organisaatioita valitulla suodattimella.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {organisaatiot.map((organisaatio) => (
              <li key={organisaatio.id} className="py-4">
                <h3 className="font-semibold">
                  <a
                    href={`/organisaatiot/${organisaatio.id}`}
                    className="text-link underline"
                  >
                    {organisaatio.nimi}
                  </a>
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {ORGANISAATIO_TYYPPI_NIMET[organisaatio.tyyppi]}
                  {organisaatio.y_tunnus ? ` · Y-tunnus ${organisaatio.y_tunnus}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
