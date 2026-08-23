import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kartta } from "@/komponentit/kartta";
import { Lahdeluettelo } from "@/komponentit/lahdeluettelo";
import { Liikennevalo } from "@/komponentit/liikennevalo";
import {
  DOKUMENTTI_KIELI_NIMET,
  DOKUMENTTI_LAJI_NIMET,
  DOKUMENTTI_MUOTO_NIMET,
  JOHTO_TYYPPI_NIMET,
  HANKE_KENTTA_NIMET,
  HANKE_KUNTA_ROOLI_NIMET,
  HANKE_ORGANISAATIO_ROOLI_NIMET,
  MAARAAJA_NIMET,
  MENETTELY_LAJI_NIMET,
  MENETTELY_TILA_NIMET,
  SIJAINTI_ALUE_TYYPPI_NIMET,
  VAIHE_NIMET,
  kentanTila,
  kenttaNayttonimi,
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
  lahdeKentta,
}: {
  kentta: string;
  arvo: string | null;
  lahteet: KenttaLahde[];
  href?: string | null;
  lahdeKentta?: string;
}) {
  const naytettavat = kentanLahteet(lahteet, lahdeKentta ?? kentta);
  const tila = kentanTila(arvo != null && arvo !== "", naytettavat);
  return (
    <div className="border-b border-border py-4">
      <dt className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{HANKE_KENTTA_NIMET[kentta] ?? kentta}</span>
        <Liikennevalo tila={tila} />
      </dt>
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
        <Lahdeluettelo lahteet={naytettavat} />
      </dd>
    </div>
  );
}

