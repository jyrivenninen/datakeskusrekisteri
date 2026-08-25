import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AvattavaKortti, Korttiruudukko } from "@/komponentit/avattava-kortti";
import { Kartta } from "@/komponentit/kartta";
import { HankeGalleria } from "@/komponentit/hanke-galleria";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import { lomakeKenttaKortista, VAIHTOEHTO_KENTAT } from "@/lib/ehdotus";
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
import { haeHanke, haeHankeOhjaus } from "@/lib/supabase/kyselyt";
import type { Hanke, KenttaLahde } from "@/lib/supabase/tietokanta";

export const revalidate = 60;

function kentanLahteet(lahteet: KenttaLahde[], kentta: string): KenttaLahde[] {
  return lahteet.filter((lahde) => lahde.kentta === kentta);
}

type KenttaRivi = {
  kentta: string;
  arvo: string | null;
  href?: string | null;
  lahdeKentta?: string;
};

function kenttaArvoksi(rivi: KenttaRivi) {
  if (!rivi.arvo) return <span className="text-muted">Ei merkitty</span>;
  if (rivi.href) {
    return (
      <a href={rivi.href} className="text-link underline">
        {rivi.arvo}
      </a>
    );
  }
  return rivi.arvo;
}

function paivitaLinkki(hankeId: string, kentta: string, vaihtoehto?: string) {
  const q = new URLSearchParams({ kentta });
  if (vaihtoehto) q.set("vaihtoehto", vaihtoehto);
  return `/hankkeet/${hankeId}/paivita?${q.toString()}`;
}

function Faktakortti({
  hankeId,
  rivi,
  lahteet,
}: {
  hankeId: string;
  rivi: KenttaRivi;
  lahteet: KenttaLahde[];
}) {
  const naytettavat = kentanLahteet(lahteet, rivi.lahdeKentta ?? rivi.kentta);
  const lomakeKentta = lomakeKenttaKortista(rivi.kentta);
  return (
    <AvattavaKortti
      nimi={HANKE_KENTTA_NIMET[rivi.kentta] ?? rivi.kentta}
      arvo={kenttaArvoksi(rivi)}
      tila={kentanTila(rivi.arvo != null && rivi.arvo !== "", naytettavat)}
      lahteet={naytettavat}
      toiminnot={
        lomakeKentta ? (
          <a href={paivitaLinkki(hankeId, lomakeKentta)} className="text-link underline">
            Päivitä
          </a>
        ) : null
      }
    />
  );
}

