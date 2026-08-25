import { notFound, redirect } from "next/navigation";
import { merkitsePalauteKasitellyksi } from "@/app/toiminnot";
import { PALAUTE_AIHE_NIMET, PALAUTE_TILA_NIMET, muotoileAika } from "@/lib/naytto";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import type { Palaute } from "@/lib/supabase/tietokanta";

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

export default async function PalauteSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ virhe?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await vaadiYllapitaja();
  const { data } = await supabase.from("palautteet").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const palaute = data as Palaute;
  const odottaa = palaute.tila === "odottaa";

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/yllapito" className="text-link underline">
          Ylläpito
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Yhteydenotto</h1>
      <p className="mt-2 text-muted">
        {PALAUTE_AIHE_NIMET[palaute.aihe] ?? palaute.aihe}
        {" · "}
        {PALAUTE_TILA_NIMET[palaute.tila] ?? palaute.tila}
        {" · "}
        {muotoileAika(palaute.luotu_pvm)}
      </p>
      {query.virhe ? (
        <p className="mt-4" role="alert">
          {query.virhe}
        </p>
      ) : null}
      <dl className="mt-6 divide-y divide-border border-y border-border">
        <div className="py-3">
          <dt className="font-medium">Nimi</dt>
          <dd className="mt-1">{palaute.nimi ?? "ei annettu"}</dd>
        </div>
        <div className="py-3">
          <dt className="font-medium">Sähköposti</dt>
          <dd className="mt-1">
            {palaute.sahkoposti ? (
              <a href={`mailto:${palaute.sahkoposti}`} className="text-link underline">
                {palaute.sahkoposti}
              </a>
            ) : (
              "ei annettu"
            )}
          </dd>
        </div>
        <div className="py-3">
          <dt className="font-medium">Viesti</dt>
          <dd className="mt-1 whitespace-pre-wrap">{palaute.viesti}</dd>
        </div>
        {palaute.huomautus ? (
          <div className="py-3">
            <dt className="font-medium">Ylläpidon merkintä</dt>
            <dd className="mt-1 whitespace-pre-wrap">{palaute.huomautus}</dd>
          </div>
        ) : null}
        {palaute.kasittelija ? (
          <div className="py-3">
            <dt className="font-medium">Käsittelijä</dt>
            <dd className="mt-1">
              {palaute.kasittelija}
              {palaute.kasitelty_pvm ? ` · ${muotoileAika(palaute.kasitelty_pvm)}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      {odottaa ? (
        <form action={merkitsePalauteKasitellyksi} className="mt-8 space-y-3">
          <input type="hidden" name="id" value={palaute.id} />
          <label htmlFor="huomautus" className="block text-sm font-medium">
            Merkintä (vapaaehtoinen)
          </label>
          <textarea
            id="huomautus"
            name="huomautus"
            rows={3}
            className="w-full rounded border border-border bg-surface px-2 py-2"
          />
          <button
            type="submit"
            className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Merkitse käsitellyksi
          </button>
        </form>
      ) : null}
    </main>
  );
}
