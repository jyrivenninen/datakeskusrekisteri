import type { SupabaseClient } from "@supabase/supabase-js";

const OLETUS_VANHENTUNUT_TUNTEINA = 2;

/** Sulje vanhentuneet «käynnissä»-ajot (esim. GHA-aikakatkaisu ilman catch-lohkoa). */
export async function suljeVanhentuneetKaynnissa(
  supabase: SupabaseClient,
  sovitin: string,
  vanhentunutTunteina = OLETUS_VANHENTUNUT_TUNTEINA,
): Promise<number> {
  const raja = new Date(Date.now() - vanhentunutTunteina * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("lahdeajot")
    .update({
      tila: "epaonnistui",
      paattyi_pvm: new Date().toISOString(),
      virhe: "Ajo keskeytyi (aikakatkaisu tai prosessi katkesi ennen valmistumista).",
    })
    .eq("sovitin", sovitin)
    .eq("tila", "kaynnissa")
    .lt("alkoi_pvm", raja)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Merkitse yksittäinen ajo epäonnistuneeksi prosessin keskeytyessä. */
export async function merkitseLahdeajoKeskeytynyt(
  supabase: SupabaseClient,
  ajoId: string,
  osumia: number,
  httpTila: number | null,
  signaali: string,
): Promise<void> {
  await supabase
    .from("lahdeajot")
    .update({
      tila: "epaonnistui",
      paattyi_pvm: new Date().toISOString(),
      http_tila: httpTila,
      osumia,
      virhe: `Ajo keskeytyi (${signaali}).`,
    })
    .eq("id", ajoId)
    .eq("tila", "kaynnissa");
}

type KeskeytysTila = {
  ajoId: string | null;
  osumia: () => number;
  httpTila: () => number | null;
};

/** SIGTERM/SIGINT → päivitä lahdeajot ennen prosessin loppua. */
export function rekisteroiLahdeajoKeskeytys(
  supabase: SupabaseClient,
  tila: KeskeytysTila,
): () => void {
  let suljettu = false;
  const sulje = async (signaali: string) => {
    if (suljettu || !tila.ajoId) return;
    suljettu = true;
    try {
      await merkitseLahdeajoKeskeytynyt(
        supabase,
        tila.ajoId,
        tila.osumia(),
        tila.httpTila(),
        signaali,
      );
    } catch {
      /* ei estetä prosessin loppua */
    }
  };

  const termHandler = () => {
    void sulje("SIGTERM").finally(() => process.exit(143));
  };
  const intHandler = () => {
    void sulje("SIGINT").finally(() => process.exit(130));
  };

  process.on("SIGTERM", termHandler);
  process.on("SIGINT", intHandler);

  return () => {
    process.off("SIGTERM", termHandler);
    process.off("SIGINT", intHandler);
  };
}