function hankeKentat(hanke: Hanke & { toimija: { id: string; nimi: string } | null }): {
  kentta: string;
  arvo: string | null;
  href?: string | null;
  lahdeKentta?: string;
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
    {
      kentta: "sijainti_alue_tyyppi",
      arvo: hanke.sijainti_alue_tyyppi
        ? SIJAINTI_ALUE_TYYPPI_NIMET[hanke.sijainti_alue_tyyppi]
        : null,
      lahdeKentta: "sijainti",
    },
    { kentta: "kaavatunnus", arvo: hanke.kaavatunnus },
    { kentta: "kortteli", arvo: hanke.kortteli },
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
  const {
    hanke,
    lahteet,
    kunnat,
    kuntaLahteet,
    menettelyt,
    menettelyLahteet,
    organisaatioroolit,
    organisaatiorooliLahteet,
    maaraajat,
    maaraajaLahteet,
    asiakirjat,
    johdot,
    johtoLahteet,
    vaihtoehdot,
    vaihtoehtoLahteet,
    yhteyshenkilot,
    virhe,
  } = await haeHanke(id);

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

  const alue = hanke.sijainti_alue?.type === "Polygon" ? hanke.sijainti_alue : null;
  const karttajohdot = johdot
    .map((johto) =>
      johto.reitti &&
      (johto.reitti.type === "LineString" || johto.reitti.type === "MultiLineString")
        ? { id: johto.id, reitti: johto.reitti }
        : null,
    )
    .filter((johto): johto is { id: string; reitti: NonNullable<typeof johdot[number]["reitti"]> } =>
      johto != null,
    );
  const merkit =
    hanke.sijainti_lat != null || hanke.sijainti_lon != null || alue || karttajohdot.length > 0
      ? [
          {
            id: hanke.id,
            nimi: hanke.nimi,
            lat: hanke.sijainti_lat != null ? Number(hanke.sijainti_lat) : undefined,
            lon: hanke.sijainti_lon != null ? Number(hanke.sijainti_lon) : undefined,
            alue,
            johdot: karttajohdot,
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
        <p className="mt-2 text-sm text-muted">
          Liikennevalo: vihreä on vahvistettu lähteellä, keltainen on merkitty mutta
          vahvistamaton tai epävarma, punainen puuttuu. Lähteet avautuvat kentän alta.
        </p>
        <dl className="mt-2">
          {hankeKentat(hanke).map((rivi) => (
            <Faktakentta
              key={rivi.kentta}
              kentta={rivi.kentta}
              arvo={rivi.arvo}
              href={rivi.href}
              lahdeKentta={rivi.lahdeKentta}
              lahteet={lahteet}
            />
          ))}
        </dl>
      </section>

      {kunnat.length > 0 ? (
        <section className="mt-10" aria-labelledby="kunnat-otsikko">
          <h2 id="kunnat-otsikko" className="text-xl font-semibold">
            Kunnat
          </h2>
          <ul className="mt-4 space-y-4">
            {kunnat.map((rivi) => (
              <li key={rivi.id} className="rounded border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{rivi.kunta}</span>
                  <Liikennevalo
                    tila={kentanTila(
                      true,
                      kuntaLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    )}
                  />
                </p>
                <p className="mt-1 text-sm text-muted">{HANKE_KUNTA_ROOLI_NIMET[rivi.rooli]}</p>
                <Lahdeluettelo
                  lahteet={kuntaLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {menettelyt.length > 0 ? (
        <section className="mt-10" aria-labelledby="menettelyt-otsikko">
          <h2 id="menettelyt-otsikko" className="text-xl font-semibold">
            Menettelyt
          </h2>
          <ul className="mt-4 space-y-4">
            {menettelyt.map((rivi) => (
              <li key={rivi.id} className="rounded border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{MENETTELY_LAJI_NIMET[rivi.laji]}</span>
                  <Liikennevalo
                    tila={kentanTila(
                      true,
                      menettelyLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    )}
                  />
                </p>
                <p className="mt-1 text-sm">
                  {MENETTELY_TILA_NIMET[rivi.tila]}
                  {rivi.tunnus ? ` · ${rivi.tunnus}` : ""}
                </p>
                <Lahdeluettelo
                  lahteet={menettelyLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {vaihtoehdot.length > 0 ? (
        <section className="mt-10" aria-labelledby="vaihtoehdot-otsikko">
          <h2 id="vaihtoehdot-otsikko" className="text-xl font-semibold">
            Arvioitavat vaihtoehdot
          </h2>
          <p className="mt-2 text-sm text-muted">
            Luvut on merkitty vaihtoehdoittain. Hankkeen omat kentät voivat olla
            yhteenveto tai tyhjiä, jos lähde antaa vain vaihtoehtokohtaiset arvot.
          </p>
          <ul className="mt-4 space-y-4">
            {vaihtoehdot.map((vaihtoehto) => (
              <li key={vaihtoehto.id} className="rounded border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{vaihtoehto.tunnus}</span>
                  <Liikennevalo
                    tila={kentanTila(
                      true,
                      vaihtoehtoLahteet.filter((lahde) => lahde.rivi_id === vaihtoehto.id),
                    )}
                  />
                </p>
                <p className="mt-1 text-sm">
                  {[
                    vaihtoehto.it_teho_mw != null
                      ? `IT-teho ${muotoileLuku(vaihtoehto.it_teho_mw)} MW`
                      : null,
                    vaihtoehto.teho_mw != null
                      ? `teho ${muotoileLuku(vaihtoehto.teho_mw)} MW`
                      : null,
                    vaihtoehto.pinta_ala_ha != null
                      ? `${muotoileLuku(vaihtoehto.pinta_ala_ha)} ha`
                      : null,
                    vaihtoehto.sahkonkaytto_twh_a != null
                      ? `${muotoileLuku(vaihtoehto.sahkonkaytto_twh_a)} TWh/a`
                      : null,
                    vaihtoehto.generaattorit_lkm != null
                      ? `${vaihtoehto.generaattorit_lkm} generaattoria`
                      : null,
                    vaihtoehto.generaattorit_kaytossa_max_lkm != null
                      ? `enintään ${vaihtoehto.generaattorit_kaytossa_max_lkm} yhtä aikaa`
                      : null,
                    vaihtoehto.generaattori_polttoaineteho_mw != null
                      ? `generaattorin polttoaineteho ${muotoileLuku(vaihtoehto.generaattori_polttoaineteho_mw)} MW`
                      : null,
                    vaihtoehto.sijainti_alue ? "alue merkitty" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Lahdeluettelo
                  lahteet={vaihtoehtoLahteet.filter((lahde) => lahde.rivi_id === vaihtoehto.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {organisaatioroolit.length > 0 ? (
        <section className="mt-10" aria-labelledby="roolit-otsikko">
          <h2 id="roolit-otsikko" className="text-xl font-semibold">
            Organisaatiot hankkeessa
          </h2>
          <ul className="mt-4 space-y-4">
            {organisaatioroolit.map((rivi) => (
              <li key={rivi.id} className="rounded border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{HANKE_ORGANISAATIO_ROOLI_NIMET[rivi.rooli]}</span>
                  <Liikennevalo
                    tila={kentanTila(
                      rivi.organisaatio != null,
                      organisaatiorooliLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    )}
                  />
                </p>
                <p className="mt-1 text-sm">
                  {rivi.organisaatio ? (
                    <a
                      href={`/organisaatiot/${rivi.organisaatio.id}`}
                      className="text-link underline"
                    >
                      {rivi.organisaatio.nimi}
                    </a>
                  ) : (
                    <span className="text-muted">Ei merkitty</span>
                  )}
                </p>
                <Lahdeluettelo
                  lahteet={organisaatiorooliLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="asiakirjat-otsikko">
        <h2 id="asiakirjat-otsikko" className="text-xl font-semibold">
          Asiakirjat
        </h2>
        <p className="mt-2 text-sm text-muted">
          Metatiedot kertovat, mihin rekisterin kenttiin asiakirjaa on käytetty.
          Tekoälyn tiivistelmää ei tallenneta.{" "}
          <a href={`/hankkeet/${hanke.id}/asiakirjat`} className="text-link underline">
            Koneluettava luettelo
          </a>
        </p>
        {asiakirjat.length === 0 ? (
          <p className="mt-3">Ei merkittyjä asiakirjoja.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {asiakirjat.map((asiakirja) => (
              <li key={asiakirja.id} className="rounded border border-border bg-surface p-4">
                <p className="font-medium">
                  <a href={asiakirja.url} className="text-link underline" rel="noopener noreferrer">
                    {asiakirja.otsikko}
                  </a>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {DOKUMENTTI_LAJI_NIMET[asiakirja.laji]}
                  {asiakirja.muoto ? ` · ${DOKUMENTTI_MUOTO_NIMET[asiakirja.muoto]}` : ""}
                  {asiakirja.kieli ? ` · ${DOKUMENTTI_KIELI_NIMET[asiakirja.kieli]}` : ""}
                  {asiakirja.julkaisija ? ` · ${asiakirja.julkaisija}` : ""}
                  {asiakirja.julkaistu_pvm ? ` · ${muotoilePvm(asiakirja.julkaistu_pvm)}` : ""}
                  {asiakirja.tunnus ? ` · ${asiakirja.tunnus}` : ""}
                  {asiakirja.sivumaara != null ? ` · ${asiakirja.sivumaara} s.` : ""}
                </p>
                {asiakirja.kattaa.length > 0 ? (
                  <p className="mt-2 text-sm">
                    Käytetty kentissä:{" "}
                    {asiakirja.kattaa
                      .map((kaytto) => {
                        const nimi = kenttaNayttonimi(kaytto.taulu, kaytto.kentta);
                        const sivut =
                          kaytto.sivut.length > 0 ? ` (s. ${kaytto.sivut.join(", ")})` : "";
                        return `${nimi}${sivut}`;
                      })
                      .join("; ")}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Ei vielä kytketty rekisterin faktakenttiin.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
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
            {maaraajat.map((maaraaika) => {
              const menettely = menettelyt.find((rivi) => rivi.id === maaraaika.menettely_id);
              return (
              <li key={maaraaika.id} className="rounded border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{MAARAAJA_NIMET[maaraaika.tyyppi]}</span>
                  <Liikennevalo
                    tila={kentanTila(
                      true,
                      maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id),
                    )}
                  />
                </p>
                {menettely ? (
                  <p className="mt-1 text-sm text-muted">
                    {MENETTELY_LAJI_NIMET[menettely.laji]}
                  </p>
                ) : null}
                <p className="mt-1 text-sm">
                  {maaraaika.alkaa_pvm ? `${muotoilePvm(maaraaika.alkaa_pvm)} – ` : ""}
                  {muotoilePvm(maaraaika.paattyy_pvm)}
                </p>
                <Lahdeluettelo
                  lahteet={maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id)}
                />
              </li>
              );
            })}
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

      {johdot.length > 0 ? (
        <section className="mt-10" aria-labelledby="johdot-otsikko">
          <h2 id="johdot-otsikko" className="text-xl font-semibold">
            Sähkönsiirto
          </h2>
          <ul className="mt-4 space-y-4">
            {johdot.map((johto) => (
              <li key={johto.id} className="rounded border border-border bg-surface p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {JOHTO_TYYPPI_NIMET[johto.tyyppi]}
                    {johto.vaihtoehto ? ` · ${johto.vaihtoehto}` : ""}
                  </span>
                  <Liikennevalo
                    tila={kentanTila(
                      true,
                      johtoLahteet.filter((lahde) => lahde.rivi_id === johto.id),
                    )}
                  />
                </p>
                <p className="mt-1 text-sm">
                  {[
                    johto.jannite_kv != null ? `${muotoileLuku(johto.jannite_kv)} kV` : null,
                    johto.pituus_km != null ? `${muotoileLuku(johto.pituus_km)} km` : null,
                    johto.liittymispiste,
                    johto.reitti ? "reitti merkitty kartalle" : "reitin koordinaatteja ei merkitty",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <Lahdeluettelo
                  lahteet={johtoLahteet.filter((lahde) => lahde.rivi_id === johto.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="kartta-otsikko">
        <h2 id="kartta-otsikko" className="text-xl font-semibold">
          Sijainti kartalla
        </h2>
        <div className="mt-4">
          <Kartta merkit={merkit} />
        </div>
        {alue ? (
          <p className="mt-2 text-sm text-muted">
            Sininen alue on merkitty{" "}
            {hanke.sijainti_alue_tyyppi
              ? SIJAINTI_ALUE_TYYPPI_NIMET[hanke.sijainti_alue_tyyppi].toLowerCase()
              : "hankealue"}
            .
          </p>
        ) : null}
        {karttajohdot.length > 0 ? (
          <p className="mt-2 text-sm text-muted">
            Katkoviiva on merkitty sähkönsiirtoreitti.
          </p>
        ) : null}
      </section>
    </main>
  );
}
