import { notFound, redirect } from "next/navigation";
import { hyvaksyEhdotusToiminto, hylkaaEhdotusToiminto } from "@/app/toiminnot";
import { HANKE_KENTTA_NIMET } from "@/lib/naytto";
import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import type { EhdotusSisalto } from "@/lib/ehdotus";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

async function vaadiYllapitaja() {
  const supabase = await luoPalvelinAsiakas();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
