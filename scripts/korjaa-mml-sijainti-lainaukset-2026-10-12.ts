/**
 * Toholampi: lainaus = MML-haku Kiertokangas, Toholampi (ei Hongistonneva).
 * Petäjävesi: poista käänteishaku lainauksesta.
 *
 * Aja: npx tsx scripts/korjaa-mml-sijainti-lainaukset-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Toholampi MML-rivi
  const tohId = "4c3f8493-c1a4-48c0-bbe4-d5f43c24acd8";
  const tohUrl =
    "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search?text=Kiertokangas%2C+Toholampi&lang=fi&size=1";
  const tohLainaus =
    "MML-haku Kiertokangas, Toholampi: 63.729046 N, 24.130930 E.";
  const { error: t1 } = await sb.rpc("paivita_kentta_lahde_sisalto", {
    p_lahde_id: tohId,
    p_uusi_url: tohUrl,
    p_lainaus: tohLainaus,
    p_tarkistettu: true,
  });
  if (t1) console.log("Toholampi:", t1.message);
  else console.log("✓ Toholampi lainaus/URL");

  // Petäjävesi MML-rivi (Karhukorpi, Petäjävesi)
  const petId = "3e5d9d88-d8bf-4a4b-b573-06ac326e988d";
  const petLainaus =
    "MML-haku Karhukorpi, Petäjävesi: Karhukorpi (62.288034 N, 25.157793 E).";
  const { error: t2 } = await sb.rpc("paivita_kentta_lahde_sisalto", {
    p_lahde_id: petId,
    p_lainaus: petLainaus,
    p_tarkistettu: true,
  });
  if (t2) console.log("Petäjävesi:", t2.message);
  else console.log("✓ Petäjävesi lainaus");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
