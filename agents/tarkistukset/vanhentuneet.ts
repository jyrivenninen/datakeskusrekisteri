/**
 * 7A.4 Vanhentumisvahti. Ei kielimallia.
 * Listaa kentät, joiden vahvistettu_pvm on yli kynnyksen vanha.
 * Tulos näkyy ylläpidossa; ajo kirjataan lahdeajot-tauluun.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: VANHENTUNUT_KUUKAUTTA (oletus 6), VANHENTUNUT_KUIVA=1
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const EHDOTTAJA = "agents/tarkistukset/vanhentuneet";
const SOVITIN = "vanhentuneet";

type VanhentunutRivi = {
  laji: string;
  hanke_id: string;
  hanke_nimi: string;
  kentta: string;
  vahvistettu_pvm: string;
};

function kuukautta(): number {
  const n = Number(process.env.VANHENTUNUT_KUUKAUTTA ?? "6");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  const kuiva = process.env.VANHENTUNUT_KUIVA === "1";
  const kynnys = kuukautta();
  const supabase = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({ sovitin: SOVITIN, tila: "kaynnissa" })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  try {
    const { data, error } = await supabase.rpc("vanhentuneet_kentat", {
      p_kuukautta: kynnys,
    });
    if (error) throw new Error(error.message);
    const rivit = (data ?? []) as VanhentunutRivi[];
    const lahteet = rivit.filter((r) => r.laji === "lahde").length;
    const tarkistukset = rivit.filter((r) => r.laji === "tarkistus").length;

    if (kuiva) {
      for (const rivi of rivit.slice(0, 20)) {
        console.log(
          `kuiva: ${rivi.laji} ${rivi.hanke_nimi} · ${rivi.kentta} · ${rivi.vahvistettu_pvm}`,
        );
      }
      if (rivit.length > 20) console.log(`kuiva: … ja ${rivit.length - 20} muuta`);
    }

    if (ajoId) {
      const { error: paivitysVirhe } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          osumia: rivit.length,
        })
        .eq("id", ajoId);
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    }

    console.log(
      `${EHDOTTAJA}: ${rivit.length} vanhentunutta kenttää (>${kynnys} kk). Lähteitä ${lahteet}, tarkistuksia ${tarkistukset}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Vanhentumisajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          virhe: viesti,
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
