/**
 * Raportoi uudelleentarkistus vain hylätyille (estetty) linkki_rikki-URL:ille.
 * Aja: npx tsx scripts/grok-linkki-raportoi-hylatyt-urlit.ts
 */
import { createClient } from "@supabase/supabase-js";
import { luokitteleLinkkiTarkistus, tarkistaOsoite } from "../agents/tarkistukset/linkit";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await sb
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "linkki_rikki")
    .eq("tila", "hylatty")
    .eq("kasittelija", "scripts/grok-linkki-uudelleenarvioi-estetyt");
  const urlit = [...new Set((data ?? []).map((r) => r.lahde_url).filter(Boolean))] as string[];
  const tulokset = { toimii: 0, estetty: 0, kuollut: 0 };
  for (const u of urlit) {
    await new Promise((r) => setTimeout(r, 800));
    const t = await tarkistaOsoite(u);
    const luokka = luokitteleLinkkiTarkistus(t);
    tulokset[luokka] += 1;
    console.log(`${luokka} ${t.http_tila ?? "—"} ${u}`);
  }
  console.log(JSON.stringify({ urlit: urlit.length, luokittelu: tulokset }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
