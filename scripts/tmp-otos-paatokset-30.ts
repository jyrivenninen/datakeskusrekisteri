/**
 * Poimii 30 satunnaista paatokset.*-riviä (viranomais, ei ihmisen).
 * Ei kirjoita mitään. Aja: npx tsx scripts/tmp-otos-paatokset-30.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  haeViranomaisVahvistusRivit,
  satunnainenOtos,
} from "../src/lib/viranomais-vahvistus-lapikaynti";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const kaikki = await haeViranomaisVahvistusRivit(sb, "paatokset");
  const otos = satunnainenOtos(kaikki, 30, 20261012);
  console.log(
    JSON.stringify(
      {
        kaikki_lkm: kaikki.length,
        otos_lkm: otos.length,
        siemen: 20261012,
        rivit: otos.map((r, i) => ({
          n: i + 1,
          avain: r.avain,
          hanke: r.hanke_nimi,
          kentta: r.kentta,
          arvo: r.arvo,
          lainaus: r.lahteet[0]?.lainaus ?? null,
          sivu: r.lahteet[0]?.lahde_sivu ?? null,
          url: r.lahteet[0]?.lahde_url ?? null,
        })),
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
