/**
 * Lahde-tyypin domain-ehdotusten jakauma (ei kirjoita jonoon).
 * Aja: npx tsx scripts/lahde-tyyppi-jakauma.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { LAHDE_TYYPIT, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import { ehdotaLahdeTyyppiUrlille, puraDomain } from "../src/lib/lahde-tyyppi-domain";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const urlMaara = new Map<string, number>();
  const sivuKoko = 1000;
  for (let alku = 0; ; alku += sivuKoko) {
    const { data: kaytot, error } = await sb
      .from("kentta_lahteet")
      .select("lahde_url")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!kaytot?.length) break;
    for (const rivi of kaytot) {
      if (!rivi.lahde_url) continue;
      urlMaara.set(rivi.lahde_url, (urlMaara.get(rivi.lahde_url) ?? 0) + 1);
    }
    if (kaytot.length < sivuKoko) break;
  }

  const uniikit = [...urlMaara.keys()];
  const tyyppiLaskuri = new Map<LahdeTyyppi | "ei_ehdotusta", number>();
  for (const t of LAHDE_TYYPIT) tyyppiLaskuri.set(t, 0);
  tyyppiLaskuri.set("ei_ehdotusta", 0);

  const domainLaskuri = new Map<string, number>();

  for (const lahdeUrl of uniikit) {
    const ehdotus = ehdotaLahdeTyyppiUrlille(lahdeUrl);
    if (ehdotus) {
      tyyppiLaskuri.set(ehdotus, (tyyppiLaskuri.get(ehdotus) ?? 0) + 1);
    } else {
      tyyppiLaskuri.set("ei_ehdotusta", (tyyppiLaskuri.get("ei_ehdotusta") ?? 0) + 1);
    }

    const domain = puraDomain(lahdeUrl);
    if (domain) {
      const kpl = urlMaara.get(lahdeUrl) ?? 0;
      domainLaskuri.set(domain, (domainLaskuri.get(domain) ?? 0) + kpl);
    }
  }

  const topDomainit = [...domainLaskuri.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, esiintymia]) => ({ domain, esiintymia }));

  const jakauma = Object.fromEntries(
    [...tyyppiLaskuri.entries()].sort((a, b) => a[0].localeCompare(b[0], "fi")),
  );

  console.log(
    JSON.stringify(
      {
        url_lkm: uniikit.length,
        jakauma,
        top_10_domainia: topDomainit,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
