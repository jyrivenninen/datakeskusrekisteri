import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AsiakirjaTaulukko } from "@/komponentit/asiakirja-kortti";
import { AvattavaKortti, Korttiruudukko } from "@/komponentit/avattava-kortti";
import { KarttaViive } from "@/komponentit/kartta-viive";
import { onKonsulttiSivuRooli } from "@/lib/konsultti-roolit";
import { konsulttiSivuPolku } from "@/lib/konsultti-slug";
import { kuntaSivuPolku } from "@/lib/kunta-slug";
import { normalisoiKuntaNimi, ratkaiseMaakunta } from "@/lib/maakunta";
import { HankeGalleria } from "@/komponentit/hanke-galleria";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import { lomakeKenttaKortista, VAIHTOEHTO_KENTAT } from "@/lib/ehdotus";
import { rakennaDokumenttiLinkkiTekstit } from "@/lib/lahde-metatiedot";
import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";
import { lahteetLiikennevalolle } from "@/lib/kentan-tila-lahteet";
import { muotoilePaatosKuvaus } from "@/lib/paatos-kuvaus";
import {
  JOHTO_TYYPPI_NIMET,
  HANKE_KENTTA_NIMET,
  HANKE_KUNTA_ROOLI_NIMET,
  hankeOrganisaatioRooliNimi,
  MAARAAJA_NIMET,
  MENETTELY_LAJI_NIMET,
  MENETTELY_TILA_NIMET,
  MUUT_SIJAINNIT_NIMET,
  SIJAINTI_ALUE_TYYPPI_NIMET,
  VAIHE_NIMET,
  VAIHE_VARIT,
  kentanTila,
  kenttaNayttonimi,
  hankeTehoMw,
  muotoileLuku,
  muotoilePvm,
  dieselVuosikulutusTeksti,
  polttoainevarastoTeksti,
} from "@/lib/naytto";
import type { KorvaavaDokumentti } from "@/komponentit/lahdeluettelo";
import {
  haeHanke,
  haeHankeOhjaus,
  haeKuntaMaakuntaKartta,
  haeKuntaSlugKartta,
} from "@/lib/supabase/kyselyt";
import { hankeOgKuvaus, kortinMetatiedot, SIVUSTON_KUVAUS, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";
import type { Hanke, KenttaLahde, KenttaTarkistus } from "@/lib/supabase/tietokanta";

export const revalidate = 60;

function paatosKuvausNaytto(
  kuvaus: string,
  paatosId: string,
  paatosLahteet: KenttaLahde[],
): string {
  const lainaus =
    paatosLahteet.find(
      (l) =>
        l.rivi_id === paatosId &&
        l.kentta === "kuvaus" &&
        l.tila !== "korvattu" &&
        l.tila !== "ei_tue",
    )?.lainaus ?? null;
  return muotoilePaatosKuvaus(kuvaus, lainaus);
}

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
  linkkiTekstit,
  korvaavat,
  tarkistus,
  urlTyypit,
}: {
  hankeId: string;
  rivi: KenttaRivi;
  lahteet: KenttaLahde[];
  linkkiTekstit?: ReadonlyMap<string, string>;
  korvaavat?: ReadonlyMap<string, KorvaavaDokumentti>;
  tarkistus?: KenttaTarkistus | null;
  urlTyypit: ReadonlyMap<string, LahdeTyyppi>;
}) {
  const naytettavat = kentanLahteet(lahteet, rivi.lahdeKentta ?? rivi.kentta);
  const lomakeKentta = lomakeKenttaKortista(rivi.kentta);
  const tyhja = rivi.arvo == null || rivi.arvo === "";
  return (
    <AvattavaKortti
      nimi={HANKE_KENTTA_NIMET[rivi.kentta] ?? rivi.kentta}
      arvo={kenttaArvoksi(rivi)}
      tila={kentanTila(!tyhja, lahteetLiikennevalolle(naytettavat, urlTyypit))}
      lahteet={naytettavat}
      linkkiTekstit={linkkiTekstit}
      korvaavat={korvaavat}
      tarkistus={
        rivi.kentta === "maakunta" && naytettavat.length === 0 && !tyhja
          ? "Johdettu kunnasta. Kentälle ei vaadita omaa lähdettä."
          : tyhja && tarkistus?.tulos === "ei_julkista_lahdetta"
            ? `Tarkistettu ${muotoilePvm(tarkistus.vahvistettu_pvm)}: julkista lähdettä ei ole.`
            : null
      }
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

function hankeRyhmat(
  hanke: Hanke & { toimija: { id: string; nimi: string } | null },
  maakunta: string | null,
): {
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
        { kentta: "maakunta", arvo: maakunta },
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
            hanke.sijainti_alue_tyyppi === "arvio"
              ? null
              : hanke.sijainti_lat != null && hanke.sijainti_lon != null
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
          kentta: "kaava_ala_ha",
          arvo: hanke.kaava_ala_ha != null ? muotoileLuku(hanke.kaava_ala_ha) : null,
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
          kentta: "generaattori_yksikkoteho_mwe",
          arvo:
            hanke.generaattori_yksikkoteho_mwe != null
              ? muotoileLuku(hanke.generaattori_yksikkoteho_mwe)
              : null,
        },
        {
          kentta: "diesel_vuosikulutus_maara",
          arvo: dieselVuosikulutusTeksti(
            hanke.diesel_vuosikulutus_maara,
            hanke.diesel_vuosikulutus_yksikko,
          ),
        },
        {
          kentta: "polttoainevarasto_maara",
          arvo: polttoainevarastoTeksti(
            hanke.polttoainevarasto_maara,
            hanke.polttoainevarasto_yksikko,
          ),
        },
        {
          kentta: "varavoima_paastot_t_co2e",
          arvo:
            hanke.varavoima_paastot_t_co2e != null
              ? muotoileLuku(hanke.varavoima_paastot_t_co2e)
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
    return kortinMetatiedot({
      otsikko: "Hanketta ei löytynyt",
      kuvaus: SIVUSTON_KUVAUS,
      polku: `/hankkeet/${id}`,
    });
  }
  return {
    ...kortinMetatiedot({
      otsikko: `${hanke.nimi} – ${SIVUSTON_OTSIKKO}`,
      kuvaus: hankeOgKuvaus(hanke),
      polku: `/hankkeet/${hanke.id}`,
      tyyppi: "article",
    }),
    alternates: {
      canonical: `/hankkeet/${hanke.id}`,
      types: {
        "application/json": `/hankkeet/${hanke.id}/json`,
      },
    },
  };
}

export default async function HankeSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ virhe?: string; kuva_poistettu?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const ohjaus = await haeHankeOhjaus(id);
  if (ohjaus && ohjaus !== id) permanentRedirect(`/hankkeet/${ohjaus}`);
  const { user: yllapitaja } = await haeYllapitaja();
  const voiPoistaaKuvia = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());
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
    tarkistukset,
    paatokset,
    paatosLahteet,
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

  const [kuntaMaakunnat, kuntaSlugit] = await Promise.all([
    haeKuntaMaakuntaKartta(),
    haeKuntaSlugKartta(),
  ]);
  const kuntaSlug = kuntaSlugit.get(normalisoiKuntaNimi(hanke.kunta));
  const kuntaHref = kuntaSlug ? kuntaSivuPolku(kuntaSlug) : null;
  const ratkaistuMaakunta = ratkaiseMaakunta(hanke.maakunta, hanke.kunta, kuntaMaakunnat);
  const linkkiTekstit = rakennaDokumenttiLinkkiTekstit(asiakirjat);
  const urlTyypit = new Map<string, LahdeTyyppi>(
    asiakirjat.map((a) => [a.url, a.lahde_tyyppi as LahdeTyyppi]),
  );
  const korvaavat = new Map(
    asiakirjat.map((asiakirja) => [
      asiakirja.id,
      { otsikko: asiakirja.otsikko, url: asiakirja.url },
    ]),
  );
  const tehoKentta =
    hanke.it_teho_mw != null ? "it_teho_mw" : hanke.teho_mw != null ? "teho_mw" : null;
  const tehoMw = hankeTehoMw(hanke);
  const tehoLahteet = tehoKentta ? kentanLahteet(lahteet, tehoKentta) : [];

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
            tehoMw: hankeTehoMw(hanke),
            arvio: hanke.sijainti_alue_tyyppi === "arvio",
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
        {kuntaHref ? (
          <a href={kuntaHref} className="text-link underline">
            {hanke.kunta}
          </a>
        ) : (
          hanke.kunta
        )}
        {ratkaistuMaakunta.maakunta ? `, ${ratkaistuMaakunta.maakunta}` : ""} ·{" "}
        <VaiheMerkki vaihe={hanke.vaihe} />
      </p>
      {hanke.vanhin_vahvistettu_pvm ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
          Vanhin kenttäkohtainen tarkistus {muotoilePvm(hanke.vanhin_vahvistettu_pvm)}.
          Päivä on sen lähteen tarkistus, joka on vanhin. Yhden kentän uusi
          tarkistus ei siirrä tätä päivää. Se ei ole viranomaispäätöksen päivä.
        </p>
      ) : (
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
          Kenttäkohtaisia tarkistuspäiviä ei ole merkitty.
        </p>
      )}
      {hanke.viimeisin_paatos ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed">
          Viimeisin merkitty päätös:{" "}
          {paatosKuvausNaytto(
            hanke.viimeisin_paatos.kuvaus,
            hanke.viimeisin_paatos.id,
            paatosLahteet,
          )}{" "}
          · {muotoilePvm(hanke.viimeisin_paatos.pvm)} ·{" "}
          {hanke.viimeisin_paatos.paattava_organisaatio?.nimi ?? "—"}
        </p>
      ) : null}
      {hanke.huomautus ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed">
          {hanke.huomautus}
        </p>
      ) : null}
      <p className="mt-3 text-sm">
        <a href={`/hankkeet/${hanke.id}/paatos`} className="text-link underline">
          Ilmoita viranomaispäätös
        </a>
      </p>

      <section className="mt-6" aria-labelledby="kartta-otsikko">
        <h2 id="kartta-otsikko" className="sr-only">
          Sijainti kartalla
        </h2>
        <KarttaViive
          merkit={merkit}
          hankeSelite={{
            kunta: hanke.kunta,
            maakunta: ratkaistuMaakunta.maakunta,
            tehoOtsikko: tehoKentta === "it_teho_mw" ? "IT-teho" : "Teho",
            tehoTeksti: tehoMw != null ? `${muotoileLuku(tehoMw)} MW` : "Ei merkitty",
            tehoLahteet: tehoLahteet.map((lahde) => ({
              url: lahde.lahde_url,
              nimi: linkkiTekstit.get(lahde.lahde_url) ?? lahde.lahde_url,
            })),
            vaiheNimi: VAIHE_NIMET[hanke.vaihe],
            vaiheVari: VAIHE_VARIT[hanke.vaihe],
          }}
        />
        {hanke.sijainti_alue_tyyppi === "arvio" &&
        hanke.sijainti_lat != null &&
        hanke.sijainti_lon != null ? (
          <p className="mt-2 text-sm text-muted">
            Sijainti arvioitu paikan nimestä, ei hankkeen osoitteesta.
          </p>
        ) : null}
        {alue ? (
          <p className="mt-2 text-sm text-muted">
            Sininen alue on merkitty{" "}
            {hanke.sijainti_alue_tyyppi && hanke.sijainti_alue_tyyppi !== "arvio"
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

      {hanke.sijaintiperustelu || hanke.muut_sijainnit ? (
        <section className="mt-8" aria-labelledby="sijaintiperustelu-otsikko">
          <h2 id="sijaintiperustelu-otsikko" className="text-xl font-semibold">
            Sijainnin perustelu
          </h2>
          <p className="mt-2 text-sm text-muted">
            Perustelu ja muiden sijaintien tarkastelu YVA-asiakirjasta. Ilman
            YVA-menettelyä kentät jäävät tyhjiksi.
          </p>
          <Korttiruudukko>
            {hanke.sijaintiperustelu ? (
              <Faktakortti
                hankeId={hanke.id}
                rivi={{
                  kentta: "sijaintiperustelu",
                  arvo: hanke.sijaintiperustelu,
                }}
                lahteet={lahteet}
                linkkiTekstit={linkkiTekstit}
                korvaavat={korvaavat}
                urlTyypit={urlTyypit}
              />
            ) : null}
            {hanke.muut_sijainnit ? (
              <Faktakortti
                hankeId={hanke.id}
                rivi={{
                  kentta: "muut_sijainnit",
                  arvo: MUUT_SIJAINNIT_NIMET[hanke.muut_sijainnit],
                }}
                lahteet={lahteet}
                linkkiTekstit={linkkiTekstit}
                korvaavat={korvaavat}
                urlTyypit={urlTyypit}
              />
            ) : null}
          </Korttiruudukko>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="kuvat-otsikko">
        <h2 id="kuvat-otsikko" className="text-xl font-semibold">
          Valokuvat
        </h2>
        {query.kuva_poistettu ? (
          <p className="mt-2 text-sm" role="status">
            Kuva poistettiin julkiselta sivulta.
          </p>
        ) : null}
        {query.virhe ? (
          <p className="mt-2 text-sm" role="alert">
            {query.virhe}
          </p>
        ) : null}
        <p className="mt-2 text-sm">
          <a href={`/hankkeet/${hanke.id}/kuva`} className="text-link underline">
            Lisää valokuva
          </a>
        </p>
        <HankeGalleria
          kuvat={kuvat}
          lahteet={kuvaLahteet}
          hankeId={hanke.id}
          yllapito={voiPoistaaKuvia}
        />
      </section>

      <section className="mt-8" aria-labelledby="tiedot-otsikko">
        <h2 id="tiedot-otsikko" className="text-xl font-semibold">
          Tiedot ja lähteet
        </h2>
        <p className="mt-2 text-sm text-muted">
          Kenttä avaa lähteen ja päivityslomakkeen. Vihreä valo tarkoittaa
          viranomaislähdettä (päätös, viranomaisasiakirja tai rekisteri), jonka
          ihminen on tarkistanut tukevan arvoa. Keltainen on julkaistu tai muulla
          lähteellä tarkistettu, punainen puuttuu.
        </p>
        <div className="mt-6 space-y-8">
          {hankeRyhmat(hanke, ratkaistuMaakunta.maakunta).map((ryhma) => (
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
                    linkkiTekstit={linkkiTekstit}
                    korvaavat={korvaavat}
                    urlTyypit={urlTyypit}
                    tarkistus={tarkistukset.find(
                      (riviTarkistus) =>
                        riviTarkistus.kentta === (rivi.lahdeKentta ?? rivi.kentta),
                    )}
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
                  lahteetLiikennevalolle(
                    kuntaLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    urlTyypit,
                  ),
                )}
                lahteet={kuntaLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                linkkiTekstit={linkkiTekstit}
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
                  lahteetLiikennevalolle(
                    menettelyLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    urlTyypit,
                  ),
                )}
                lahteet={menettelyLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                linkkiTekstit={linkkiTekstit}
              />
            ))}
          </Korttiruudukko>
        </section>
      ) : null}

      {paatokset.length > 0 ? (
        <section className="mt-10" aria-labelledby="paatokset-otsikko">
          <h2 id="paatokset-otsikko" className="text-xl font-semibold">
            Päätökset
          </h2>
          <Korttiruudukko>
            {paatokset.map((rivi) => (
              <AvattavaKortti
                key={rivi.id}
                nimi={paatosKuvausNaytto(rivi.kuvaus, rivi.id, paatosLahteet)}
                arvo={`${muotoilePvm(rivi.pvm)} · ${rivi.paattava_organisaatio?.nimi ?? "—"}`}
                tila={kentanTila(
                  true,
                  lahteetLiikennevalolle(
                    paatosLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    urlTyypit,
                  ),
                )}
                lahteet={paatosLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                linkkiTekstit={linkkiTekstit}
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
            Luvut on merkitty vaihtoehdoittain. Jos julkaistulla vaihtoehdolla,
            VE0 pois lukien, on luku, sama hanketason kenttä jätetään tyhjäksi.
            Kenttä, jota yhdelläkään vaihtoehdolla ei ole, säilyy hankkeella.
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
                    vaihtoehto.generaattori_yksikkoteho_mwe != null
                      ? `yksikköteho ${muotoileLuku(vaihtoehto.generaattori_yksikkoteho_mwe)} MWe`
                      : null,
                    dieselVuosikulutusTeksti(
                      vaihtoehto.diesel_vuosikulutus_maara,
                      vaihtoehto.diesel_vuosikulutus_yksikko,
                    )
                      ? `dieselin vuosikulutus ${dieselVuosikulutusTeksti(
                          vaihtoehto.diesel_vuosikulutus_maara,
                          vaihtoehto.diesel_vuosikulutus_yksikko,
                        )}`
                      : null,
                    vaihtoehto.varavoima_paastot_t_co2e != null
                      ? `varavoiman päästöt ${muotoileLuku(vaihtoehto.varavoima_paastot_t_co2e)} t CO2e/a`
                      : null,
                    polttoainevarastoTeksti(
                      vaihtoehto.polttoainevarasto_maara,
                      vaihtoehto.polttoainevarasto_yksikko,
                    ),
                    vaihtoehto.sijainti_alue ? "alue merkitty" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ei merkittyjä lukuja"
                }
                tila={kentanTila(
                  true,
                  lahteetLiikennevalolle(
                    vaihtoehtoLahteet.filter((lahde) => lahde.rivi_id === vaihtoehto.id),
                    urlTyypit,
                  ),
                )}
                lahteet={vaihtoehtoLahteet.filter((lahde) => lahde.rivi_id === vaihtoehto.id)}
                linkkiTekstit={linkkiTekstit}
                korvaavat={korvaavat}
                naytaKentta
                toiminnot={
                  <ul className="flex flex-col gap-1">
                    {VAIHTOEHTO_KENTAT.filter(
                      (kentta) =>
                        kentta !== "polttoainevarasto_yksikko" &&
                        kentta !== "diesel_vuosikulutus_yksikko",
                    ).map((kentta) => (
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
                nimi={hankeOrganisaatioRooliNimi(rivi.rooli, rivi.rooli_meta?.nimi)}
                arvo={
                  rivi.organisaatio ? (
                    <a
                      href={
                        onKonsulttiSivuRooli(rivi.rooli) && rivi.organisaatio.slug
                          ? konsulttiSivuPolku(rivi.organisaatio.slug)
                          : `/organisaatiot/${rivi.organisaatio.id}`
                      }
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
                  lahteetLiikennevalolle(
                    organisaatiorooliLahteet.filter((lahde) => lahde.rivi_id === rivi.id),
                    urlTyypit,
                  ),
                )}
                lahteet={organisaatiorooliLahteet.filter((lahde) => lahde.rivi_id === rivi.id)}
                linkkiTekstit={linkkiTekstit}
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
          Luettelo kokoaa julkaistuun hanketietoon viittaavat lähde-URL:t sarakkeittain.
          Geokoodaus- ja karttahaut eivät näy tässä. Tekoälyn tiivistelmää ei
          tallenneta.{" "}
          <a href={`/hankkeet/${hanke.id}/asiakirjat`} className="text-link underline">
            Koneluettava luettelo
          </a>
        </p>
        {asiakirjat.length === 0 ? (
          <p className="mt-3">Ei merkittyjä asiakirjoja.</p>
        ) : (
          <AsiakirjaTaulukko asiakirjat={asiakirjat} />
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
                    lahteetLiikennevalolle(
                      maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id),
                      urlTyypit,
                    ),
                  )}
                  lahteet={maaraajaLahteet.filter((lahde) => lahde.rivi_id === maaraaika.id)}
                  linkkiTekstit={linkkiTekstit}
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
                  lahteetLiikennevalolle(
                    johtoLahteet.filter((lahde) => lahde.rivi_id === johto.id),
                    urlTyypit,
                  ),
                )}
                lahteet={johtoLahteet.filter((lahde) => lahde.rivi_id === johto.id)}
                linkkiTekstit={linkkiTekstit}
              />
            ))}
          </Korttiruudukko>
        </section>
      ) : null}

      <p className="mt-10 text-sm text-muted">
        <a href={`/hankkeet/${hanke.id}/json`} className="text-link underline">
          Lataa hankkeen tiedot JSON-muodossa
        </a>
        {" · "}
        <a href={`/hankkeet/${hanke.id}/asiakirjat`} className="text-link underline">
          Asiakirjalista (JSON)
        </a>
      </p>
    </main>
  );
}
