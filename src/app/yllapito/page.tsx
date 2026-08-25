import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { redirect } from "next/navigation";
import { hyvaksyKaikkiOdottavatToiminto, kirjauduUlos } from "@/app/toiminnot";
import { jarjestaMuutosehdotukset, muotoilePvm, MUUTOSEHDOTUS_TYYPPI_NIMET } from "@/lib/naytto";
import {
  EhdotusTila,
  ehdotusTilaRiviLuokka,
} from "@/komponentit/ehdotus-tila";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("nimi")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  return { user, supabase };
}

export default async function YllapitoSivu({
  searchParams,
}: {
  searchParams: Promise<{ hyvaksytty?: string; hylatty?: string; virhe?: string }>;
}) {
  const { supabase } = await vaadiYllapitaja();
  const params = await searchParams;
  const { data: ehdotukset } = await supabase
    .from("muutosehdotukset")
    .select("id, tyyppi, tila, luotu_pvm, ehdottaja_tunniste")
    .order("luotu_pvm", { ascending: false });
  const { data: ajot } = await supabase
    .from("lahdeajot")
    .select("id, sovitin, tila, alkoi_pvm, paattyi_pvm, http_tila, osumia, virhe")
    .order("alkoi_pvm", { ascending: false })
    .limit(20);
  const jarjestetyt = jarjestaMuutosehdotukset(ehdotukset ?? []);
  const odottavia = jarjestetyt.filter((e) => e.tila === "odottaa").length;
  const hyvaksyttyLkm = Number(params.hyvaksytty ?? "");

  return (
    <main id="sisalto" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Ylläpito</h1>
        <form action={kirjauduUlos}>
          <button type="submit" className="text-sm text-link underline">
            Kirjaudu ulos
          </button>
        </form>
      </div>
      {hyvaksyttyLkm === 1 ? (
        <p className="mt-4">Ehdotus käsiteltiin.</p>
      ) : hyvaksyttyLkm > 1 ? (
        <p className="mt-4">{hyvaksyttyLkm} ehdotusta käsiteltiin.</p>
      ) : null}
      {params.hylatty ? <p className="mt-4">Ehdotus hylättiin.</p> : null}
      {params.virhe ? <p className="mt-4">{params.virhe}</p> : null}
      {(ajot ?? []).length > 0 ? (
        <section className="mt-8" aria-labelledby="ajot-otsikko">
          <h2 id="ajot-otsikko" className="text-xl font-semibold">
            Lähdeajot
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
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
        </section>
      ) : null}
      {odottavia > 0 ? (
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
              Käsittele kaikki {odottavia} odottavaa ehdotusta. Hanketiedot
              julkaistaan; rikkinäiset linkit, muuttuneet dokumentit sekä
              Ryhti-, YTJ-, MML- ja kuntahavainnot merkitään vain
              käsitellyiksi (YTJ-Y-tunnusehdotus julkaisee tunnuksen).
              Merkintä on ihmisen vahvistama.
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
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {jarjestetyt.length === 0 ? (
          <li className="py-4">Ei muutosehdotuksia.</li>
        ) : (
          jarjestetyt.map((ehdotus) => (
            <li
              key={ehdotus.id}
              className={`border-l-4 py-4 pl-3 ${ehdotusTilaRiviLuokka(ehdotus.tila)}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <a href={`/yllapito/${ehdotus.id}`} className="text-link underline">
                  {MUUTOSEHDOTUS_TYYPPI_NIMET[ehdotus.tyyppi] ?? ehdotus.tyyppi}
                </a>
                <EhdotusTila tila={ehdotus.tila} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {muotoilePvm(ehdotus.luotu_pvm)} · {ehdotus.ehdottaja_tunniste}
              </p>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
