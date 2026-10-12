import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  haeGleifOrganisaatiolleToiminto,
  valitseGleifEhdokasToiminto,
  vahvistaGleifLeiToiminto,
} from "@/app/toiminnot";
import { gleifTietueUrl, haeGleifLeiTietue, haeGleifNimella, haeGleifRekisterinumerolla } from "@/lib/gleif";
import { hankeOrganisaatioRooliNimi, ORGANISAATIO_TYYPPI_NIMET } from "@/lib/naytto";
import { toimijaSivuPolku } from "@/lib/toimija-slug";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import { haeOrganisaatio } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { kortinMetatiedot, SIVUSTON_KUVAUS, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { organisaatio } = await haeOrganisaatio(id);
  if (!organisaatio) {
    return kortinMetatiedot({
      otsikko: "Organisaatiota ei löytynyt",
      kuvaus: SIVUSTON_KUVAUS,
      polku: `/organisaatiot/${id}`,
    });
  }
  return kortinMetatiedot({
    otsikko: `${organisaatio.nimi} – ${SIVUSTON_OTSIKKO}`,
    kuvaus: `Julkaistut tiedot organisaatiosta ${organisaatio.nimi}.`,
    polku: `/organisaatiot/${organisaatio.id}`,
  });
}

export default async function OrganisaatioSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { organisaatio, hankkeet, virhe } = await haeOrganisaatio(id);
  const { user: yllapitaja } = await haeYllapitaja();

  if (virhe) {
    return (
      <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold">Organisaatiota ei voitu ladata</h1>
        <p className="mt-3">{virhe}</p>
      </main>
    );
  }

  if (!organisaatio) {
    notFound();
  }

  const onToimija = hankkeet.some((h) => h.roolit.includes("toimija"));
  const gleifVirhe = typeof sp.gleif_virhe === "string" ? sp.gleif_virhe : null;
  const gleifValmis = sp.gleif_valmis === "1";
  const gleifTila = typeof sp.gleif_tila === "string" ? sp.gleif_tila : null;
  const gleifTapa = typeof sp.tapa === "string" ? sp.tapa : null;
  const gleifQ = typeof sp.q === "string" ? sp.q : null;
  const gleifLei = typeof sp.lei === "string" ? sp.lei.trim().toUpperCase() : null;

  let ehdokkaat: Awaited<ReturnType<typeof haeGleifRekisterinumerolla>> = [];
  let vahvistettava: Awaited<ReturnType<typeof haeGleifLeiTietue>> = null;
  let gleifHakuVirhe: string | null = null;

  if (yllapitaja && gleifTila === "haku") {
    try {
      if (gleifTapa === "nimi" && gleifQ) {
        ehdokkaat = await haeGleifNimella(gleifQ);
      } else {
        const nro =
          organisaatio.rekisterinumero?.trim() ||
          organisaatio.y_tunnus?.trim() ||
          "";
        if (!nro) {
          gleifHakuVirhe = "Rekisterinumeroa tai Y-tunnusta ei ole merkitty.";
        } else {
          ehdokkaat = await haeGleifRekisterinumerolla(nro);
        }
      }
      if (!gleifHakuVirhe && ehdokkaat.length === 0) {
        gleifHakuVirhe = "GLEIF ei palauttanut osumia.";
      }
    } catch {
      gleifHakuVirhe = "GLEIF-haku epäonnistui.";
    }
  }

  if (yllapitaja && gleifTila === "vahvista" && gleifLei) {
    try {
      vahvistettava = await haeGleifLeiTietue(gleifLei);
      if (!vahvistettava) gleifHakuVirhe = "LEI-tietuetta ei löytynyt.";
    } catch {
      gleifHakuVirhe = "GLEIF-tietueen haku epäonnistui.";
    }
  }

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      {yllapitaja ? (
        <p className="text-sm">
          <a href="/hakemisto" className="text-link underline">
            Hakemisto
          </a>
          {onToimija && organisaatio.slug ? (
            <>
              {" · "}
              <a href={toimijaSivuPolku(organisaatio.slug)} className="text-link underline">
                Toimijasivu
              </a>
            </>
          ) : null}
        </p>
      ) : onToimija && organisaatio.slug ? (
        <p className="text-sm">
          <a href={toimijaSivuPolku(organisaatio.slug)} className="text-link underline">
            Toimijasivu
          </a>
        </p>
      ) : null}
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{organisaatio.nimi}</h1>
      <p className="mt-2 text-muted">{ORGANISAATIO_TYYPPI_NIMET[organisaatio.tyyppi]}</p>

      <dl className="mt-8 divide-y divide-border border-y border-border">
        <div className="py-4">
          <dt className="font-medium">Y-tunnus</dt>
          <dd className="mt-1">
            {organisaatio.y_tunnus ?? <span className="text-muted">Ei merkitty</span>}
            {organisaatio.y_tunnus ? (
              <p className="mt-2 text-sm text-muted">
                PRH:n avoin YTJ-aineisto ei kata toiminimiä, kuntia eikä
                hyvinvointialueita.
              </p>
            ) : null}
          </dd>
        </div>
        <div className="py-4">
          <dt className="font-medium">LEI</dt>
          <dd className="mt-1">
            {organisaatio.lei ? (
              <>
                <a
                  href={gleifTietueUrl(organisaatio.lei)}
                  className="font-mono text-link underline"
                  rel="noopener noreferrer"
                >
                  {organisaatio.lei}
                </a>
                {organisaatio.lei_tila ? (
                  <span className="mt-1 block text-sm text-muted">
                    Tila GLEIF:ssä: {organisaatio.lei_tila}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted">Ei merkitty</span>
            )}
          </dd>
        </div>
        <div className="py-4">
          <dt className="font-medium">Verkko-osoite</dt>
          <dd className="mt-1">
            {organisaatio.verkko_osoite ? (
              <a
                href={organisaatio.verkko_osoite}
                className="text-link underline"
                rel="noopener noreferrer"
              >
                {organisaatio.verkko_osoite}
              </a>
            ) : (
              <span className="text-muted">Ei merkitty</span>
            )}
          </dd>
        </div>
      </dl>

      {yllapitaja ? (
        <section className="mt-10" aria-labelledby="gleif-otsikko">
          <h2 id="gleif-otsikko" className="text-xl font-semibold">
            GLEIF-haku
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            Haku yhdelle organisaatiolle. LEI tallennetaan heti; emosuhteet menevät
            hyväksyntäjonoon. Poikkeuskoodia ei näytetä julkisesti.
          </p>
          {gleifValmis ? (
            <p className="mt-3 text-sm" role="status">
              LEI tallennettu. Mahdolliset emosuhteet odottavat hyväksyntää.
            </p>
          ) : null}
          {gleifVirhe || gleifHakuVirhe ? (
            <p className="mt-3 text-sm" role="alert">
              {gleifVirhe ?? gleifHakuVirhe}
            </p>
          ) : null}

          {!gleifTila || gleifTila === "haku" ? (
            <div className="mt-4 flex flex-wrap gap-4">
              <form action={haeGleifOrganisaatiolleToiminto}>
                <input type="hidden" name="organisaatio_id" value={organisaatio.id} />
                <input type="hidden" name="tapa" value="rekisteri" />
                <button type="submit" className="text-link underline">
                  Hae rekisterinumerolla
                  {organisaatio.rekisterinumero || organisaatio.y_tunnus
                    ? ` (${organisaatio.rekisterinumero ?? organisaatio.y_tunnus})`
                    : ""}
                </button>
              </form>
              <form action={haeGleifOrganisaatiolleToiminto} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="organisaatio_id" value={organisaatio.id} />
                <input type="hidden" name="tapa" value="nimi" />
                <label className="block text-sm">
                  Nimihaku
                  <input
                    name="nimi"
                    defaultValue={gleifQ ?? organisaatio.nimi}
                    className="mt-1 block w-64 border border-border bg-background px-2 py-1"
                    required
                    minLength={3}
                  />
                </label>
                <button type="submit" className="text-link underline">
                  Hae nimellä
                </button>
              </form>
            </div>
          ) : null}

          {ehdokkaat.length > 0 ? (
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {ehdokkaat.map((e) => (
                <li key={e.lei} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{e.nimi}</p>
                    <p className="mt-0.5 font-mono text-sm text-muted">{e.lei}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {[e.rekisterinumero, e.maa, e.kaupunki].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <form action={valitseGleifEhdokasToiminto}>
                    <input type="hidden" name="organisaatio_id" value={organisaatio.id} />
                    <input type="hidden" name="lei" value={e.lei} />
                    <button type="submit" className="text-link underline">
                      Valitse
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          {vahvistettava ? (
            <div className="mt-6 rounded border border-border p-4">
              <p className="font-medium">{vahvistettava.nimi}</p>
              <p className="mt-1 font-mono text-sm">{vahvistettava.lei}</p>
              <p className="mt-1 text-sm text-muted">
                {[vahvistettava.rekisterinumero, vahvistettava.maa, vahvistettava.lei_tila]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-3 text-sm">
                <a
                  href={vahvistettava.lahde_url}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  GLEIF-tietue
                </a>
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="font-medium">Suora emo</dt>
                  <dd className="mt-0.5 text-muted">
                    {vahvistettava.suora_emo?.tyyppi === "suhde"
                      ? `${vahvistettava.suora_emo.nimi} (${vahvistettava.suora_emo.lei}) → jonoon`
                      : vahvistettava.suora_emo?.tyyppi === "poikkeus"
                        ? "ei emoyhtiötietoa GLEIF:ssä"
                        : "Ei tietoa"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Ylin emo</dt>
                  <dd className="mt-0.5 text-muted">
                    {vahvistettava.ylin_emo?.tyyppi === "suhde"
                      ? `${vahvistettava.ylin_emo.nimi} (${vahvistettava.ylin_emo.lei}) → jonoon`
                      : vahvistettava.ylin_emo?.tyyppi === "poikkeus"
                        ? "ei emoyhtiötietoa GLEIF:ssä"
                        : "Ei tietoa"}
                  </dd>
                </div>
              </dl>
              <form action={vahvistaGleifLeiToiminto} className="mt-4">
                <input type="hidden" name="organisaatio_id" value={organisaatio.id} />
                <input type="hidden" name="lei" value={vahvistettava.lei} />
                <button type="submit" className="text-link underline">
                  Vahvista ja tallenna LEI
                </button>
              </form>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        {hankkeet.length === 0 ? (
          <p className="mt-3">Ei merkittyjä hankkeita.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {hankkeet.map((hanke) => (
              <li key={hanke.id} className="py-3">
                <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                  {hanke.nimi}
                </a>
                <p className="mt-1 text-sm text-muted">
                  {hanke.roolit.map((rooli) => hankeOrganisaatioRooliNimi(rooli)).join(", ")}
                  {" · "}
                  {hanke.kunta} · <VaiheMerkki vaihe={hanke.vaihe} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
