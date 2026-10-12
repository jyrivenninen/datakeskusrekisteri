/**
 * Koneellinen tarkistus kaikille LS13-eräkuittauksille. Ei kirjoita.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  haeLs13EraKuittaukset,
  ls13EraKoneYhteenveto,
} from "../src/lib/ls13-era-lapikaynti";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const rivit = await haeLs13EraKuittaukset(sb, { vainEraTaiTyhja: false });
  const yht = ls13EraKoneYhteenveto(rivit);
  console.log(
    JSON.stringify(
      {
        yhteenveto: {
          yhteensa: yht.yhteensa,
          koneelliset: yht.koneelliset,
          ok: yht.ok,
          ei_tue: yht.ei_tue,
          vaihe_ihminen: yht.vaihe_ihminen,
        },
        ei_tue: yht.ei_tue_rivit.map((r) => ({
          hanke: r.hanke_nimi,
          kentta: r.kentta,
          arvo: r.arvo,
          lainaus: r.lainaus,
          sivu: r.lahde_sivu,
          url: r.lahde_url,
          syy:
            r.kone_tarkistus.tulos === "ei_tue"
              ? r.kone_tarkistus.syy
              : null,
        })),
        kaikki: rivit.map((r) => ({
          hanke: r.hanke_nimi,
          kentta: r.kentta,
          arvo: r.arvo,
          lainaus: r.lainaus,
          sivu: r.lahde_sivu,
          url: r.lahde_url,
          kone: r.kone_tarkistus.tulos,
          syy:
            r.kone_tarkistus.tulos === "ei_tue"
              ? r.kone_tarkistus.syy
              : r.kone_tarkistus.tulos === "ohita"
                ? r.kone_tarkistus.syy
                : null,
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
