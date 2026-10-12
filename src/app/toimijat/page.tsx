import type { Metadata } from "next";
import { HakemistoJarjestysValinta } from "@/komponentit/hakemisto-jarjestys";
import {
  jarjestaHakemistoRivit,
  parsiHakemistoJarjestys,
} from "@/lib/hakemisto-jarjestys";
import { toimijaSivuPolku } from "@/lib/toimija-slug";
import { haeToimijatJoissaHankkeita } from "@/lib/supabase/kyselyt";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const revalidate = 300;

export const metadata: Metadata = kortinMetatiedot({
  otsikko: `Toimijat – ${SIVUSTON_OTSIKKO}`,
  kuvaus:
    "Hankkeesta vastaavat organisaatiot. Sivu listaa hankkeet; ei konsernihierarkiaa eikä arvioita.",
  polku: "/toimijat",
});

export default async function ToimijatHakemistoSivu({
  searchParams,
}: {
  searchParams: Promise<{ jarjestys?: string }>;
}) {
  const { jarjestys: jarjestysRaaka } = await searchParams;
  const jarjestys = parsiHakemistoJarjestys(jarjestysRaaka);
  const { toimijat: raaka, virhe } = await haeToimijatJoissaHankkeita();
  const toimijat = jarjestaHakemistoRivit(raaka, jarjestys);

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Toimijat</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Organisaatiot, jotka on merkitty hankkeesta vastaaviksi. Sivu listaa hankkeet.
        Se ei arvioi toimijaa eikä näytä konsernihierarkiaa.
      </p>

      {virhe ? (
        <p className="mt-6 text-sm">{virhe}</p>
      ) : toimijat.length === 0 ? (
        <p className="mt-6 leading-relaxed">
          Ei vielä julkaistuja hankkeesta vastaavia organisaatioita.
        </p>
      ) : (
        <>
          <div className="mt-8 flex justify-end">
            <HakemistoJarjestysValinta polku="/toimijat" jarjestys={jarjestys} />
          </div>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {toimijat.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div>
                  <a
                    href={toimijaSivuPolku(t.slug)}
                    className="text-lg font-semibold text-link underline"
                  >
                    {t.nimi}
                  </a>
                  <p className="mt-0.5 text-sm text-muted">
                    {[t.y_tunnus ? `Y-tunnus ${t.y_tunnus}` : null, t.lei ? `LEI ${t.lei}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Tunnuksia ei merkitty"}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-muted">
                  {t.hankkeita} {t.hankkeita === 1 ? "hanke" : "hanketta"}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
