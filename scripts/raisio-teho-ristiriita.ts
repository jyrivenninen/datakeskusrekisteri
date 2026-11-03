/**
 * Ecogrid Raisio teho_mw: lisää KH § 439 -lähde ja merkitse ristiriitaiseksi.
 * Arvoa (300 MW) ei muuteta.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { kentanTila } from "../src/lib/naytto";

const HANKE_ID = "0d46296e-596a-477e-a568-ff902b256cf2";
const ECOGRID = "https://ecogrid.energy/";
const RAISIO_439 = "https://julkaisut.raisio.fi/dynasty10/kokous/2025642-14.PDF";
const LAINAUS =
  "Datakeskushankkeen kokoluokaksi on suunnitteluvaraussopimuksen yhteydessä arvioitu 500 – 600 MW.";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-ympäristö puuttuu");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: ennenTeho } = await sb
    .from("hankkeet")
    .select("teho_mw")
    .eq("id", HANKE_ID)
    .single();
  console.log("teho_mw ennen:", ennenTeho?.teho_mw);

  const { error: uusiVirhe } = await sb.rpc("tallenna_kentta_lahde", {
    p_taulu: "hankkeet",
    p_rivi_id: HANKE_ID,
    p_kentta: "teho_mw",
    p_lahde_url: RAISIO_439,
    p_lahde_sivu: 1,
    p_vahvistettu_pvm: "2025-12-15",
    p_luottamus: "ristiriitainen",
    p_lainaus: LAINAUS,
    p_merkitty: "ihmisen_vahvistama",
    p_lahde_laji: "dokumentti",
  });
  if (uusiVirhe) throw new Error(`uusi lähde: ${uusiVirhe.message}`);

  const { error: vanhaVirhe } = await sb.rpc("tallenna_kentta_lahde", {
    p_taulu: "hankkeet",
    p_rivi_id: HANKE_ID,
    p_kentta: "teho_mw",
    p_lahde_url: ECOGRID,
    p_lahde_sivu: null,
    p_vahvistettu_pvm: "2026-09-04",
    p_luottamus: "ristiriitainen",
    p_lainaus: "Power Total 300MW (1GW)",
    p_merkitty: "koneen_ehdottama",
    p_lahde_laji: "html",
  });
  if (vanhaVirhe) throw new Error(`ecogrid luottamus: ${vanhaVirhe.message}`);

  const { data: lahteet, error: lVirhe } = await sb
    .from("kentta_lahteet")
    .select("lahde_url, luottamus, merkitty, tila, lainaus, vahvistettu_pvm")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", HANKE_ID)
    .eq("kentta", "teho_mw")
    .order("vahvistettu_pvm");
  if (lVirhe) throw new Error(lVirhe.message);

  const { data: jalkeenTeho } = await sb
    .from("hankkeet")
    .select("teho_mw")
    .eq("id", HANKE_ID)
    .single();

  const tila = kentanTila(jalkeenTeho?.teho_mw != null, lahteet ?? []);
  console.log("teho_mw jälkeen:", jalkeenTeho?.teho_mw);
  console.log("lähteet:", JSON.stringify(lahteet, null, 2));
  console.log("kentanTila:", tila, "→ liikennevalo:", tila === "vahvistamaton" ? "keltainen" : tila);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
