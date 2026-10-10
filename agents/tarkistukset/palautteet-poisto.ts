/**
 * Poistaa yli 12 kk vanhat lomakeviestit (palautteet). Ei kielimallia.
 * Ajo kirjataan lahdeajot-tauluun.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: PALAUTTEET_SAILYTYKSKK (oletus 12), PALAUTTEET_POISTO_KUIVA=1
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const EHDOTTAJA = "agents/tarkistukset/palautteet-poisto";
const SOVITIN = "palautteet_poisto";

function kuukautta(): number {
  const n = Number(process.env.PALAUTTEET_SAILYTYKSKK ?? "12");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
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
  const kuiva = process.env.PALAUTTEET_POISTO_KUIVA === "1";
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
    const raja = new Date();
    raja.setMonth(raja.getMonth() - kynnys);

    let poistettu: number;
    if (kuiva) {
      const { count, error: laskuVirhe } = await supabase
        .from("palautteet")
        .select("id", { count: "exact", head: true })
        .lt("luotu_pvm", raja.toISOString());
      if (laskuVirhe) throw new Error(laskuVirhe.message);
      poistettu = count ?? 0;
      console.log(`kuiva: poistettaisiin ${poistettu} riviä (>${kynnys} kk)`);
    } else {
      const { data, error } = await supabase.rpc("poista_vanhat_palautteet", {
        p_kuukautta: kynnys,
      });
      if (error) throw new Error(error.message);
      poistettu = typeof data === "number" ? data : Number(data ?? 0);
    }

    if (ajoId) {
      const { error: paivitysVirhe } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          osumia: poistettu,
        })
        .eq("id", ajoId);
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    }

    console.log(
      `${EHDOTTAJA}: poistettu ${poistettu} palautetta (>${kynnys} kk)${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Palautteiden poisto epäonnistui.";
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
