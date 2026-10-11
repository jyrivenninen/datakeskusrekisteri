import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AjankohtaKohta, AjankohtaLista, LahdeRivi } from "@/komponentit/ajankohta-lista";
import { HankeLuetteloOsio } from "@/komponentit/hanke-luettelo-jarjestys";
import { KarttaViive } from "@/komponentit/kartta-viive";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import { jarjestaHankkeet, parsiHankeJarjestys } from "@/lib/hanke-jarjestys";
import { hankeVaihtelvalit } from "@/lib/hanke-vaihtelvali";
import { kokoaKarttaSivuData } from "@/lib/kartta-sivu";
import { kuntaSivuPolku } from "@/lib/kunta-slug";
import { naytaDokumenttiOtsikko } from "@/lib/lahde-metatiedot";
import { normalisoiKuntaNimi } from "@/lib/maakunta";
import {
  MUUTOS_SIVU_KOKO,
  muotoilePvmLyhyt,
  muutosYlarivi,
} from "@/lib/muutos-naytto";
import {
  MAARAAJA_NIMET,
  muotoilePvm,
  muotoileVaihtelvali,
  VAIHE_NIMET,
} from "@/lib/naytto";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";
import {
  haeJulkaistutHankkeet,
  haeJulkaistutMuutokset,
  haeKunnanAsiakirjat,
  haeKuntaSlugilla,
  haeTulevatMaaraajat,
} from "@/lib/supabase/kyselyt";
import { HANKE_VAIHEET, type HankeVaihe } from "@/lib/supabase/tietokanta";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ jarjestys?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { kunta } = await haeKuntaSlugilla(slug);
  if (!kunta) {
    return { title: `Kunta – ${SIVUSTON_OTSIKKO}` };
  }
  const { hankkeet } = await haeJulkaistutHankkeet({ kunta: kunta.nimi });
  const lkm = hankkeet.length;
  const kuvaus =
    lkm === 0
      ? `Datakeskushankkeet kunnassa ${kunta.nimi}.`
      : `${kunta.nimi}: ${lkm} ${lkm === 1 ? "datakeskushanke" : "datakeskushanketta"}. Hankkeet, määräajat ja asiakirjat.`;
  return {
    ...kortinMetatiedot({
      otsikko: `${kunta.nimi} – ${SIVUSTON_OTSIKKO}`,
      kuvaus,
      polku: kuntaSivuPolku(kunta.slug),
    }),
    alternates: {
      canonical: kuntaSivuPolku(kunta.slug),
      types: {
        "application/rss+xml": `${kuntaSivuPolku(kunta.slug)}/rss`,
        "application/json": `${kuntaSivuPolku(kunta.slug)}/json`,
      },
    },
  };
}

function vaiheLukumäärät(hankkeet: { vaihe: HankeVaihe }[]): Partial<Record<HankeVaihe, number>> {
  const tulos: Partial<Record<HankeVaihe, number>> = {};
  for (const hanke of hankkeet) {
    tulos[hanke.vaihe] = (tulos[hanke.vaihe] ?? 0) + 1;
  }
  return tulos;
}

