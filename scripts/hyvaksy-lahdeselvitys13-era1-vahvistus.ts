/**
 * Hyväksyy LS13 erä 1:n sama-arvoiset lähdevahvistukset (TUN_SAMA).
 * Poikkeamat ja määräajat jätetään ihmisen yksittäiskäsittelyyn.
 *
 * Aja: npx tsx scripts/hyvaksy-lahdeselvitys13-era1-vahvistus.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const TUN_SAMA = "lahdeselvitys13_era1_vahvistus";

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus, hanke_id")
    .eq("ehdottaja_tunniste", TUN_SAMA)
    .eq("tila", "odottaa")
    .eq("tyyppi", "taydennys")
    .order("luotu_pvm");
  if (error) throw new Error(error.message);

  console.log(`Vahvistuksia jonossa: ${(data ?? []).length}`);
  let ok = 0;
  let virhe = 0;
  for (const rivi of data ?? []) {
    if (kuiva) {
      console.log("[kuiva]", rivi.huomautus);
      continue;
    }
    try {
      await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA);
      ok += 1;
      console.log("ok", rivi.huomautus);
    } catch (e) {
      virhe += 1;
      console.error("virhe", rivi.id, rivi.huomautus, e);
    }
  }
  console.log({ ok, virhe, kuiva });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
