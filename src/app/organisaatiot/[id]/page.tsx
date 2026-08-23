import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HANKE_ORGANISAATIO_ROOLI_NIMET, ORGANISAATIO_TYYPPI_NIMET } from "@/lib/naytto";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import { haeOrganisaatio } from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { organisaatio } = await haeOrganisaatio(id);
  if (!organisaatio) {
    return { title: "Organisaatiota ei löytynyt" };
  }
  return {
    title: `${organisaatio.nimi} – Datakeskushankkeiden kansallinen rekisteri`,
    description: `Julkaistut tiedot organisaatiosta ${organisaatio.nimi}.`,
  };
}

export default async function OrganisaatioSivu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organisaatio, hankkeet, virhe } = await haeOrganisaatio(id);

  if (virhe) {
    return (
      <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">Organisaatiota ei voitu ladata</h1>
        <p className="mt-3">{virhe}</p>
      </main>
    );
  }

  if (!organisaatio) {
    notFound();
  }

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/hakemisto" className="text-link underline">
          Hakemisto
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{organisaatio.nimi}</h1>
      <p className="mt-2 text-muted">{ORGANISAATIO_TYYPPI_NIMET[organisaatio.tyyppi]}</p>

      <dl className="mt-8 divide-y divide-border border-y border-border">
        <div className="py-4">
          <dt className="font-medium">Y-tunnus</dt>
          <dd className="mt-1">
            {organisaatio.y_tunnus ?? <span className="text-muted">Ei merkitty</span>}
          </dd>
        </div>
        <div className="py-4">
          <dt className="font-medium">Verkko-osoite</dt>
          <dd className="mt-1">
            {organisaatio.verkko_osoite ? (
              <a
                href={organisaatio.verkko_osoite}
                className="text-link underline"
                rel="noopener noreferrer"
              >
                {organisaatio.verkko_osoite}
              </a>
            ) : (
              <span className="text-muted">Ei merkitty</span>
            )}
          </dd>
        </div>
      </dl>

      <section className="mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        {hankkeet.length === 0 ? (
          <p className="mt-3">Ei merkittyjä hankkeita.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {hankkeet.map((hanke) => (
              <li key={hanke.id} className="py-3">
                <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                  {hanke.nimi}
                </a>
                <p className="mt-1 text-sm text-muted">
                  {hanke.roolit.map((rooli) => HANKE_ORGANISAATIO_ROOLI_NIMET[rooli]).join(", ")}
                  {" · "}
                  {hanke.kunta} · <VaiheMerkki vaihe={hanke.vaihe} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
