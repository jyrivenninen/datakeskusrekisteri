import Link from "next/link";
import { redirect } from "next/navigation";
import { kirjauduUlos } from "@/app/toiminnot";
import { KuittausLista } from "@/komponentit/kuittaus-lista";
import {
  jarjestaKuittausRivit,
  parsiKuittausSuodatus,
  suodataKuittausRivit,
  type KuittausJarjestys,
} from "@/lib/kuittaus-suodatus";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { haeKuittausNakyma } from "@/lib/supabase/kuittaus-kysely";
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
}

function parsiJarjestys(arvo: string | undefined): KuittausJarjestys {
  if (
    arvo === "kunta" ||
    arvo === "kentta" ||
    arvo === "luottamus" ||
    arvo === "vaihe"
  ) {
    return arvo;
  }
  return "hanke";
}

export default async function KuittausSivu({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kunta?: string;
    toimija?: string;
    vaihe?: string;
    kentta?: string;
    taydennys?: string;
    ennen?: string;
    jarjestys?: string;
    kuitattu?: string;
    paivitetty?: string;
    virhe?: string;
  }>;
}) {
  await vaadiYllapitaja();
  const params = await searchParams;
  const suodatus = parsiKuittausSuodatus(params);
  const jarjestys = parsiJarjestys(params.jarjestys);
  const kuitattuLkm = Number(params.kuitattu ?? "");
  const paivitettyLkm = Number(params.paivitetty ?? "");

  const tulos = supabasePalvelinAvainAsetettu() ? await haeKuittausNakyma() : null;
  const kaikkiRivit = tulos?.rivit ?? [];
  const suodatetut = jarjestaKuittausRivit(
    suodataKuittausRivit(kaikkiRivit, suodatus),
    jarjestys,
  );

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm">
            <Link href="/yllapito" className="text-link underline">
              Ylläpito
            </Link>
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Odottaa kuittausta</h1>
        </div>
        <form action={kirjauduUlos}>
          <button type="submit" className="text-sm text-link underline">
            Kirjaudu ulos
          </button>
        </form>
      </div>

      <p className="mt-4 max-w-prose text-sm text-muted">
        Agentti on julkaissut nämä kentät automaattisesti (koneen ehdottama). Kuittaus merkitsee
        tiedon nähdyksi ilman arvon uudelleentarkistusta. Luottamus (vahvistettu / epävarma /
        ristiriitainen) voi muuttua erikseen. Kuittaus vaatii suodattimen — valitse ensin rajaus,
        merkitse kuittattavat rivit ja tallenna.
      </p>

      {kuitattuLkm > 0 ? (
        <p className="mt-4">
          {kuitattuLkm === 1
            ? "1 kenttä kuitattiin."
            : `${kuitattuLkm} kenttää kuitattiin.`}
        </p>
      ) : null}
      {paivitettyLkm > 0 ? (
        <p className="mt-4">
          {paivitettyLkm === 1
            ? "1 kentän luottamus päivitettiin."
            : `${paivitettyLkm} kentän luottamus päivitettiin.`}
        </p>
      ) : null}
      {params.virhe ? <p className="mt-4">{params.virhe}</p> : null}

      {kaikkiRivit.length === 0 ? (
        <p className="mt-8">Ei odottavia kuittauksia.</p>
      ) : (
        <KuittausLista
          kaikkiRivit={kaikkiRivit}
          suodatus={suodatus}
          jarjestys={jarjestys}
          kunnat={tulos?.kunnat ?? []}
          toimijat={tulos?.toimijat ?? []}
          kentat={tulos?.kentat ?? []}
          palvelinAvain={supabasePalvelinAvainAsetettu()}
        />
      )}

      {suodatetut.length !== kaikkiRivit.length && kaikkiRivit.length > 0 ? (
        <p className="sr-only" aria-live="polite">
          Näytetään {suodatetut.length} riviä {kaikkiRivit.length}:sta
        </p>
      ) : null}
    </main>
  );
}
