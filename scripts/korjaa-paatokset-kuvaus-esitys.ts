/**
 * Korjaa paatokset.kuvaus joissa verbi on «hyväksyi» mutta lainaus on esitys.
 * Käyttää muotoilePaatosKuvaus. Aja: npx tsx scripts/korjaa-paatokset-kuvaus-esitys.ts [--kuiva]
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
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const rivit = (await haeViranomaisVahvistusRivit(sb, "paatokset")).filter(
    (r) => r.kentta === "kuvaus",
  );
  const korjattavat = [];
  for (const r of rivit) {
    const lainaus = r.lahteet[0]?.lainaus ?? null;
    if (!paatosKuvausRistiriita(r.arvo ?? "", lainaus)) continue;
    const uusi = muotoilePaatosKuvaus(r.arvo ?? "", lainaus);
    if (uusi === (r.arvo ?? "").trim()) continue;
    korjattavat.push({
      paatos_id: r.rivi_id,
      hanke: r.hanke_nimi,
      vanha: r.arvo,
      uusi,
      luokka: luokittelePaatosLainaus(lainaus),
      lainaus,
      url: r.lahteet[0]?.lahde_url,
    });
  }

  console.log(
    JSON.stringify(
      {
        kuvaus_riveja: rivit.length,
        ristiriita_hyvaksyi_vs_esitys: korjattavat.length,
        kuiva,
        rivit: korjattavat,
      },
      null,
      2,
    ),
  );

  if (kuiva || korjattavat.length === 0) return;

  let ok = 0;
  for (const k of korjattavat) {
    const { error } = await sb.rpc("paivita_paatos_kuvaus", {
      p_paatos_id: k.paatos_id,
      p_kuvaus: k.uusi,
    });
    if (error) {
      // Fallback: suora update voi epäonnistua RLS:ään — kokeile RPC:tä tai kirjaa
      const { error: e2 } = await sb
        .from("paatokset")
        .update({ kuvaus: k.uusi })
        .eq("id", k.paatos_id);
      if (e2) {
        console.error("virhe", k.paatos_id, error.message, e2.message);
        continue;
      }
    }
    ok += 1;
    console.log("ok", k.hanke, k.vanha, "→", k.uusi);
  }
  console.log({ paivitetty: ok });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
