import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KarttaViive } from "@/komponentit/kartta-viive";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import type { Karttamerkki } from "@/komponentit/kartta";
import { konsulttiSivuPolku } from "@/lib/konsultti-slug";
import { hankeTehoMw } from "@/lib/naytto";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";
import { haeKonsulttiSlugilla } from "@/lib/supabase/kyselyt";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { konsultti, hankkeet } = await haeKonsulttiSlugilla(slug);
  if (!konsultti) {
    return { title: `Konsultti – ${SIVUSTON_OTSIKKO}` };
  }
  const lkm = hankkeet.length;
  const kuvaus =
    lkm === 0
      ? `${konsultti.nimi}: ei vielä julkaistuja konsulttirooleja.`
      : `${konsultti.nimi}: merkitty konsultiksi ${lkm} ${lkm === 1 ? "hankkeessa" : "hankkeessa"}. Tiedot YVA-asiakirjoista.`;
  return kortinMetatiedot({
    otsikko: `${konsultti.nimi} – ${SIVUSTON_OTSIKKO}`,
    kuvaus,
    polku: konsulttiSivuPolku(konsultti.slug),
  });
}

export default async function KonsulttiSivu({ params }: Props) {
  const { slug } = await params;
  const { konsultti, hankkeet, virhe } = await haeKonsulttiSlugilla(slug);
  if (virhe) {
    return (
      <main id="sisalto" className="sivuleveys flex-1 py-10">
        <p className="text-sm">{virhe}</p>
      </main>
    );
  }
  if (!konsultti) notFound();

  const merkit: Karttamerkki[] = hankkeet.flatMap((hanke) => {
    const alue = hanke.sijainti_alue?.type === "Polygon" ? hanke.sijainti_alue : null;
    if (hanke.sijainti_lat == null && hanke.sijainti_lon == null && !alue) return [];
    return [
      {
        id: hanke.id,
        nimi: hanke.nimi,
        vaihe: hanke.vaihe,
        lat: hanke.sijainti_lat != null ? Number(hanke.sijainti_lat) : undefined,
        lon: hanke.sijainti_lon != null ? Number(hanke.sijainti_lon) : undefined,
        tehoMw: hankeTehoMw(hanke),
        alue,
      },
    ];
  });

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
        {" · "}
        <a href="/konsultit" className="text-link underline">
          Konsultit
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{konsultti.nimi}</h1>
      {konsultti.y_tunnus ? (
        <p className="mt-2 text-muted">Y-tunnus {konsultti.y_tunnus}</p>
      ) : (
        <p className="mt-2 text-muted">Y-tunnusta ei ole merkitty.</p>
      )}
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
        Konsultti on merkitty siltä osin kuin se ilmenee hankkeen YVA-asiakirjoista. Hankkeella,
        jolla ei ole YVA-menettelyä, ei ole konsulttitietoa.
      </p>

      <section className="mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        {hankkeet.length === 0 ? (
          <p className="mt-3">Ei julkaistuja konsulttirooleja.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {hankkeet.map((hanke) => (
              <li key={hanke.id} className="py-3">
                <p>
                  <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                    {hanke.nimi}
                  </a>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {hanke.kunta} · <VaiheMerkki vaihe={hanke.vaihe} />
                </p>
                {hanke.lahde_url ? (
                  <p className="mt-1 text-sm">
                    <a
                      href={hanke.lahde_url}
                      className="text-link underline"
                      rel="noopener noreferrer"
                    >
                      {hanke.dokumentti_otsikko?.trim() || "Asiakirja, josta rooli ilmenee"}
                    </a>
                    {hanke.lahde_kohta ? (
                      <span className="text-muted"> · {hanke.lahde_kohta}</span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {merkit.length > 0 ? (
        <section className="mt-10" aria-labelledby="kartta-otsikko">
          <h2 id="kartta-otsikko" className="text-xl font-semibold">
            Kartta
          </h2>
          <div className="mt-4">
            <KarttaViive
              merkit={merkit}
              kuntaSelite={{
                kunta: konsultti.nimi,
                maakunta: null,
                hankkeita: hankkeet.length,
              }}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}
