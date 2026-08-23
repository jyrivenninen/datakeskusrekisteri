import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kartta } from "@/komponentit/kartta";
import { Lahdeluettelo } from "@/komponentit/lahdeluettelo";
import {
  HANKE_KENTTA_NIMET,
  MAARAAJA_NIMET,
  VAIHE_NIMET,
  muotoileLuku,
  muotoilePvm,
} from "@/lib/naytto";
import { haeHanke } from "@/lib/supabase/kyselyt";
import type { Hanke, KenttaLahde } from "@/lib/supabase/tietokanta";

export const revalidate = 60;

function kentanLahteet(lahteet: KenttaLahde[], kentta: string): KenttaLahde[] {
  return lahteet.filter((lahde) => lahde.kentta === kentta);
}

function Faktakentta({
  kentta,
  arvo,
  lahteet,
  href,
}: {
  kentta: string;
  arvo: string | null;
  lahteet: KenttaLahde[];
  href?: string | null;
}) {
  return (
    <div className="border-b border-border py-4">
      <dt className="font-medium">{HANKE_KENTTA_NIMET[kentta] ?? kentta}</dt>
      <dd className="mt-1">
        {arvo ? (
          href ? (
            <a href={href} className="text-link underline">
              {arvo}
            </a>
          ) : (
            arvo
          )
        ) : (
          <span className="text-muted">Ei merkitty</span>
        )}
        {arvo || kentanLahteet(lahteet, kentta).length > 0 ? (
          <Lahdeluettelo lahteet={kentanLahteet(lahteet, kentta)} />
        ) : null}
      </dd>
    </div>
  );
}

