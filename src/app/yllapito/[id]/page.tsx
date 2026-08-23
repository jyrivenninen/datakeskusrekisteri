import { notFound, redirect } from "next/navigation";
import { hyvaksyEhdotusToiminto, hylkaaEhdotusToiminto } from "@/app/toiminnot";
import { HANKE_KENTTA_NIMET } from "@/lib/naytto";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import type { EhdotusSisalto } from "@/lib/ehdotus";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

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

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/yllapito" className="text-link underline">
          Ylläpito
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Muutosehdotus</h1>
      <p className="mt-2 text-muted">
        {ehdotus.tyyppi} · {ehdotus.tila} · {ehdotus.ehdottaja_tunniste}
      </p>
      {query.virhe ? (
        <p className="mt-4" role="alert">
          {query.virhe}
        </p>
      ) : null}
      {ehdotus.huomautus ? (
        <p className="mt-4">
          <strong>Huomautus:</strong> {ehdotus.huomautus}
        </p>
      ) : null}

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
          <form action={hyvaksyEhdotusToiminto}>
            <input type="hidden" name="id" value={ehdotus.id} />
            <button
              type="submit"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Hyväksy ja julkaise
            </button>
          </form>
          <form action={hylkaaEhdotusToiminto} className="space-y-2">
            <input type="hidden" name="id" value={ehdotus.id} />
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
