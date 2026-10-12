/**
 * Käy läpi kaikki paatokset.kuvaus-rivit (viranomais, ei ihmisen).
 * Liputtaa hyväksyi vs esitys -ristiriidat. Ei kirjoita.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  luokittelePaatosLainaus,
  muotoilePaatosKuvaus,
  paatosKuvausRistiriita,
} from "../src/lib/paatos-kuvaus";
import { haeViranomaisVahvistusRivit } from "../src/lib/viranomais-vahvistus-lapikaynti";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const rivit = (await haeViranomaisVahvistusRivit(sb, "paatokset")).filter(
    (r) => r.kentta === "kuvaus",
  );
  const ristiriidat = [];
  for (const r of rivit) {
    const lainaus = r.lahteet[0]?.lainaus ?? null;
    if (paatosKuvausRistiriita(r.arvo ?? "", lainaus)) {
      ristiriidat.push({
        hanke: r.hanke_nimi,
        kuvaus: r.arvo,
        lainaus,
        luokka: luokittelePaatosLainaus(lainaus),
        ehdotus_muotoilu: muotoilePaatosKuvaus(r.arvo ?? "", lainaus),
        url: r.lahteet[0]?.lahde_url,
      });
    }
  }
  console.log(
    JSON.stringify(
      {
        kuvaus_riveja: rivit.length,
        ristiriita_hyvaksyi_vs_esitys: ristiriidat.length,
        rivit: ristiriidat,
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
