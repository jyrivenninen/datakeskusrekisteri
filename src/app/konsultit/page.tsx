import type { Metadata } from "next";
import { konsulttiSivuPolku } from "@/lib/konsultti-slug";
import { hankeOrganisaatioRooliNimi } from "@/lib/naytto";
import { haeKonsultitJoissaHankkeita } from "@/lib/supabase/kyselyt";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const revalidate = 300;

export const metadata: Metadata = kortinMetatiedot({
  otsikko: `Konsultit – ${SIVUSTON_OTSIKKO}`,
  kuvaus:
    "YVA-konsultit, kaavan laatijat ja lupahakemuksen laatijat hankkeittain. Ei arvioita eikä vertailua.",
  polku: "/konsultit",
});

export default async function KonsultitHakemistoSivu() {
  const { ryhmat, konsultit, virhe } = await haeKonsultitJoissaHankkeita();

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Konsultit</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Organisaatiot, jotka on merkitty hankkeen asiakirjoissa YVA-konsultiksi, kaavan
        laatijaksi tai lupahakemuksen laatijaksi. Sivu listaa hankkeet ja asiakirjat. Se ei
        arvioi toimijaa eikä vertaile konsultteja.
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
        Kaavan laatija työskentelee usein kunnan lukuun. YVA-konsultti työskentelee hankkeesta
        vastaavan lukuun.
      </p>

      {virhe ? (
        <p className="mt-6 text-sm">{virhe}</p>
      ) : konsultit.length === 0 ? (
        <p className="mt-6 leading-relaxed">
          Ei vielä julkaistuja konsulttirooleja. Ehdotukset odottavat ylläpidon hyväksyntää.
        </p>
      ) : (
        <div className="mt-10 space-y-10">
          {ryhmat.map((ryhma) => (
            <section key={ryhma.rooli} aria-labelledby={`rooli-${ryhma.rooli}`}>
              <h2 id={`rooli-${ryhma.rooli}`} className="text-xl font-semibold">
                {hankeOrganisaatioRooliNimi(ryhma.rooli)}
              </h2>
              {ryhma.konsultit.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Ei vielä merkittyjä.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {ryhma.konsultit.map((k) => (
                    <li
                      key={`${ryhma.rooli}-${k.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                    >
                      <div>
                        <a
                          href={konsulttiSivuPolku(k.slug)}
                          className="text-lg font-semibold text-link underline"
                        >
                          {k.nimi}
                        </a>
                        {k.y_tunnus ? (
                          <p className="mt-0.5 text-sm text-muted">Y-tunnus {k.y_tunnus}</p>
                        ) : null}
                      </div>
                      <p className="text-sm tabular-nums text-muted">
                        {k.hankkeita} {k.hankkeita === 1 ? "hanke" : "hanketta"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
