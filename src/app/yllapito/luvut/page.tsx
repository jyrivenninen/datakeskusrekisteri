import Link from "next/link";
import { redirect } from "next/navigation";
import { LuvunLapikayntiLista } from "@/komponentit/luvun-lapikaynti-lista";
import {
  LUVUN_RISTIRIITA_KENTAT,
  rakennaLuvunRistiriitaRivit,
  type KenttaLahdeRivi,
  type HankeLukuRivi,
} from "@/lib/luvun-ristiriita";
import { HANKE_KENTTA_NIMET } from "@/lib/naytto";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { luoYllapitoAsiakas, supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

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

export default async function LuvunLapikayntiSivu({
  searchParams,
}: {
  searchParams: Promise<{ virhe?: string; kasitelty?: string; kentta?: string }>;
}) {
  await vaadiYllapitaja();
  const params = await searchParams;
  if (!supabasePalvelinAvainAsetettu()) {
    return (
      <main id="sisalto" className="sivuleveys flex-1 py-10">
        <p>
          <Link href="/yllapito" className="text-link underline">
            Ylläpito
          </Link>
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Lukujen läpikäynti</h1>
        <p className="mt-4">Palvelinavain puuttuu — jonoa ei voi ladata.</p>
      </main>
    );
  }

  const yllapito = luoYllapitoAsiakas();
  const kenttaSuodatin = params.kentta?.trim() || null;

  const { data: lahteetRaaka, error: lVirhe } = await yllapito
    .from("kentta_lahteet")
    .select("id, taulu, rivi_id, kentta, lahde_url, lainaus, luottamus, merkitty, tila")
    .eq("taulu", "hankkeet")
    .in("kentta", [...LUVUN_RISTIRIITA_KENTAT])
    .neq("tila", "korvattu");
  if (lVirhe) throw new Error(lVirhe.message);

  const lahteet = (lahteetRaaka ?? []) as KenttaLahdeRivi[];
  const hankeIdt = [...new Set(lahteet.map((l) => l.rivi_id))];

  const { data: hankkeetRaaka, error: hVirhe } = await yllapito
    .from("hankkeet")
    .select(
      "id, nimi, kunta, teho_mw, it_teho_mw, pinta_ala_ha, kaava_ala_ha, sahkonkaytto_twh_a, generaattorit_lkm, generaattorit_kaytossa_max_lkm, generaattori_polttoaineteho_mw, generaattori_yksikkoteho_mwe, diesel_vuosikulutus_maara, varavoima_paastot_t_co2e",
    )
    .in("id", hankeIdt.length ? hankeIdt : ["00000000-0000-0000-0000-000000000000"])
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null);
  if (hVirhe) throw new Error(hVirhe.message);

  const { data: kasitellyt, error: kVirhe } = await yllapito
    .from("luvun_lapikaynti")
    .select("taulu, rivi_id, kentta");
  if (kVirhe) throw new Error(kVirhe.message);

  const kasitellytAvaimet = new Set(
    (kasitellyt ?? []).map((r) => `${r.taulu}:${r.rivi_id}:${r.kentta}`),
  );

  let rivit = rakennaLuvunRistiriitaRivit(
    lahteet,
    (hankkeetRaaka ?? []) as HankeLukuRivi[],
    kasitellytAvaimet,
  );
  if (kenttaSuodatin) {
    rivit = rivit.filter((r) => r.kentta === kenttaSuodatin);
  }

  const maarat = new Map<string, number>();
  for (const r of rakennaLuvunRistiriitaRivit(
    lahteet,
    (hankkeetRaaka ?? []) as HankeLukuRivi[],
    kasitellytAvaimet,
  )) {
    maarat.set(r.kentta, (maarat.get(r.kentta) ?? 0) + 1);
  }

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <Link href="/yllapito" className="text-link underline">
          Ylläpito
        </Link>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Lukujen läpikäynti</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Kentät, joissa voimassa olevat lähteet antavat eri luvun eikä luottamus ole
        vielä ristiriitainen. Ratkaisu riippuu lainauksesta — koodi ei päättele
        automaattisesti. Aloita pinta-alasta: usein kyse on kaava-alueesta, tontista
        tai rakennettavasta alasta.
      </p>

      <ul className="mt-4 flex flex-wrap gap-2 text-sm">
        <li>
          <Link
            href="/yllapito/luvut"
            className={!kenttaSuodatin ? "font-medium text-foreground" : "text-link underline"}
          >
            Kaikki ({[...maarat.values()].reduce((a, b) => a + b, 0)})
          </Link>
        </li>
        {[...maarat.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([kentta, lkm]) => (
            <li key={kentta}>
              <Link
                href={`/yllapito/luvut?kentta=${encodeURIComponent(kentta)}`}
                className={
                  kenttaSuodatin === kentta
                    ? "font-medium text-foreground"
                    : "text-link underline"
                }
              >
                {HANKE_KENTTA_NIMET[kentta] ?? kentta} ({lkm})
              </Link>
            </li>
          ))}
      </ul>

      {params.virhe ? (
        <p className="mt-4 text-sm text-red-700">{params.virhe}</p>
      ) : null}
      {params.kasitelty ? <p className="mt-4 text-sm">Rivi käsiteltiin.</p> : null}

      <LuvunLapikayntiLista rivit={rivit} />
    </main>
  );
}
