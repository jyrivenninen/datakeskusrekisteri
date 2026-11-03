/**
 * Raportoi linkki_rikki-havainnot, jotka ovat tosiasiassa bot-estoja (403 jne.).
 * Aja: npx tsx scripts/grok-linkki-estetyt-raportti.ts
 */
import { createClient } from "@supabase/supabase-js";
import { LINKKI_ESTETTY_TILAT, luokitteleLinkkiTarkistus } from "../agents/tarkistukset/linkit";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, tila, lahde_url, sisalto, kasitelty_pvm")
    .eq("tyyppi", "linkki_rikki");
  if (error) throw new Error(error.message);

  const rivit = data ?? [];
  let estetty = 0;
  let kuollut = 0;
  let muu = 0;
  const esimerkit: string[] = [];

  for (const r of rivit) {
    const linkki = (r.sisalto as { linkki?: { http_tila: number | null; virhe: string | null } })
      ?.linkki;
    const luokka = luokitteleLinkkiTarkistus({
      http_tila: linkki?.http_tila ?? null,
      virhe: linkki?.virhe ?? null,
    });
    if (luokka === "estetty") {
      estetty += 1;
      if (esimerkit.length < 8) esimerkit.push(`${linkki?.http_tila ?? "?"} ${r.lahde_url}`);
    } else if (luokka === "kuollut") kuollut += 1;
    else muu += 1;
  }

  console.log(
    JSON.stringify(
      {
        yhteensa: rivit.length,
        luokittelu: { estetty, kuollut, muu },
        estetty_koodit: [...LINKKI_ESTETTY_TILAT],
        esimerkki_estetty: esimerkit,
        huomio:
          "Uusi linkkitarkistus ei lisää estettyjä jonoon. Vanhat hyväksytyt estetty-rivit ovat historiallisia.",
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
