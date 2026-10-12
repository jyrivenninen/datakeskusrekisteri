import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KarttaViive } from "@/komponentit/kartta-viive";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import type { Karttamerkki } from "@/komponentit/kartta";
import { gleifTietueUrl } from "@/lib/gleif";
import { hankeTehoMw } from "@/lib/naytto";
import { toimijaSivuPolku } from "@/lib/toimija-slug";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";
import { haeToimijaSlugilla } from "@/lib/supabase/kyselyt";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { toimija, hankkeet } = await haeToimijaSlugilla(slug);
  if (!toimija) {
    return { title: `Toimija – ${SIVUSTON_OTSIKKO}` };
  }
  const lkm = hankkeet.length;
  const kuvaus =
    lkm === 0
      ? `${toimija.nimi}: ei vielä julkaistuja hankkeita hankkeesta vastaavana.`
      : `${toimija.nimi}: merkitty hankkeesta vastaavaksi ${lkm} ${lkm === 1 ? "hankkeessa" : "hankkeessa"}.`;
  return kortinMetatiedot({
    otsikko: `${toimija.nimi} – ${SIVUSTON_OTSIKKO}`,
    kuvaus,
    polku: toimijaSivuPolku(toimija.slug),
  });
}

export default async function ToimijaSivu({ params }: Props) {
  const { slug } = await params;
  const { toimija, hankkeet, virhe } = await haeToimijaSlugilla(slug);
  if (virhe) {
    return (
      <main id="sisalto" className="sivuleveys flex-1 py-10">
        <p className="text-sm">{virhe}</p>
      </main>
    );
  }
  if (!toimija) notFound();

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
        arvio: hanke.sijainti_alue_tyyppi === "arvio",
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
        <a href="/toimijat" className="text-link underline">
          Toimijat
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{toimija.nimi}</h1>
      <p className="mt-2 text-muted">Hankkeesta vastaava</p>
      <dl className="mt-6 divide-y divide-border border-y border-border">
        <div className="py-3">
          <dt className="font-medium">Y-tunnus</dt>
          <dd className="mt-1">
            {toimija.y_tunnus ?? <span className="text-muted">Ei merkitty</span>}
          </dd>
        </div>
        <div className="py-3">
          <dt className="font-medium">LEI</dt>
          <dd className="mt-1">
            {toimija.lei ? (
              <a
                href={gleifTietueUrl(toimija.lei)}
                className="font-mono text-link underline"
                rel="noopener noreferrer"
              >
                {toimija.lei}
              </a>
            ) : (
              <span className="text-muted">Ei merkitty</span>
            )}
          </dd>
        </div>
        {toimija.verkko_osoite ? (
          <div className="py-3">
            <dt className="font-medium">Verkko-osoite</dt>
            <dd className="mt-1">
              <a
                href={toimija.verkko_osoite}
                className="text-link underline"
                rel="noopener noreferrer"
              >
                {toimija.verkko_osoite}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted">
        Tiedot on merkitty siltä osin kuin ne ilmenevät hankkeen asiakirjoista tai
        viranomaisrekistereistä. Konsernihierarkiaa ei näytetä tällä sivulla.
      </p>

      <section className="mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        {hankkeet.length === 0 ? (
          <p className="mt-3">Ei julkaistuja hankkeita.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {hankkeet.map((hanke) => (
              <li key={hanke.id} className="py-3">
                <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                  {hanke.nimi}
                </a>
                <p className="mt-1 text-sm text-muted">
                  {hanke.kunta} · <VaiheMerkki vaihe={hanke.vaihe} />
                </p>
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
                kunta: toimija.nimi,
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
