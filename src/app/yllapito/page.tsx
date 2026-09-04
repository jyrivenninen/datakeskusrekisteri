import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { redirect } from "next/navigation";
import { hyvaksyKaikkiOdottavatToiminto, kuitaaKentatToiminto, kirjauduUlos } from "@/app/toiminnot";
import { jarjestaMuutosehdotukset, kasittelySelite, muotoilePvm, HANKE_KENTTA_NIMET, MUUTOSEHDOTUS_TYYPPI_NIMET, PALAUTE_AIHE_NIMET } from "@/lib/naytto";
import {
  EhdotusLuokka,
  EhdotusTila,
  ehdotusLuokkaRiviLuokka,
} from "@/komponentit/ehdotus-tila";
import { YllapitoOhjeet } from "@/komponentit/yllapito-ohjeet";
import {
  haeHankkeetYllapitoon,
  luoYllapitoAsiakas,
  supabasePalvelinAvainAsetettu,
} from "@/lib/supabase/yllapito-asiakas";

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("nimi, massahyvaksynta")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  return { user, supabase, massahyvaksynta: Boolean(data.massahyvaksynta) };
}

export default async function YllapitoSivu({
  searchParams,
}: {
  searchParams: Promise<{
    hyvaksytty?: string;
    hylatty?: string;
    kuitattu?: string;
    virhe?: string;
    palaute?: string;
  }>;
}) {
  const { supabase, massahyvaksynta } = await vaadiYllapitaja();
  const params = await searchParams;
  const { data: ehdotukset } = await supabase
    .from("muutosehdotukset")
    .select("id, tyyppi, tila, luotu_pvm, ehdottaja_tunniste, hanke_id, kasittelija, kasitelty_pvm")
    .order("luotu_pvm", { ascending: false });
  const hankeIdt = [
    ...new Set(
      (ehdotukset ?? [])
        .map((rivi) => rivi.hanke_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let hankkeet = await haeHankkeetYllapitoon(hankeIdt);
  if (hankkeet.length === 0 && hankeIdt.length > 0) {
    const { data } = await supabase.from("hankkeet").select("id, nimi, kunta").in("id", hankeIdt);
    hankkeet = data ?? [];
  }
  const hankeNimella = new Map(hankkeet.map((hanke) => [hanke.id, hanke.nimi]));
  const { data: ajot } = await supabase
    .from("lahdeajot")
    .select("id, sovitin, tila, alkoi_pvm, paattyi_pvm, http_tila, osumia, virhe")
    .order("alkoi_pvm", { ascending: false })
    .limit(20);
  const { data: palautteet } = await supabase
    .from("palautteet")
    .select("id, aihe, nimi, sahkoposti, viesti, tila, luotu_pvm, kasittelija, kasitelty_pvm")
    .order("luotu_pvm", { ascending: false });
  const odottavatPalautteet = (palautteet ?? []).filter((rivi) => rivi.tila === "odottaa");
  const kasitellytPalautteet = (palautteet ?? []).filter((rivi) => rivi.tila !== "odottaa");
  const jarjestetyt = jarjestaMuutosehdotukset(ehdotukset ?? []);
  const odottavat = jarjestetyt.filter((e) => e.tila === "odottaa");
  const kasitellyt = jarjestetyt.filter((e) => e.tila !== "odottaa");
  const odottavia = odottavat.length;
  const hyvaksyttyLkm = Number(params.hyvaksytty ?? "");

  type KuittausRivi = { hanke_id: string; kentta: string };
  let kuittattavat: KuittausRivi[] = [];
  if (supabasePalvelinAvainAsetettu()) {
    const palvelin = luoYllapitoAsiakas();
    const { data: lahteet } = await palvelin
      .from("kentta_lahteet")
      .select("rivi_id, kentta")
      .eq("taulu", "hankkeet")
      .eq("merkitty", "koneen_ehdottama");
    const nakyvat = new Map<string, KuittausRivi>();
    for (const lahde of lahteet ?? []) {
      const avain = `${lahde.rivi_id}:${lahde.kentta}`;
      if (!nakyvat.has(avain)) {
        nakyvat.set(avain, { hanke_id: lahde.rivi_id, kentta: lahde.kentta });
      }
    }
    kuittattavat = [...nakyvat.values()];
  }
  const kuittausHankeIdt = [...new Set(kuittattavat.map((r) => r.hanke_id))];
  let kuittausHankkeet = await haeHankkeetYllapitoon(kuittausHankeIdt);
  if (kuittausHankkeet.length === 0 && kuittausHankeIdt.length > 0) {
    const { data } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta")
      .in("id", kuittausHankeIdt);
    kuittausHankkeet = data ?? [];
  }
  const kuittausHankeNimi = new Map(kuittausHankkeet.map((h) => [h.id, h.nimi]));

  function ehdotusRivi(ehdotus: (typeof jarjestetyt)[number]) {
    const kasittely = kasittelySelite(ehdotus.kasittelija, ehdotus.kasitelty_pvm);
    return (
      <li
        key={ehdotus.id}
        className={`border-l-4 py-4 pl-3 ${ehdotusLuokkaRiviLuokka(ehdotus.tyyppi)}`}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <a href={`/yllapito/${ehdotus.id}`} className="text-link underline">
            {MUUTOSEHDOTUS_TYYPPI_NIMET[ehdotus.tyyppi] ?? ehdotus.tyyppi}
          </a>
          <EhdotusLuokka tyyppi={ehdotus.tyyppi} />
          <EhdotusTila tila={ehdotus.tila} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {muotoilePvm(ehdotus.luotu_pvm)}
          {ehdotus.hanke_id && hankeNimella.get(ehdotus.hanke_id)
            ? ` · ${hankeNimella.get(ehdotus.hanke_id)}`
            : ""}
          {` · ${ehdotus.ehdottaja_tunniste}`}
        </p>
        {kasittely ? <p className="mt-1 text-sm text-muted">{kasittely}</p> : null}
      </li>
    );
  }

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Ylläpito</h1>
        <form action={kirjauduUlos}>
          <button type="submit" className="text-sm text-link underline">
            Kirjaudu ulos
          </button>
        </form>
      </div>
      <YllapitoOhjeet massahyvaksynta={massahyvaksynta} />
      {hyvaksyttyLkm === 1 ? (
        <p className="mt-4">Ehdotus käsiteltiin.</p>
      ) : hyvaksyttyLkm > 1 ? (
        <p className="mt-4">{hyvaksyttyLkm} ehdotusta käsiteltiin.</p>
      ) : null}
      {params.palaute ? <p className="mt-4">Yhteydenotto merkittiin käsitellyksi.</p> : null}
      {params.hylatty ? <p className="mt-4">Ehdotus hylättiin.</p> : null}
      {params.kuitattu ? (
        <p className="mt-4">Automaattijulkaistu tieto merkittiin varmennetuksi.</p>
      ) : null}
      {params.virhe ? <p className="mt-4">{params.virhe}</p> : null}
      {(ajot ?? []).length > 0 ? (
        <details className="mt-6 rounded border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
            Lähdeajot ({ajot?.length ?? 0})
          </summary>
          <ul className="divide-y divide-border border-t border-border px-4">
            {(ajot ?? []).map((ajo) => (
              <li key={ajo.id} className="py-3">
                <p>
                  {ajo.sovitin} · {ajo.tila}
                  {ajo.http_tila != null ? ` · HTTP ${ajo.http_tila}` : ""}
                  {` · ${ajo.osumia} osumaa`}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {muotoilePvm(ajo.alkoi_pvm)}
                  {ajo.virhe ? ` · ${ajo.virhe}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <section className="mt-8" aria-labelledby="palaute-otsikko">
        <h2 id="palaute-otsikko" className="text-xl font-semibold">
          Yhteydenotot
        </h2>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {odottavatPalautteet.length === 0 ? (
            <li className="py-4">Ei odottavia yhteydenottoja.</li>
          ) : (
            odottavatPalautteet.map((palaute) => (
              <li key={palaute.id} className="py-4">
                <a href={`/yllapito/palaute/${palaute.id}`} className="text-link underline">
                  {PALAUTE_AIHE_NIMET[palaute.aihe] ?? palaute.aihe}
                </a>
                <p className="mt-1 text-sm text-muted">
                  {muotoilePvm(palaute.luotu_pvm)}
                  {palaute.nimi ? ` · ${palaute.nimi}` : ""}
                  {palaute.sahkoposti ? ` · ${palaute.sahkoposti}` : ""}
                </p>
                <p className="mt-1 max-w-prose text-sm">{palaute.viesti.slice(0, 160)}</p>
              </li>
            ))
          )}
        </ul>
        {kasitellytPalautteet.length > 0 ? (
          <details className="mt-4 rounded border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
              Käsitellyt yhteydenotot ({kasitellytPalautteet.length})
            </summary>
            <ul className="divide-y divide-border border-t border-border px-4">
              {kasitellytPalautteet.map((palaute) => {
                const kasittely = kasittelySelite(palaute.kasittelija, palaute.kasitelty_pvm);
                return (
                <li key={palaute.id} className="py-3">
                  <a href={`/yllapito/palaute/${palaute.id}`} className="text-link underline">
                    {PALAUTE_AIHE_NIMET[palaute.aihe] ?? palaute.aihe}
                  </a>
                  <p className="mt-1 text-sm text-muted">
                    {muotoilePvm(palaute.luotu_pvm)}
                    {kasittely ? ` · ${kasittely}` : ""}
                  </p>
                </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </section>
      {odottavia > 0 && massahyvaksynta ? (
        <form action={hyvaksyKaikkiOdottavatToiminto} className="mt-6 space-y-3">
          <div className="flex flex-wrap items-start gap-3">
            <input
              id="vahvista-kaikki"
              type="checkbox"
              name="vahvista"
              value="kylla"
              required
              className="mt-1"
            />
            <label htmlFor="vahvista-kaikki" className="max-w-prose text-sm">
              Käsittele kaikki odottavat ehdotukset paitsi ristiriitahavainnot,
              kenttämerkinnät, tyhjennykset ja päätökset. Hanketiedot
              julkaistaan; rikkinäiset linkit, muuttuneet dokumentit sekä
              Ryhti-, YTJ-, MML- ja kuntahavainnot merkitään vain
              käsitellyiksi (YTJ-Y-tunnusehdotus julkaisee tunnuksen).
              Ristiriitahavainto, kenttämuutos ja päätös vaativat oman
              tarkistuksen. Merkintä on ihmisen vahvistama.
            </label>
          </div>
          {supabasePalvelinAvainAsetettu() ? (
            <button
              type="submit"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Hyväksy kaikki odottavat
            </button>
          ) : (
            <p className="text-sm">
              Hyväksyntä vaatii palvelinavaimen{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code>. Lisää se{" "}
              <code>.env.local</code>-tiedostoon ja Verceliin. Älä liitä avainta
              chattiin.
            </p>
          )}
        </form>
      ) : null}
      {kuittattavat.length > 0 ? (
        <section className="mt-8" aria-labelledby="kuittaus-otsikko">
          <h2 id="kuittaus-otsikko" className="text-xl font-semibold">
            Odottaa kuittausta
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Agentti on julkaissut nämä kentät automaattisesti (koneen ehdottama).
            Kuittaus merkitsee tiedon varmennetuksi ilman arvon uudelleentarkistusta.
            Jos arvo on epäilyttävä, avaa hanke ja korjaa päivityslomakkeella.
          </p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {kuittattavat.map((rivi) => {
              const nimi =
                HANKE_KENTTA_NIMET[rivi.kentta] ??
                HANKE_KENTTA_NIMET[
                  rivi.kentta === "toimija_organisaatio_id" ? "toimija_nimi" : rivi.kentta
                ] ??
                rivi.kentta;
              return (
                <li key={`${rivi.hanke_id}:${rivi.kentta}`} className="py-4">
                  <p>
                    <a href={`/hankkeet/${rivi.hanke_id}`} className="text-link underline">
                      {kuittausHankeNimi.get(rivi.hanke_id) ?? "Hanke"}
                    </a>
                    {" · "}
                    {nimi}
                  </p>
                  {supabasePalvelinAvainAsetettu() ? (
                    <form action={kuitaaKentatToiminto} className="mt-2">
                      <input type="hidden" name="hanke_id" value={rivi.hanke_id} />
                      <input type="hidden" name="kentat" value={rivi.kentta} />
                      <button
                        type="submit"
                        className="rounded border border-foreground px-3 py-1.5 text-sm"
                      >
                        Kuittaa varmennetuksi
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <section className="mt-8" aria-labelledby="ehdotukset-otsikko">
        <h2 id="ehdotukset-otsikko" className="text-xl font-semibold">
          Muutosehdotukset
        </h2>
      <ul className="mt-4 divide-y divide-border border-y border-border">
        {odottavat.length === 0 ? (
          <li className="py-4">Ei odottavia ehdotuksia.</li>
        ) : (
          odottavat.map((ehdotus) => ehdotusRivi(ehdotus))
        )}
      </ul>
      {kasitellyt.length > 0 ? (
        <details className="mt-6 rounded border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
            Käsitellyt ({kasitellyt.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border px-4">
            {kasitellyt.map((ehdotus) => ehdotusRivi(ehdotus))}
          </ul>
        </details>
        ) : null}
      </section>
    </main>
  );
}
