/**
 * Apuskripti: domainit joilla ei ehdotusta mutta lehtimäinen host.
 * Aja: npx tsx scripts/poimi-lehtidomainit.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { ehdotaLahdeTyyppiUrlille, puraDomain } from "../src/lib/lahde-tyyppi-domain";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const urlt = new Set<string>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb.from("kentta_lahteet").select("lahde_url").range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) if (r.lahde_url) urlt.add(r.lahde_url);
    if (data.length < 1000) break;
  }

  const domainMaara = new Map<string, number>();
  for (const u of urlt) {
    if (ehdotaLahdeTyyppiUrlille(u) !== null) continue;
    const d = puraDomain(u);
    if (!d) continue;
    domainMaara.set(d, (domainMaara.get(d) ?? 0) + 1);
  }

  const lehtiMalli =
    /sanomat|uutiset|lehti|posti|viikko|kuukausi|media|times|press|journal|gazette|herald/i;

  const ehdokkaat = [...domainMaara.entries()]
    .filter(([d]) => lehtiMalli.test(d))
    .sort((a, b) => b[1] - a[1]);

  console.log(JSON.stringify(ehdokkaat.slice(0, 40), null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
