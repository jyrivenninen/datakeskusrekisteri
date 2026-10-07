/**
 * Poistaa muut kuin Pekka Väisäsen kuvat ja korjaa datakeskus.org-lähteet.
 * Vaatii migraation 20261007120000_kuvat_vain_pekka_vaisanen.sql.
 * Aja: npx tsx scripts/sovi-kuvat-pekka-vaisanen.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await sb.rpc("yllapito_sovi_kuvat_pekka_vaisanen");
  if (error) throw error;

  const { count } = await sb
    .from("hanke_kuvat")
    .select("id", { count: "exact", head: true });
  console.log(`Valmis. Julkaistuja kuvia kannassa: ${count ?? "?"}`);
}

main().catch((syy) => {
  console.error(syy);
  process.exit(1);
});
