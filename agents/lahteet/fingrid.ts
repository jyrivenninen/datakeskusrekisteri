/**
 * 7A.5.4 Fingrid avoin data — lahdeajojen kirjaus. Ei kielimallia.
 *
 * Hakee tuotantosarjat (192/188/245/191) ja kirjaa onnistuneen haun lahdeajot-tauluun.
 * Karttakerros käyttää src/lib/fingrid.ts:ää erikseen.
 *
 * Ympäristö: FINGRID_API_AVAIN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: FINGRID_KUIVA=1
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { haeFingridTuotantoNyt } from "../../src/lib/fingrid";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const SOVITIN = "fingrid-tuotanto";
const KYSely_URL = "https://data.fingrid.fi/api/datasets/192/data/latest";

type TietokantaAsiakas = SupabaseClient;

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  if (!process.env.FINGRID_API_AVAIN?.trim()) {
    throw new Error("FINGRID_API_AVAIN puuttuu. Rekisteröidy data.fingrid.fi/instructions.");
  }

  const kuiva = process.env.FINGRID_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: KYSely_URL,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  try {
    const tulos = await haeFingridTuotantoNyt();
    if (!tulos) {
      throw new Error("Fingrid-haku palautti tyhjän (API-avain tai kokonaistuotanto).");
    }

    const osumia = tulos.rivit.length;
    console.log(
      `Fingrid: kokonaistuotanto ${tulos.kokonaistuotanto_mw?.toFixed(0)} MW, ${osumia} sarjaa, ${tulos.paivitetty_pvm}.`,
    );

    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: 200,
          osumia,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Fingrid-ajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          virhe: viesti.slice(0, 500),
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