function hankeKentat(hanke: Hanke & { toimija: { id: string; nimi: string } | null }): {
  kentta: string;
  arvo: string | null;
  href?: string | null;
}[] {
  return [
    { kentta: "nimi", arvo: hanke.nimi },
    { kentta: "kunta", arvo: hanke.kunta },
    { kentta: "maakunta", arvo: hanke.maakunta },
    {
      kentta: "sijainti",
      arvo:
        hanke.sijainti_lat != null && hanke.sijainti_lon != null
          ? `${muotoileLuku(hanke.sijainti_lat)}, ${muotoileLuku(hanke.sijainti_lon)}`
          : null,
    },
    { kentta: "vaihe", arvo: VAIHE_NIMET[hanke.vaihe] },
    { kentta: "teho_mw", arvo: hanke.teho_mw != null ? muotoileLuku(hanke.teho_mw) : null },
    { kentta: "it_teho_mw", arvo: hanke.it_teho_mw != null ? muotoileLuku(hanke.it_teho_mw) : null },
    {
      kentta: "pinta_ala_ha",
      arvo: hanke.pinta_ala_ha != null ? muotoileLuku(hanke.pinta_ala_ha) : null,
    },
    {
      kentta: "sahkonkaytto_twh_a",
      arvo: hanke.sahkonkaytto_twh_a != null ? muotoileLuku(hanke.sahkonkaytto_twh_a) : null,
    },
    {
      kentta: "generaattorit_lkm",
      arvo: hanke.generaattorit_lkm != null ? String(hanke.generaattorit_lkm) : null,
    },
    {
      kentta: "generaattorit_kaytossa_max_lkm",
      arvo:
        hanke.generaattorit_kaytossa_max_lkm != null
          ? String(hanke.generaattorit_kaytossa_max_lkm)
          : null,
    },
    {
      kentta: "generaattori_polttoaineteho_mw",
      arvo:
        hanke.generaattori_polttoaineteho_mw != null
          ? muotoileLuku(hanke.generaattori_polttoaineteho_mw)
          : null,
    },
    {
      kentta: "toimija_organisaatio_id",
      arvo: hanke.toimija?.nimi ?? null,
      href: hanke.toimija ? `/organisaatiot/${hanke.toimija.id}` : null,
    },
    { kentta: "yva_diaarinumero", arvo: hanke.yva_diaarinumero },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { hanke } = await haeHanke(id);
  if (!hanke) {
    return { title: "Hanketta ei löytynyt" };
  }
  return {
    title: `${hanke.nimi} – Datakeskushankkeiden kansallinen rekisteri`,
    description: `Julkaistut tiedot hankkeesta ${hanke.nimi}, ${hanke.kunta}.`,
  };
}

export default async function HankeSivu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { hanke, lahteet, maaraajat, maaraajaLahteet, yhteyshenkilot, virhe } =
    await haeHanke(id);

  if (virhe) {
    return (
      <main id="sisalto" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">Hanketta ei voitu ladata</h1>
        <p className="mt-3">{virhe}</p>
      </main>
    );
  }

  if (!hanke) {
    notFound();
  }

  const merkit =
    hanke.sijainti_lat != null && hanke.sijainti_lon != null
      ? [
          {
            id: hanke.id,
            nimi: hanke.nimi,
            lat: Number(hanke.sijainti_lat),
            lon: Number(hanke.sijainti_lon),
          },
        ]
      : [];

  return (
    <main id="sisalto" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{hanke.nimi}</h1>
      <p className="mt-2 text-muted">
        {hanke.kunta}
        {hanke.maakunta ? `, ${hanke.maakunta}` : ""} · {VAIHE_NIMET[hanke.vaihe]}
      </p>

      <section className="mt-8" aria-labelledby="tiedot-otsikko">
        <h2 id="tiedot-otsikko" className="text-xl font-semibold">
          Tiedot ja lähteet
        </h2>
        <dl className="mt-2">
          {hankeKentat(hanke).map((rivi) => (
            <Faktakentta
              key={rivi.kentta}
              kentta={rivi.kentta}
              arvo={rivi.arvo}
              href={rivi.href}
              lahteet={lahteet}
            />
          ))}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="maaraajat-otsikko">
        <h2 id="maaraajat-otsikko" className="text-xl font-semibold">
          Määräajat
        </h2>
        <p className="mt-2 text-sm">
          <a href="/opas/yva-mielipide" className="text-link underline">
            Näin teet YVA-mielipiteen
          </a>
        </p>
        {maaraajat.length === 0 ? (
          <p className="mt-3">Ei merkittyjä määräaikoja.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {maaraajat.map((maaraaika) => (
              <li key={maaraaika.id} className="rounded border border-border bg-surface p-4">
                <p className="font-medium">{MAARAAJA_NIMET[maaraaika.tyyppi]}</p>
                <p className="mt-1 text-sm">
                  {maaraaika.alkaa_pvm ? `${muotoilePvm(maaraaika.alkaa_pvm)} – ` : ""}
                  {muotoilePvm(maaraaika.paattyy_pvm)}
                </p>
                <Lahdeluettelo
                  lahteet={maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="yhteydet-otsikko">
        <h2 id="yhteydet-otsikko" className="text-xl font-semibold">
          Yhteyshenkilöt
        </h2>
        {yhteyshenkilot.length === 0 ? (
          <p className="mt-3">Ei merkittyjä yhteyshenkilöitä.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {yhteyshenkilot.map((henkilo) => (
              <li key={henkilo.id}>
                <p className="font-medium">{henkilo.nimi}</p>
                <p className="text-sm text-muted">
                  {henkilo.rooli}
                  {henkilo.organisaatio ? `, ${henkilo.organisaatio.nimi}` : ""}
                </p>
                {henkilo.sahkoposti ? (
                  <p className="text-sm">
                    <a href={`mailto:${henkilo.sahkoposti}`} className="text-link underline">
                      {henkilo.sahkoposti}
                    </a>
                  </p>
                ) : null}
                {henkilo.puhelin ? <p className="text-sm">{henkilo.puhelin}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="kartta-otsikko">
        <h2 id="kartta-otsikko" className="text-xl font-semibold">
          Sijainti kartalla
        </h2>
        <div className="mt-4">
          <Kartta merkit={merkit} />
        </div>
      </section>
    </main>
  );
}
