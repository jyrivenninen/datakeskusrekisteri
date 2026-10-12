import Link from "next/link";
import { redirect } from "next/navigation";
import { Ls13EraLista } from "@/komponentit/ls13-era-lista";
import {
  haeLs13EraKuittaukset,
  ls13EraKoneYhteenveto,
} from "@/lib/ls13-era-lapikaynti";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import {
  luoYllapitoAsiakas,
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
  if (!data) {
    redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  }
}

export default async function Ls13EraKuittauksetSivu() {
  await vaadiYllapitaja();

  if (!supabasePalvelinAvainAsetettu()) {
    return (
      <main id="sisalto" className="sivuleveys flex-1 py-10">
        <p>
          <Link href="/yllapito" className="text-link underline">
            Ylläpito
          </Link>
        </p>
        <h1 className="mt-4 text-3xl font-semibold">LS13-eräkuittaukset</h1>
        <p className="mt-4">Palvelinavain puuttuu — jonoa ei voi ladata.</p>
      </main>
    );
  }

  const yllapito = luoYllapitoAsiakas();
  const rivit = await haeLs13EraKuittaukset(yllapito);
  const yht = ls13EraKoneYhteenveto(rivit);

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <Link href="/yllapito" className="text-link underline">
          Ylläpito
        </Link>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">LS13-eräkuittaukset</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Järjestys: koneellisesti hylätyt, sitten vaihe, sitten loput. Tukee =
        jää ihmisen vahvistamaksi (yksittäin). Ei tue = tila ei_tue (pois
        valosta ja varmistusprosentista); asiakirja säilyy.
      </p>
      <p className="mt-2 text-sm">
        Jonossa {rivit.length} · kone ok {yht.ok} · kone ei tue {yht.ei_tue} ·
        vaihe (ihminen) {yht.vaihe_ihminen}
      </p>
      <Ls13EraLista rivit={rivit} />
    </main>
  );
}
