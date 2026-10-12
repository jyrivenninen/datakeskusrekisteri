/**
 * Tehoerittely erä 2: erittelemättömät → jono.
 * Silmäily: ei IT-/kokonais-avainsanaa; parempaa lähdettä ei löytynyt
 * nykyisistä voimassa olevista lainauksista.
 *
 * Aja: npx tsx scripts/teho-erittely-era2-erittelemattomat-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const KASITTELIJA = "ylläpito";

function sanooIT(t: string | null): boolean {
  if (!t) return false;
  return (
    /\bit[\s-]?kapasiteetti\b/i.test(t) ||
    /\bit[\s-]?teho\b/i.test(t) ||
    /\bIT[\s-]?capacity\b/i.test(t) ||
    /\bIT[\s-]?power\b/i.test(t) ||
    /\bIT[\s-]?load\b/i.test(t) ||
    /\bIT-kapacitet/i.test(t) ||
    /(^|[^\w])IT([^\w]|$)/.test(t)
  );
}

function sanooKokonais(t: string | null): boolean {
  if (!t) return false;
  return (
    /\bkokonais(teho|uus|kapasiteetti)\b/i.test(t) ||
    /\bkokonaisuutta\b/i.test(t) ||
    /\bTotal power\b/i.test(t) ||
    /\boverall (campus )?capacity\b/i.test(t)
  );
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: hankkeet } = await sb
    .from("hankkeet")
    .select("id, nimi, teho_mw, it_teho_mw")
    .eq("julkaistu", true)
    .not("teho_mw", "is", null)
    .not("it_teho_mw", "is", null);
  const sama = (hankkeet ?? []).filter(
    (h) => Number(h.teho_mw) === Number(h.it_teho_mw),
  );
  console.log("Jäljellä teho_mw=it_teho_mw:", sama.length);

  let lahteet: Array<{
    rivi_id: string;
    kentta: string;
    lahde_url: string;
    lainaus: string | null;
  }> = [];
  for (let a = 0; ; a += 1000) {
    const { data } = await sb
      .from("kentta_lahteet")
      .select("rivi_id, kentta, lahde_url, lainaus")
      .eq("taulu", "hankkeet")
      .in("kentta", ["teho_mw", "it_teho_mw"])
      .eq("tila", "voimassa")
      .in(
        "rivi_id",
        sama.map((h) => h.id),
      )
      .range(a, a + 999);
    if (!data?.length) break;
    lahteet = lahteet.concat(data);
    if (data.length < 1000) break;
  }

  let jonoon = 0;
  let ohitettu = 0;
  let odottaaJo = 0;

  for (const h of sama.sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"))) {
    const ls = lahteet.filter((l) => l.rivi_id === h.id);
    const tekstit = ls.map((l) => l.lainaus ?? "").join("\n");
    const it = sanooIT(tekstit);
    const kok = sanooKokonais(tekstit);
    if (it || kok) {
      console.log(
        "  VAROITUS vielä avainsana — ohita jonoon:",
        h.nimi,
        it ? "IT" : "",
        kok ? "KOK" : "",
      );
      ohitettu += 1;
      continue;
    }

    const { data: olemassa } = await sb
      .from("muutosehdotukset")
      .select("id, tila")
      .eq("hanke_id", h.id)
      .eq("tila", "odottaa")
      .filter("sisalto->>huomio", "eq", "erittelemattoman tehon kenttavalinta")
      .maybeSingle();
    if (olemassa) {
      console.log("  jo jonossa:", h.nimi);
      odottaaJo += 1;
      continue;
    }

    const paalahde =
      ls.find((l) => l.kentta === "teho_mw")?.lahde_url ??
      ls[0]?.lahde_url ??
      null;

    const { error } = await sb.from("muutosehdotukset").insert({
      tyyppi: "korjaus",
      hanke_id: h.id,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: paalahde,
      huomautus: `Erittelemätön teho ${Number(h.teho_mw)} MW: sama luku molemmissa kentissä, lainaukset eivät sano IT- eivätkä kokonaistehoa. Etsi parempi lähde tai valitse kenttä / tyhjennä toinen.`,
      sisalto: {
        kentat: {},
        huomio: "erittelemattoman tehon kenttavalinta",
        teho_mw: Number(h.teho_mw),
        it_teho_mw: Number(h.it_teho_mw),
      },
    });
    if (error) throw new Error(`${h.nimi}: ${error.message}`);
    console.log("  → jono:", h.nimi, Number(h.teho_mw), "MW");
    jonoon += 1;
  }

  console.log(
    JSON.stringify({ jonoon, odottaa_jo: odottaaJo, ohitettu_avainsana: ohitettu }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
