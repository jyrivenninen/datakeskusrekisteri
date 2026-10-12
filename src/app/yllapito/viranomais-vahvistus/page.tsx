import Link from "next/link";
import { redirect } from "next/navigation";
import { ViranomaisVahvistusLista } from "@/komponentit/viranomais-vahvistus-lista";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import {
  luoYllapitoAsiakas,
  supabasePalvelinAvainAsetettu,
} from "@/lib/supabase/yllapito-asiakas";
import {
  haeViranomaisVahvistusRivit,
  satunnainenOtos,
  type ViranomaisVahvistusRyhma,
} from "@/lib/viranomais-vahvistus-lapikaynti";

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
}

const RYHMAT: { id: ViranomaisVahvistusRyhma; nimi: string }[] = [
  { id: "maaraajat", nimi: "Määräajat" },
  { id: "hankkeet", nimi: "Hankekentät" },
  { id: "paatokset", nimi: "Päätökset (otos)" },
];

export default async function ViranomaisVahvistusSivu({
  searchParams,
}: {
  searchParams: Promise<{ ryhma?: string; otos?: string }>;
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
        <h1 className="mt-4 text-3xl font-semibold">
          Viranomaislähde, ei ihmisen tarkistusta
        </h1>
        <p className="mt-4">Palvelinavain puuttuu — jonoa ei voi ladata.</p>
      </main>
    );
  }

  const ryhma: ViranomaisVahvistusRyhma =
    params.ryhma === "hankkeet" || params.ryhma === "paatokset"
      ? params.ryhma
      : "maaraajat";

  const yllapito = luoYllapitoAsiakas();
  let rivit = await haeViranomaisVahvistusRivit(yllapito, ryhma);
  const kaikkiLkm = rivit.length;
  let vainLuku = false;

  if (ryhma === "paatokset") {
    vainLuku = true;
    rivit = satunnainenOtos(rivit, 30, 20261012);
  }
  const nayttoLkm = rivit.length;

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <p className="text-sm">
        <Link href="/yllapito" className="text-link underline">
          Ylläpito
        </Link>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">
        Viranomaislähde, ei ihmisen tarkistusta
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Sitovuudeltaan merkitykselliset kentät, joilla on vähintään yksi
        viranomaislähde (päätös, viranomaisasiakirja tai rekisteri), mutta ei
        yhtään ihmisen vahvistamaa viranomaislähdettä. Tarkista, tukeeko
        lainaus kentän arvoa.
      </p>

      <ul className="mt-4 flex flex-wrap gap-3 text-sm">
        {RYHMAT.map((r) => (
          <li key={r.id}>
            <Link
              href={`/yllapito/viranomais-vahvistus?ryhma=${r.id}`}
              className={
                ryhma === r.id
                  ? "font-medium text-foreground"
                  : "text-link underline"
              }
            >
              {r.nimi}
              {ryhma === r.id
                ? r.id === "paatokset"
                  ? ` (${nayttoLkm}/${kaikkiLkm})`
                  : ` (${nayttoLkm})`
                : ""}
            </Link>
          </li>
        ))}
      </ul>

      {ryhma === "paatokset" ? (
        <p className="mt-3 text-sm text-muted">
          Päätöksiä ei merkitä tässä näkymässä. Otos 30 / {kaikkiLkm} (siemen
          20261012). Kirjaa arvio ja raportoi virheosuus ennen kirjoitusta.
        </p>
      ) : null}

      <ViranomaisVahvistusLista
        rivit={rivit}
        ryhma={ryhma}
        vainLuku={vainLuku}
      />
    </main>
  );
}
