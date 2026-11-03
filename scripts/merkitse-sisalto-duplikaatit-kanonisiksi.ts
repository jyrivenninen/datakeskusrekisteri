/**
 * Merkitsee aitojen sisalto_tiiviste-duplikaattiparien kanoniset.
 * Aja: npx tsx scripts/merkitse-sisalto-duplikaatit-kanonisiksi.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: rivit, error } = await sb
    .from("dokumentit")
    .select("id, url, otsikko, sisalto_tiiviste, kanoninen_dokumentti_id, luotu_pvm, hanke_id")
    .not("sisalto_tiiviste", "is", null)
    .order("sisalto_tiiviste")
    .order("luotu_pvm");
  if (error) throw new Error(error.message);

  const ryhmat = new Map<string, typeof rivit>();
  for (const r of rivit ?? []) {
    const t = r.sisalto_tiiviste as string;
    if (!ryhmat.has(t)) ryhmat.set(t, []);
    ryhmat.get(t)!.push(r);
  }

  let parit = 0;
  let merkitty = 0;
  let jo = 0;
  for (const [tiiviste, ryhmä] of ryhmat) {
    if (!ryhmä || ryhmä.length < 2) continue;
    parit += 1;
    // Kanoninen: vanhin rivi (luotu_pvm), tai se jolla ei ole kanoninen-viittausta
    const kanoninen =
      ryhmä.find((r) => !r.kanoninen_dokumentti_id) ?? ryhmä[0]!;
    console.log(`\npari ${tiiviste.slice(0, 12)}… (${ryhmä.length} riviä)`);
    console.log(`  kanoninen: ${kanoninen.otsikko?.slice(0, 70)}`);
    console.log(`  ${kanoninen.url}`);
    for (const r of ryhmä) {
      if (r.id === kanoninen.id) continue;
      if (r.kanoninen_dokumentti_id === kanoninen.id) {
        jo += 1;
        console.log(`  jo merkitty: ${r.url}`);
        continue;
      }
      console.log(`  → alias: ${r.url}`);
      if (!kuiva) {
        const { error: e } = await sb.rpc("aseta_dokumentti_kanoninen", {
          p_dokumentti_id: r.id,
          p_kanoninen_dokumentti_id: kanoninen.id,
        });
        if (e) throw new Error(e.message);
        merkitty += 1;
      }
    }
  }

  // Raahe-karttaliitteet: eivät ole aitoja duplikaatteja (olivat tyhjän tiivisteen uhreja)
  const { data: raahe } = await sb
    .from("dokumentit")
    .select("id, otsikko, url, sisalto_tiiviste, kanoninen_dokumentti_id")
    .ilike("url", "%raahe10.oncloudos.com%")
    .ilike("otsikko", "%rajaus%");
  console.log("\n=== Raahe karttaliitteet ===");
  for (const r of raahe ?? []) {
    console.log(
      `${r.sisalto_tiiviste ? r.sisalto_tiiviste.slice(0, 12) : "NULL"} ` +
        `kan=${r.kanoninen_dokumentti_id ? "kyllä" : "ei"} ${r.otsikko?.slice(0, 50)}`,
    );
  }

  console.log({ parit, merkitty, jo_merkitty: jo, kuiva });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
