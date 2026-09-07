/**
 * Kartoittaa puuttuvat kuntalähteet (RSS + avoindata.fi) ja kirjoittaa DB:hen.
 * KUNTA_KARTOITUS_KIRJOITA=1, KUNTA_KARTOITUS_KUIVA=1
 */
import { createClient } from "@supabase/supabase-js";
import { kartoitaPuuttuvatLahteet } from "../agents/lahteet/kunnat/kartoitus";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  await kartoitaPuuttuvatLahteet(sb, {
    kirjoita: process.env.KUNTA_KARTOITUS_KIRJOITA === "1",
    kuiva: process.env.KUNTA_KARTOITUS_KUIVA === "1",
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