export default async function KuntaSivu({ params, searchParams }: Props) {
  const { slug } = await params;
  const { jarjestys: jarjestysRaw } = await searchParams;
  const { kunta, virhe: kuntaVirhe } = await haeKuntaSlugilla(slug);
  if (kuntaVirhe) {
    return (
      <main id="sisalto" className="sivuleveys flex-1 py-10">
        <p className="text-sm">{kuntaVirhe}</p>
      </main>
    );
  }
  if (!kunta) notFound();

  const jarjestys = parsiHankeJarjestys(jarjestysRaw ?? "paivitetty");
  const suodatus = { jarjestys: jarjestys === "nimi" ? undefined : jarjestys };
  const polku = kuntaSivuPolku(kunta.slug);

  const [lista, maaraajaTulos, muutosTulos, asiakirjaTulos] = await Promise.all([
    haeJulkaistutHankkeet({ kunta: kunta.nimi }),
    haeTulevatMaaraajat({ kunta: kunta.nimi, raja: 50 }),
    haeJulkaistutMuutokset({ kunta: kunta.nimi, raja: MUUTOS_SIVU_KOKO }),
    haeKunnanAsiakirjat(kunta.nimi),
  ]);

  if (lista.hankkeet.length === 0) notFound();

  const { merkit } = kokoaKarttaSivuData(lista, {
    fingridTuotanto: null,
    kuntaMaakunnat: new Map([[normalisoiKuntaNimi(kunta.nimi), kunta.maakunta ?? ""]]),
    liityntapisteet: [],
  });
  const jarjestetyt = jarjestaHankkeet(lista.hankkeet, jarjestys);
  const vaiheLkm = vaiheLukumäärät(lista.hankkeet);
  const vaiheTeksti = HANKE_VAIHEET.filter((v) => (vaiheLkm[v] ?? 0) > 0)
    .map((v) => `${VAIHE_NIMET[v]} ${vaiheLkm[v]}`)
    .join(" · ");

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
        {" · "}
        <a href="/kunnat" className="text-link underline">
          Kunnat
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{kunta.nimi}</h1>
      <p className="mt-2 text-muted">
        {kunta.maakunta ? `${kunta.maakunta} · ` : ""}
        {lista.hankkeet.length}{" "}
        {lista.hankkeet.length === 1 ? "hanke" : "hanketta"}
        {vaiheTeksti ? ` · ${vaiheTeksti}` : ""}
      </p>
      <p className="mt-3 text-sm">
        <a href={`${polku}/rss`} className="text-link underline">
          RSS
        </a>
        {" · "}
        <a href={`${polku}/json`} className="text-link underline">
          JSON
        </a>
        <span className="text-muted"> · CC BY 4.0</span>
      </p>

      <section className="mt-10" aria-labelledby="maaraajat-otsikko">
        <h2 id="maaraajat-otsikko" className="text-xl font-semibold">
          Tulevat määräajat
        </h2>
        {maaraajaTulos.virhe ? (
          <p className="mt-3 text-sm">{maaraajaTulos.virhe}</p>
        ) : maaraajaTulos.maaraajat.length === 0 ? (
          <p className="mt-3 text-sm leading-snug">Ei tulevia määräaikoja tässä kunnassa.</p>
        ) : (
          <AjankohtaLista>
            {maaraajaTulos.maaraajat.map((maaraaika) => (
              <AjankohtaKohta
                key={maaraaika.id}
                ylarivi={`${muotoilePvmLyhyt(maaraaika.paattyy_pvm)} · ${MAARAAJA_NIMET[maaraaika.tyyppi]}`}
                href={`/hankkeet/${maaraaika.hanke.id}`}
                nimi={maaraaika.hanke.nimi}
                kunta={maaraaika.hanke.kunta}
              />
            ))}
          </AjankohtaLista>
        )}
      </section>

      <section className="mt-10" aria-labelledby="kartta-otsikko">
        <h2 id="kartta-otsikko" className="text-xl font-semibold">
          Kartta
        </h2>
        {merkit.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Hankkeilla ei ole merkittyä sijaintia kartalle.</p>
        ) : (
          <div className="mt-4">
            <KarttaViive
              merkit={merkit}
              kuntaSelite={{
                kunta: kunta.nimi,
                maakunta: kunta.maakunta,
                hankkeita: lista.hankkeet.length,
              }}
            />
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="hankeluettelo-otsikko">
        <HankeLuetteloOsio
          suodatus={suodatus}
          toiminto={polku}
          otsikko="Hankkeet"
          otsikkoTaso="h2"
        >
          {lista.virhe ? (
            <p className="mt-4 text-sm">{lista.virhe}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {jarjestetyt.map((hanke) => {
                const teho = hankeVaihtelvalit(hanke, hanke.vaihtoehdot).teho;
                return (
                  <li key={hanke.id} className="py-4">
                    <h3 className="text-lg font-semibold">
                      <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                        {hanke.nimi}
                      </a>
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      <VaiheMerkki vaihe={hanke.vaihe} />
                      {teho ? ` · ${muotoileVaihtelvali(teho.min, teho.max, "MW")}` : ""}
                      {hanke.paivitetty_pvm
                        ? ` · päivitetty ${muotoilePvm(hanke.paivitetty_pvm)}`
                        : ""}
                      {hanke.vanhin_vahvistettu_pvm
                        ? ` · vanhin tarkistettu ${muotoilePvm(hanke.vanhin_vahvistettu_pvm)}`
                        : ""}
                      {hanke.viimeisin_paatos
                        ? ` · ${hanke.viimeisin_paatos.kuvaus} · ${muotoilePvm(hanke.viimeisin_paatos.pvm)}`
                        : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </HankeLuetteloOsio>
      </section>

      <section className="mt-10" aria-labelledby="asiakirjat-otsikko">
        <h2 id="asiakirjat-otsikko" className="text-xl font-semibold">
          Asiakirjat
        </h2>
        <p className="mt-2 text-sm text-muted">
          Kunnan hankkeisiin liittyvät lähdeasiakirjat, uusimmat ensin. Menetelmälähteet
          (esim. geokoodaus) on jätetty pois.
        </p>
        {asiakirjaTulos.virhe ? (
          <p className="mt-3 text-sm">{asiakirjaTulos.virhe}</p>
        ) : asiakirjaTulos.asiakirjat.length === 0 ? (
          <p className="mt-3">Ei merkittyjä asiakirjoja.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {asiakirjaTulos.asiakirjat.map((asiakirja) => (
              <li key={asiakirja.id} className="py-3">
                <p>
                  <a
                    href={asiakirja.url}
                    className="font-medium text-link underline"
                    rel="noopener noreferrer"
                  >
                    {naytaDokumenttiOtsikko(asiakirja)}
                  </a>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {asiakirja.julkaisija ?? "Julkaisija ei merkitty"}
                  {asiakirja.julkaistu_pvm
                    ? ` · ${muotoilePvm(asiakirja.julkaistu_pvm)}`
                    : ""}
                  {" · "}
                  <a href={`/hankkeet/${asiakirja.hanke_id}`} className="text-link underline">
                    {asiakirja.hanke_nimi}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="muutokset-otsikko">
        <h2 id="muutokset-otsikko" className="text-xl font-semibold">
          Viimeksi päivitetty
        </h2>
        {muutosTulos.virhe ? (
          <p className="mt-3 text-sm">{muutosTulos.virhe}</p>
        ) : muutosTulos.muutokset.length === 0 ? (
          <p className="mt-3 leading-relaxed">Ei hyväksyttyjä muutoksia tämän kunnan hankkeisiin.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {muutosTulos.muutokset.map((muutos) => (
              <li key={muutos.id} className="py-3">
                <p className="text-sm">
                  {muotoilePvm(muutos.hyvaksytty_pvm)}
                  {" · "}
                  {muutosYlarivi(muutos.kentta, muutos.uusi_arvo)}
                </p>
                <p className="mt-1">
                  <a href={`/hankkeet/${muutos.hanke.id}`} className="text-link underline">
                    {muutos.hanke.nimi}
                  </a>
                </p>
                <LahdeRivi url={muutos.lahde_url} otsikko={muutos.lahde_otsikko} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
