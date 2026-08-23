import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { redirect } from "next/navigation";
import { kirjauduUlos } from "@/app/toiminnot";
import { muotoilePvm } from "@/lib/naytto";

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
  searchParams: Promise<{ hyvaksytty?: string; hylatty?: string }>;
}) {
  const { supabase } = await vaadiYllapitaja();
  const params = await searchParams;
  const { data: ehdotukset } = await supabase
    .from("muutosehdotukset")
    .select("id, tyyppi, tila, luotu_pvm, ehdottaja_tunniste")
    .order("luotu_pvm", { ascending: false });

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
      {params.hyvaksytty ? <p className="mt-4">Ehdotus hyväksyttiin ja julkaistiin.</p> : null}
      {params.hylatty ? <p className="mt-4">Ehdotus hylättiin.</p> : null}
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {(ehdotukset ?? []).length === 0 ? (
          <li className="py-4">Ei muutosehdotuksia.</li>
        ) : (
          (ehdotukset ?? []).map((ehdotus) => (
            <li key={ehdotus.id} className="py-4">
              <a href={`/yllapito/${ehdotus.id}`} className="text-link underline">
                {ehdotus.tyyppi === "uusi_hanke" ? "Uusi hanke" : "Täydennys"}
              </a>
              <p className="mt-1 text-sm text-muted">
                {ehdotus.tila} · {muotoilePvm(ehdotus.luotu_pvm)} · {ehdotus.ehdottaja_tunniste}
              </p>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
