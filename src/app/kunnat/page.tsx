import type { Metadata } from "next";
import { HakemistoJarjestysValinta } from "@/komponentit/hakemisto-jarjestys";
import {
  jarjestaHakemistoRivit,
  parsiHakemistoJarjestys,
} from "@/lib/hakemisto-jarjestys";
import { kuntaSivuPolku } from "@/lib/kunta-slug";
import { haeKunnatJoissaHankkeita } from "@/lib/supabase/kyselyt";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const revalidate = 300;

export const metadata: Metadata = kortinMetatiedot({
  otsikko: `Kunnat – ${SIVUSTON_OTSIKKO}`,
  kuvaus:
    "Datakeskushankkeet kunnittain. Jokaisella kunnalla on oma sivu hankkeista, määräajoista ja asiakirjoista.",
  polku: "/kunnat",
});

export default async function KunnatHakemistoSivu({
  searchParams,
}: {
  searchParams: Promise<{ jarjestys?: string }>;
}) {
  const { jarjestys: jarjestysRaaka } = await searchParams;
  const jarjestys = parsiHakemistoJarjestys(jarjestysRaaka);
  const { kunnat: raaka, virhe } = await haeKunnatJoissaHankkeita();
  const kunnat = jarjestaHakemistoRivit(raaka, jarjestys);

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Kunnat</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Kunnat, joissa rekisterissä on vähintään yksi julkaistu datakeskushanke.
        Kuntasivulla ovat hankkeet, tulevat määräajat, asiakirjat ja viimeisimmät
        muutokset.
      </p>

      {virhe ? (
        <p className="mt-6 text-sm">{virhe}</p>
      ) : kunnat.length === 0 ? (
        <p className="mt-6 leading-relaxed">Ei kuntia, joilla olisi julkaistuja hankkeita.</p>
      ) : (
        <>
          <div className="mt-8 flex justify-end">
            <HakemistoJarjestysValinta polku="/kunnat" jarjestys={jarjestys} />
          </div>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {kunnat.map((kunta) => (
              <li key={kunta.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div>
                  <a href={kuntaSivuPolku(kunta.slug)} className="text-lg font-semibold text-link underline">
                    {kunta.nimi}
                  </a>
                  {kunta.maakunta ? (
                    <p className="mt-0.5 text-sm text-muted">{kunta.maakunta}</p>
                  ) : null}
                </div>
                <p className="text-sm tabular-nums text-muted">
                  {kunta.hankkeita} {kunta.hankkeita === 1 ? "hanke" : "hanketta"}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
