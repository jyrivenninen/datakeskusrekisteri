/**
 * Hyväksyy odottavat konsulttiroolit (hanke_organisaatio).
 * Aja: npx tsx scripts/hyvaksy-konsulttiroolit.ts
 */
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";
import { luoYllapitoAsiakas } from "../src/lib/supabase/yllapito-asiakas";

const KASITTELIJA = "ylläpito";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = luoYllapitoAsiakas();
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus")
    .eq("tyyppi", "hanke_organisaatio")
    .eq("tila", "odottaa")
    .like("huomautus", "%YVA-selostuksesta:%")
    .order("luotu_pvm");
  if (error) throw new Error(error.message);
  const rivit = data ?? [];
  console.log(`Jonossa ${rivit.length} konsulttiroolia.`);
  for (const rivi of rivit) {
    await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA);
    console.log("ok", rivi.huomautus);
  }
  console.log("Valmis.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
