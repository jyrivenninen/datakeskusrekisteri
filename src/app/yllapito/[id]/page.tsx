import { notFound, redirect } from "next/navigation";
import { hyvaksyEhdotusToiminto, hylkaaEhdotusToiminto } from "@/app/toiminnot";
import { EhdotusTila } from "@/komponentit/ehdotus-tila";
import {
  ehdotuksenHankeIdt,
  HANKE_KENTTA_NIMET,
  MUUTOSEHDOTUS_TYYPPI_NIMET,
  RISTIRIITA_SAANTO_NIMET,
} from "@/lib/naytto";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import type { EhdotusSisalto } from "@/lib/ehdotus";
import {
  haeHankkeetYllapitoon,
  supabasePalvelinAvainAsetettu,
} from "@/lib/supabase/yllapito-asiakas";

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  return supabase;
}

export default async function EhdotusSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ virhe?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await vaadiYllapitaja();
  const { data: ehdotus } = await supabase
    .from("muutosehdotukset")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!ehdotus) notFound();
  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  const odottaa = ehdotus.tila === "odottaa";
  const eiJulkaista =
    ehdotus.tyyppi === "linkki_rikki" ||
    ehdotus.tyyppi === "ryhti_havainto" ||
    ehdotus.tyyppi === "kunta_havainto" ||
    (ehdotus.tyyppi === "ytj_havainto" && !sisalto.ytj?.ehdota_tunnus) ||
    ehdotus.tyyppi === "mml_havainto" ||
    ehdotus.tyyppi === "dokumentti_muuttunut" ||
    ehdotus.tyyppi === "ristiriita_havainto";
  const linkki = sisalto.linkki;
  const ryhti = sisalto.ryhti;
  const ytj = sisalto.ytj;
  const mml = sisalto.mml;
  const dokumentti = sisalto.dokumentti;
  const ristiriita = sisalto.ristiriita;
  const hankeIdt = ehdotuksenHankeIdt(ehdotus.hanke_id, ristiriita);
  let hankkeet = await haeHankkeetYllapitoon(hankeIdt);
  if (hankkeet.length === 0 && hankeIdt.length > 0) {
    const { data } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta")
      .in("id", hankeIdt);
    hankkeet = data ?? [];
  }
  const hankeNimella = new Map(hankkeet.map((hanke) => [hanke.id, hanke]));

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/yllapito" className="text-link underline">
          Ylläpito
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Muutosehdotus</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
        <span>{MUUTOSEHDOTUS_TYYPPI_NIMET[ehdotus.tyyppi] ?? ehdotus.tyyppi}</span>
        <span aria-hidden="true">·</span>
        <EhdotusTila tila={ehdotus.tila} />
        <span aria-hidden="true">·</span>
        <span>{ehdotus.ehdottaja_tunniste}</span>
      </p>
      {query.virhe ? (
        <p className="mt-4" role="alert">
          {query.virhe}
        </p>
      ) : null}
      {hankeIdt.length > 0 ? (
        <section className="mt-4" aria-labelledby="koskee-otsikko">
          <h2 id="koskee-otsikko" className="text-lg font-semibold">
            {hankeIdt.length === 1 ? "Hanke" : "Hankkeet"}
          </h2>
          <ul className="mt-2">
            {hankeIdt.map((hankeId) => {
              const hanke = hankeNimella.get(hankeId);
              return (
                <li key={hankeId}>
                  <a href={`/hankkeet/${hankeId}`} className="text-link underline">
                    {hanke?.nimi ?? "Avaa hanke"}
                  </a>
                  {hanke?.kunta ? ` · ${hanke.kunta}` : ""}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {ehdotus.huomautus ? (
        <p className="mt-4">
          <strong>Huomautus:</strong> {ehdotus.huomautus}
        </p>
      ) : null}
      {ehdotus.perustelu ? (
        <p className="mt-4">
          <strong>Käsittelyn perustelu:</strong> {ehdotus.perustelu}
        </p>
      ) : null}

      {ryhti ? (
        <section className="mt-6" aria-labelledby="ryhti-otsikko">
          <h2 id="ryhti-otsikko" className="text-xl font-semibold">
            Ryhti-kaavakohde
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei julkaise
            hanketta. Ryhdistä puuttuva kaava ei ole todiste siitä, ettei
            hanketta ole.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Kokoelma</dt>
              <dd className="mt-1">{ryhti.kokoelma_nimi}</dd>
            </div>
            {ryhti.nimi ? (
              <div className="py-3">
                <dt className="font-medium">Nimi aineistossa</dt>
                <dd className="mt-1">{ryhti.nimi}</dd>
              </div>
            ) : null}
            {ryhti.kaavatunnus ? (
              <div className="py-3">
                <dt className="font-medium">Kaavatunnus</dt>
                <dd className="mt-1">{ryhti.kaavatunnus}</dd>
              </div>
            ) : null}
            {ryhti.kunta_tunnukset.length > 0 ? (
              <div className="py-3">
                <dt className="font-medium">Kuntatunnukset</dt>
                <dd className="mt-1">{ryhti.kunta_tunnukset.join(", ")}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Hakuehto</dt>
              <dd className="mt-1">{ryhti.hakuehto}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Tietue</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
            {ryhti.kuvaus ? (
              <div className="py-3">
                <dt className="font-medium">Kuvaus aineistossa</dt>
                <dd className="mt-1">{ryhti.kuvaus}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {ytj ? (
        <section className="mt-6" aria-labelledby="ytj-otsikko">
          <h2 id="ytj-otsikko" className="text-xl font-semibold">
            YTJ-tiedot
          </h2>
          <p className="mt-2 text-sm text-muted">
            {ytj.ehdota_tunnus
              ? "Hyväksyntä tallentaa Y-tunnuksen organisaatiolle. Lähde on PRH:n YTJ-tietue (CC BY 4.0), ei rajapinnan juurta."
              : "Hyväksyntä merkitsee havainnon käsitellyksi. Se ei päivitä organisaatiota. Lähde: PRH avoin data (YTJ), CC BY 4.0."}
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Y-tunnus</dt>
              <dd className="mt-1">{ytj.y_tunnus}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Nimi rekisterissä</dt>
              <dd className="mt-1">{ytj.rekisterin_nimi}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Toiminimi YTJ:ssä</dt>
              <dd className="mt-1">{ytj.ytj_nimi ?? "ei tietuetta"}</dd>
            </div>
            {ytj.rekisterointi_pvm ? (
              <div className="py-3">
                <dt className="font-medium">Rekisteröintipäivä YTJ:ssä</dt>
                <dd className="mt-1">{ytj.rekisterointi_pvm}</dd>
              </div>
            ) : null}
            {ytj.toimiala ? (
              <div className="py-3">
                <dt className="font-medium">Toimiala YTJ:ssä</dt>
                <dd className="mt-1">{ytj.toimiala}</dd>
              </div>
            ) : null}
            {ytj.kotipaikka ? (
              <div className="py-3">
                <dt className="font-medium">Kotipaikka YTJ:ssä</dt>
                <dd className="mt-1">{ytj.kotipaikka}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Tietue</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {mml ? (
        <section className="mt-6" aria-labelledby="mml-otsikko">
          <h2 id="mml-otsikko" className="text-xl font-semibold">
            MML-geokoodaus
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei päivitä
            hankkeen sijaintia. Lähde: Maanmittauslaitos, CC BY 4.0.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            {mml.nimi ? (
              <div className="py-3">
                <dt className="font-medium">Kohde aineistossa</dt>
                <dd className="mt-1">{mml.nimi}</dd>
              </div>
            ) : null}
            {mml.kunta ? (
              <div className="py-3">
                <dt className="font-medium">Kunta aineistossa</dt>
                <dd className="mt-1">{mml.kunta}</dd>
              </div>
            ) : null}
            {mml.kiinteistotunnus ? (
              <div className="py-3">
                <dt className="font-medium">Kiinteistötunnus aineistossa</dt>
                <dd className="mt-1">{mml.kiinteistotunnus}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Tietue</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {dokumentti ? (
        <section className="mt-6" aria-labelledby="dokumentti-otsikko">
          <h2 id="dokumentti-otsikko" className="text-xl font-semibold">
            Dokumentin muutos
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei muuta
            hankekenttiä. Tiiviste on uutettusta tekstistä, ei PDF-tiedoston
            raakabinääristä.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Otsikko</dt>
              <dd className="mt-1">{dokumentti.otsikko}</dd>
            </div>
            {dokumentti.muoto ? (
              <div className="py-3">
                <dt className="font-medium">Muoto</dt>
                <dd className="mt-1">{dokumentti.muoto}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Merkkimäärä</dt>
              <dd className="mt-1">{dokumentti.merkkimaara}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Edellinen tiiviste</dt>
              <dd className="mt-1 break-all font-mono text-sm">
                {dokumentti.vanha_tiiviste ?? "ei aiempaa"}
              </dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Uusi tiiviste</dt>
              <dd className="mt-1 break-all font-mono text-sm">
                {dokumentti.uusi_tiiviste}
              </dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Osoite</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {ristiriita ? (
        <section className="mt-6" aria-labelledby="ristiriita-otsikko">
          <h2 id="ristiriita-otsikko" className="text-xl font-semibold">
            Ristiriitahavainto
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei muuta
            hankekenttiä eikä päättele syytä.
          </p>
          {ristiriita.ei_uudelleen ? (
            <p className="mt-2 text-sm">Sama havainto ei nouse uudelleen.</p>
          ) : null}
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Sääntö</dt>
              <dd className="mt-1">
                {RISTIRIITA_SAANTO_NIMET[ristiriita.saanto] ?? ristiriita.saanto}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {linkki ? (
        <section className="mt-6" aria-labelledby="linkki-otsikko">
          <h2 id="linkki-otsikko" className="text-xl font-semibold">
            Linkkitarkistus
          </h2>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Osoite</dt>
              <dd className="mt-1">
                <a href={linkki.url} className="text-link underline" rel="noopener noreferrer">
                  {linkki.url}
                </a>
              </dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">HTTP-tila</dt>
              <dd className="mt-1">{linkki.http_tila ?? "ei vastausta"}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Vaste</dt>
              <dd className="mt-1">{linkki.vaste_ms} ms</dd>
            </div>
            {linkki.virhe ? (
              <div className="py-3">
                <dt className="font-medium">Virhe</dt>
                <dd className="mt-1">{linkki.virhe}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Kenttä</dt>
              <dd className="mt-1">
                {linkki.taulu}.{linkki.kentta}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {Object.keys(sisalto.kentat ?? {}).length > 0 ? (
        <dl className="mt-6 divide-y divide-border border-y border-border">
        {Object.entries(sisalto.kentat ?? {}).map(([kentta, tieto]) => (
          <div key={kentta} className="py-3">
            <dt className="font-medium">
              {kentta === "toimija_nimi"
                ? "Hankkeesta vastaava"
                : (HANKE_KENTTA_NIMET[kentta] ?? kentta)}
            </dt>
            <dd className="mt-1">
              {tieto.arvo}
              <p className="mt-1 text-sm">
                <a href={tieto.lahde_url} className="text-link underline" rel="noopener noreferrer">
                  {tieto.lahde_url}
                </a>
                {tieto.lahde_sivu ? ` (s. ${tieto.lahde_sivu})` : ""}
              </p>
              {tieto.lainaus ? <blockquote className="mt-2 border-l-2 pl-3">{tieto.lainaus}</blockquote> : null}
            </dd>
          </div>
        ))}
        </dl>
      ) : null}

      {sisalto.kuvat && sisalto.kuvat.length > 0 ? (
        <section className="mt-8" aria-labelledby="kuvat-otsikko">
          <h2 id="kuvat-otsikko" className="text-xl font-semibold">
            Valokuvat
          </h2>
          <ul className="mt-4 space-y-6">
            {sisalto.kuvat.map((kuva, indeksi) => (
              <li key={`${kuva.kuva_url}-${indeksi}`}>
                <figure className="overflow-hidden rounded border border-border bg-surface">
                  <img
                    src={kuva.kuva_url}
                    alt={kuva.kuvateksti}
                    className="h-64 w-full object-cover"
                  />
                  <figcaption className="space-y-1 p-3 text-sm">
                    <p>{kuva.kuvateksti}</p>
                    <p className="text-muted">Valokuva: {kuva.kuvaaja}</p>
                    <p>
                      <a
                        href={kuva.lahde_url}
                        className="text-link underline"
                        rel="noopener noreferrer"
                      >
                        {kuva.lahde_url}
                      </a>
                    </p>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sisalto.vaihtoehdot && Object.keys(sisalto.vaihtoehdot).length > 0 ? (
        <section className="mt-8" aria-labelledby="vaihtoehdot-otsikko">
          <h2 id="vaihtoehdot-otsikko" className="text-xl font-semibold">
            Vaihtoehdot
          </h2>
          <p className="mt-2 text-sm text-muted">
            Luvut kirjoitetaan vaihtoehtoriveille, ei hankkeen yhteisiin
            teho- tai sähkökenttiin.
          </p>
          {Object.entries(sisalto.vaihtoehdot).map(([tunnus, kentat]) => (
            <div key={tunnus} className="mt-4">
              <h3 className="font-medium">{tunnus}</h3>
              <dl className="mt-2 divide-y divide-border border-y border-border">
                {Object.entries(kentat).map(([kentta, tieto]) => (
                  <div key={kentta} className="py-3">
                    <dt className="font-medium">{HANKE_KENTTA_NIMET[kentta] ?? kentta}</dt>
                    <dd className="mt-1">
                      {tieto.arvo}
                      {tieto.luottamus ? (
                        <span className="text-sm text-muted"> · {tieto.luottamus}</span>
                      ) : null}
                      <p className="mt-1 text-sm">
                        <a
                          href={tieto.lahde_url}
                          className="text-link underline"
                          rel="noopener noreferrer"
                        >
                          {tieto.lahde_url}
                        </a>
                        {tieto.lahde_sivu ? ` (s. ${tieto.lahde_sivu})` : ""}
                      </p>
                      {tieto.lainaus ? (
                        <blockquote className="mt-2 border-l-2 pl-3">{tieto.lainaus}</blockquote>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ) : null}

      {odottaa && !supabasePalvelinAvainAsetettu() ? (
        <p className="mt-6 text-sm">
          Hyväksyntä vaatii palvelinavaimen <code>SUPABASE_SERVICE_ROLE_KEY</code>. Lisää se
          .env.local-tiedostoon ja Verceliin. Älä liitä avainta chattiin.
        </p>
      ) : null}

      {odottaa ? (
        <div className="mt-8 flex flex-col gap-6">
          <form action={hyvaksyEhdotusToiminto} className="space-y-3">
            <input type="hidden" name="id" value={ehdotus.id} />
            {ristiriita ? (
              <div className="space-y-3">
                <p className="max-w-prose text-sm text-muted">
                  Käsittely merkitsee, ettei sama havainto nouse uudelleen.
                  Kirjaa miksi.
                </p>
                <label htmlFor="ei-uudelleen-perustelu" className="block text-sm font-medium">
                  Miksi havainto ei nouse uudelleen
                </label>
                <textarea
                  id="ei-uudelleen-perustelu"
                  name="ei_uudelleen_perustelu"
                  rows={3}
                  required
                  minLength={12}
                  className="w-full rounded border border-border bg-surface px-2 py-2"
                />
              </div>
            ) : null}
            <button
              type="submit"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {eiJulkaista ? "Merkitse käsitellyksi" : "Hyväksy ja julkaise"}
            </button>
          </form>
          <form action={hylkaaEhdotusToiminto} className="space-y-2">
            <input type="hidden" name="id" value={ehdotus.id} />
            {ristiriita ? (
              <p className="max-w-prose text-sm text-muted">
                Hylkäys poistaa rivin jonosta, mutta sama havainto voi nousta
                seuraavassa ajossa.
              </p>
            ) : null}
            <label htmlFor="perustelu" className="text-sm font-medium">
              Hylkäyksen perustelu
            </label>
            <textarea
              id="perustelu"
              name="perustelu"
              rows={3}
              className="w-full rounded border border-border bg-surface px-2 py-2"
            />
            <button type="submit" className="rounded border border-border px-4 py-2 text-sm">
              Hylkää
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
