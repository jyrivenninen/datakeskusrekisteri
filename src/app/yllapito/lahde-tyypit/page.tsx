import Link from "next/link";
import { redirect } from "next/navigation";
import { LahdeTyyppiLapikayntiLista } from "@/komponentit/lahde-tyyppi-lapikaynti-lista";
import type { LahdeTyyppi, Sitovuustaso } from "@/lib/lahde-metatiedot";
import { yhdistaLapikayntiData } from "@/lib/lahde-tyyppi-lapikaynti";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import type { EhdotusSisalto } from "@/lib/ehdotus";

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

export default async function LahdeTyypitLapikayntiSivu({
  searchParams,
}: {
  searchParams: Promise<{ virhe?: string; kasitelty?: string }>;
}) {
  const supabase = await vaadiYllapitaja();
  const params = await searchParams;

  const urlMaara = new Map<string, number>();
  const sivuKoko = 1000;
  for (let alku = 0; ; alku += sivuKoko) {
    const { data, error } = await supabase
      .from("kentta_lahteet")
      .select("lahde_url")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const rivi of data) {
      if (!rivi.lahde_url) continue;
      urlMaara.set(rivi.lahde_url, (urlMaara.get(rivi.lahde_url) ?? 0) + 1);
    }
    if (data.length < sivuKoko) break;
  }

  const dokumentit: Array<{
    id: string;
    url: string;
    otsikko: string;
    lahde_tyyppi: LahdeTyyppi;
    sitovuustaso: Sitovuustaso;
    otsikko_automaattinen: boolean;
    lahde_metatiedot_kasitelty_pvm: string | null;
  }> = [];

  for (let alku = 0; ; alku += sivuKoko) {
    const { data, error } = await supabase
      .from("dokumentit")
      .select(
        "id, url, otsikko, lahde_tyyppi, sitovuustaso, otsikko_automaattinen, lahde_metatiedot_kasitelty_pvm",
      )
      .order("url")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    dokumentit.push(...(data as typeof dokumentit));
    if (data.length < sivuKoko) break;
  }

  const { data: ehdotukset, error: ehdotusVirhe } = await supabase
    .from("muutosehdotukset")
    .select("id, sisalto")
    .eq("tyyppi", "lahde_tyyppi_havainto")
    .eq("tila", "odottaa");
  if (ehdotusVirhe) throw new Error(ehdotusVirhe.message);

  const { rivit, yhteenveto } = yhdistaLapikayntiData({
    dokumentit,
    urlMaara,
    ehdotukset: (ehdotukset ?? []).map((e) => ({
      id: e.id,
      sisalto: e.sisalto as EhdotusSisalto,
    })),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm">
        <Link href="/yllapito" className="text-link underline">
          ← Ylläpito
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-semibold">Lähdetyyppien läpikäynti</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Aseta URL-tasoinen lähdetyyppi ja sitovuustaso. Domain-agentin ehdotukset näkyvät ensin;
        ehdotuksettomat URL:t on järjestetty viittausten mukaan. Otsikon voi korjata samalla, jos
        rivi on merkitty automaattiseksi.
      </p>

      {params.virhe ? (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400" role="alert">
          {params.virhe}
        </p>
      ) : null}
      {params.kasitelty === "1" ? (
        <p className="mt-4 text-sm text-teal-800 dark:text-teal-300">Rivi tallennettu.</p>
      ) : null}

      <LahdeTyyppiLapikayntiLista rivit={rivit} yhteenveto={yhteenveto} />
    </main>
  );
}
