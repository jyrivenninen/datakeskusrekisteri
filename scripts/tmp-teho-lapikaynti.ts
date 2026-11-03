import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { rakennaLuvunRistiriitaRivit } from "../src/lib/luvun-ristiriita";
import { luoYllapitoAsiakas } from "../src/lib/supabase/yllapito-asiakas";

async function main() {
  lataaPaikallinenYmparisto();
  const y = luoYllapitoAsiakas();
  const { data: lahteet, error: e1 } = await y
    .from("kentta_lahteet")
    .select("id, taulu, rivi_id, kentta, lahde_url, lainaus, luottamus, merkitty, tila")
    .eq("taulu", "hankkeet")
    .in("kentta", ["teho_mw", "it_teho_mw"])
    .neq("tila", "korvattu");
  if (e1) throw e1;
  const ids = [...new Set((lahteet ?? []).map((l) => l.rivi_id))];
  const { data: hankkeet, error: e2 } = await y
    .from("hankkeet")
    .select(
      "id, nimi, kunta, teho_mw, it_teho_mw, pinta_ala_ha, kaava_ala_ha, sahkonkaytto_twh_a, generaattorit_lkm, generaattorit_kaytossa_max_lkm, generaattori_polttoaineteho_mw, generaattori_yksikkoteho_mwe, diesel_vuosikulutus_maara, varavoima_paastot_t_co2e",
    )
    .in("id", ids)
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null);
  if (e2) throw e2;
  const { data: kas, error: e3 } = await y
    .from("luvun_lapikaynti")
    .select("taulu, rivi_id, kentta");
  if (e3) throw e3;
  const set = new Set((kas ?? []).map((r) => `${r.taulu}:${r.rivi_id}:${r.kentta}`));
  const rivit = rakennaLuvunRistiriitaRivit(lahteet ?? [], hankkeet ?? [], set).filter(
    (r) => r.kentta === "teho_mw" || r.kentta === "it_teho_mw",
  );
  for (const r of rivit) {
    console.log("\n===", r.kentta, "|", r.hanke_nimi, "|", r.hanke_kunta, "| nykyinen=", r.nykyinen_arvo);
    console.log("id=", r.rivi_id);
    for (const l of r.lahteet) {
      console.log(
        " -",
        l.luku_naytto,
        "|",
        (l.lainaus ?? "").slice(0, 280).replace(/\s+/g, " "),
        "|",
        l.lahde_url,
        "| id=",
        l.lahde_id,
      );
    }
  }
  console.log("\nYHTEENSÄ", rivit.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