function hankeRyhmat(hanke: Hanke & { toimija: { id: string; nimi: string } | null }): {
  id: string;
  otsikko: string;
  rivit: KenttaRivi[];
}[] {
  return [
    {
      id: "perustiedot",
      otsikko: "Perustiedot",
      rivit: [
        { kentta: "nimi", arvo: hanke.nimi },
        { kentta: "kunta", arvo: hanke.kunta },
        { kentta: "maakunta", arvo: hanke.maakunta },
        { kentta: "vaihe", arvo: VAIHE_NIMET[hanke.vaihe] },
        {
          kentta: "toimija_organisaatio_id",
          arvo: hanke.toimija?.nimi ?? null,
          href: hanke.toimija ? `/organisaatiot/${hanke.toimija.id}` : null,
        },
        { kentta: "yva_diaarinumero", arvo: hanke.yva_diaarinumero },
      ],
    },
    {
      id: "sijainti-kaava",
      otsikko: "Sijainti ja kaava",
      rivit: [
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
      ],
    },
    {
      id: "teho-mitoitus",
      otsikko: "Teho ja mitoitus",
      rivit: [
        { kentta: "teho_mw", arvo: hanke.teho_mw != null ? muotoileLuku(hanke.teho_mw) : null },
        {
          kentta: "it_teho_mw",
          arvo: hanke.it_teho_mw != null ? muotoileLuku(hanke.it_teho_mw) : null,
        },
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
      ],
    },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ohjaus = await haeHankeOhjaus(id);
  const { hanke } = await haeHanke(ohjaus && ohjaus !== id ? ohjaus : id);
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
  const ohjaus = await haeHankeOhjaus(id);
  if (ohjaus && ohjaus !== id) permanentRedirect(`/hankkeet/${ohjaus}`);
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
    kuvat,
    kuvaLahteet,
    virhe,
  } = await haeHanke(id);

  if (virhe) {
    return (
      <main id="sisalto" className="sivuleveys flex-1 py-10">
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
            vaihe: hanke.vaihe,
            lat: hanke.sijainti_lat != null ? Number(hanke.sijainti_lat) : undefined,
            lon: hanke.sijainti_lon != null ? Number(hanke.sijainti_lon) : undefined,
            alue,
            johdot: karttajohdot,
          },
        ]
      : [];

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{hanke.nimi}</h1>
      <p className="mt-2 text-muted">
        {hanke.kunta}
        {hanke.maakunta ? `, ${hanke.maakunta}` : ""} ·{" "}
        <VaiheMerkki vaihe={hanke.vaihe} />
      </p>

      <section className="mt-6" aria-labelledby="kartta-otsikko">
        <h2 id="kartta-otsikko" className="sr-only">
          Sijainti kartalla
        </h2>
        <Kartta merkit={merkit} luokka="h-[22rem] sm:h-[28rem]" />
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

      <section className="mt-8" aria-labelledby="kuvat-otsikko">
        <h2 id="kuvat-otsikko" className="text-xl font-semibold">
          Valokuvat
        </h2>
        <p className="mt-2 text-sm">
          <a href={`/hankkeet/${hanke.id}/kuva`} className="text-link underline">
            Lisää valokuva
          </a>
        </p>
        <HankeGalleria kuvat={kuvat} lahteet={kuvaLahteet} />
      </section>

      <section className="mt-8" aria-labelledby="tiedot-otsikko">
        <h2 id="tiedot-otsikko" className="text-xl font-semibold">
          Tiedot ja lähteet
        </h2>
        <p className="mt-2 text-sm text-muted">
          Kenttä avaa lähteen ja päivityslomakkeen. Vihreä valo on vahvistettu, keltainen
          epävarma, punainen puuttuu.
        </p>
        <div className="mt-6 space-y-8">
          {hankeRyhmat(hanke).map((ryhma) => (
            <section key={ryhma.id} aria-labelledby={ryhma.id}>
              <h3 id={ryhma.id} className="text-base font-semibold">
                {ryhma.otsikko}
              </h3>
              <Korttiruudukko>
                {ryhma.rivit.map((rivi) => (
                  <Faktakortti
                    key={rivi.kentta}
                    hankeId={hanke.id}
                    rivi={rivi}
                    lahteet={lahteet}
                  />
                ))}
              </Korttiruudukko>
            </section>
          ))}
        </div>
      </section>

      {kunnat.length > 0 ? (
        <section className="mt-10" aria-labelledby="kunnat-otsikko">
          <h2 id="kunnat-otsikko" className="text-xl font-semibold">
            Kunnat
          </h2>
          <Korttiruudukko>
            {kunnat.map((rivi) => (
              <AvattavaKortti
                key={rivi.id}
                nimi={HANKE_KUNTA_ROOLI_NIMET[rivi.rooli]}
                arvo={rivi.kunta}
                tila={kentanTila(
                  true,
                  kuntaLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                )}
                lahteet={kuntaLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
              />
            ))}
          </Korttiruudukko>
        </section>
      ) : null}

      {menettelyt.length > 0 ? (
        <section className="mt-10" aria-labelledby="menettelyt-otsikko">
          <h2 id="menettelyt-otsikko" className="text-xl font-semibold">
            Menettelyt
          </h2>
          <Korttiruudukko>
            {menettelyt.map((rivi) => (
              <AvattavaKortti
                key={rivi.id}
                nimi={MENETTELY_LAJI_NIMET[rivi.laji]}
                arvo={`${MENETTELY_TILA_NIMET[rivi.tila]}${rivi.tunnus ? ` · ${rivi.tunnus}` : ""}`}
                tila={kentanTila(
                  true,
                  menettelyLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                )}
                lahteet={menettelyLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
              />
            ))}
          </Korttiruudukko>
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
          <Korttiruudukko>
            {vaihtoehdot.map((vaihtoehto) => (
              <AvattavaKortti
                key={vaihtoehto.id}
                nimi={vaihtoehto.tunnus}
                arvo={
                  [
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
                    .join(" · ") || "Ei merkittyjä lukuja"
                }
                tila={kentanTila(
                  true,
                  vaihtoehtoLahteet.filter((lahde) => lahde.rivi_id === vaihtoehto.id),
                )}
                lahteet={vaihtoehtoLahteet.filter((lahde) => lahde.rivi_id === vaihtoehto.id)}
                toiminnot={
                  <ul className="flex flex-col gap-1">
                    {VAIHTOEHTO_KENTAT.map((kentta) => (
                      <li key={kentta}>
                        <a
                          href={paivitaLinkki(hanke.id, kentta, vaihtoehto.tunnus)}
                          className="text-link underline"
                        >
                          Päivitä: {HANKE_KENTTA_NIMET[kentta] ?? kentta}
                        </a>
                      </li>
                    ))}
                  </ul>
                }
              />
            ))}
          </Korttiruudukko>
        </section>
      ) : null}

      {organisaatioroolit.length > 0 ? (
        <section className="mt-10" aria-labelledby="roolit-otsikko">
          <h2 id="roolit-otsikko" className="text-xl font-semibold">
            Organisaatiot hankkeessa
          </h2>
          <Korttiruudukko>
            {organisaatioroolit.map((rivi) => (
              <AvattavaKortti
                key={rivi.id}
                nimi={HANKE_ORGANISAATIO_ROOLI_NIMET[rivi.rooli]}
                arvo={
                  rivi.organisaatio ? (
                    <a
                      href={`/organisaatiot/${rivi.organisaatio.id}`}
                      className="text-link underline"
                    >
                      {rivi.organisaatio.nimi}
                    </a>
                  ) : (
                    <span className="text-muted">Ei merkitty</span>
                  )
                }
                tila={kentanTila(
                  rivi.organisaatio != null,
                  organisaatiorooliLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                )}
                lahteet={organisaatiorooliLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
              />
            ))}
          </Korttiruudukko>
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
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
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
          <Korttiruudukko>
            {maaraajat.map((maaraaika) => {
              const menettely = menettelyt.find((rivi) => rivi.id === maaraaika.menettely_id);
              return (
                <AvattavaKortti
                  key={maaraaika.id}
                  nimi={MAARAAJA_NIMET[maaraaika.tyyppi]}
                  arvo={`${menettely ? `${MENETTELY_LAJI_NIMET[menettely.laji]} · ` : ""}${maaraaika.alkaa_pvm ? `${muotoilePvm(maaraaika.alkaa_pvm)} – ` : ""}${muotoilePvm(maaraaika.paattyy_pvm)}`}
                  tila={kentanTila(
                    true,
                    maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id),
                  )}
                  lahteet={maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id)}
                />
              );
            })}
          </Korttiruudukko>
        )}
      </section>

      {johdot.length > 0 ? (
        <section className="mt-10" aria-labelledby="johdot-otsikko">
          <h2 id="johdot-otsikko" className="text-xl font-semibold">
            Sähkönsiirto
          </h2>
          <Korttiruudukko>
            {johdot.map((johto) => (
              <AvattavaKortti
                key={johto.id}
                nimi={`${JOHTO_TYYPPI_NIMET[johto.tyyppi]}${johto.vaihtoehto ? ` · ${johto.vaihtoehto}` : ""}`}
                arvo={[
                  johto.jannite_kv != null ? `${muotoileLuku(johto.jannite_kv)} kV` : null,
                  johto.pituus_km != null ? `${muotoileLuku(johto.pituus_km)} km` : null,
                  johto.liittymispiste,
                  johto.reitti ? "reitti merkitty kartalle" : "reitin koordinaatteja ei merkitty",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                tila={kentanTila(
                  true,
                  johtoLahteet.filter((lahde) => lahde.rivi_id === johto.id),
                )}
                lahteet={johtoLahteet.filter((lahde) => lahde.rivi_id === johto.id)}
              />
            ))}
          </Korttiruudukko>
        </section>
      ) : null}
    </main>
  );
}
