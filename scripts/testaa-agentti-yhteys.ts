/**
 * Varmistaa agentti-yhteyden (anon apikey + agentti-JWT Authorization).
 * Älä liitä avaimia chattiin.
 */
import { luoAgenttiAsiakas } from "../agents/agentti-asiakas";

async function main() {
  const supabase = luoAgenttiAsiakas();

  const { data, error } = await supabase
    .from("hankkeet")
    .select("id, nimi")
    .eq("julkaistu", true)
    .limit(3);

  if (error) {
    throw new Error(`Agentti-luku epäonnistui: ${error.message}`);
  }

  console.log(`Agentti-yhteys ok. Julkaistuja hankkeita (max 3): ${data?.length ?? 0}`);
  for (const h of data ?? []) {
    console.log(`  - ${h.nimi} (${h.id})`);
  }
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
