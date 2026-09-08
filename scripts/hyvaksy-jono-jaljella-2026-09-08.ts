/**
 * Jatkaa grok-taydennys-2026-09-08 -jonon käsittelyä: ristiriidat, generaattorit_lkm.
 * Aja: npx tsx scripts/hyvaksy-jono-jaljella-2026-09-08.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "Jyri Venninen";

const RISTIRIITA_PERUSTELU: Record<string, string> = {
  teho_suhde:
    "Generaattorikentät ja teho_mw ovat eri mittakaavoissa YVA-dokumenteissa; havainto kuitattu.",
  maaraaika_mennyt:
    "Uudempi määräaika on rekisterissä; vanhentunut havainto ei vaadi toimenpiteitä.",
  lahekkaiset_hankkeet:
    "Lähekkäiset erilliset hankkeet samalla alueella; havainto kuitattu.",
};

const GENERAATTORIT_LKM = [
  "72ce95be-2c0d-4ff3-bc50-ae07180583b6",
  "b1033a7d-3bb9-46f5-91be-dc036b6a184e",
  "5535203f-583b-4c80-9a07-8f7c93d4772e",
];

async function korjaaLahdeLaji(
  sb: SupabaseClient,
  id: string,
  sisalto: EhdotusSisalto,
): Promise<void> {
  const kentat = { ...sisalto.kentat };
  let muuttui = false;
  for (const [avain, tieto] of Object.entries(kentat)) {
    if ((tieto.lahde_laji as string | undefined) === "pdf") {
      kentat[avain] = { ...tieto, lahde_laji: "dokumentti" };
      muuttui = true;
    }
  }
  if (!muuttui) return;
  const { error } = await sb
    .from("muutosehdotukset")
    .update({ sisalto: { ...sisalto, kentat } })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  let hyvaksytty = 0;
  let virheet = 0;

  const { data: ristiriidat } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus, sisalto, hanke_id")
    .eq("tyyppi", "ristiriita_havainto")
    .eq("tila", "odottaa");

  const hankeIdt = [...new Set((ristiriidat ?? []).map((e) => e.hanke_id).filter(Boolean))];
  const { data: hankkeet } = hankeIdt.length
    ? await sb.from("hankkeet").select("id, nimi").in("id", hankeIdt)
    : { data: [] };
  const nimet = new Map((hankkeet ?? []).map((h) => [h.id, h.nimi]));

  console.log(`=== RISTIRIITA_HAVAINTO (${(ristiriidat ?? []).length}) ===`);
  for (const e of ristiriidat ?? []) {
    const saanto = (e.sisalto as EhdotusSisalto).ristiriita?.saanto ?? "";
    const perustelu = RISTIRIITA_PERUSTELU[saanto];
    const nimi = e.hanke_id ? (nimet.get(e.hanke_id) ?? e.hanke_id) : "?";
    if (!perustelu) {
      virheet += 1;
      console.log(`✗ ${nimi}: tuntematon saanto ${saanto}`);
      continue;
    }
    try {
      await hyvaksyMuutosehdotus(e.id, KASITTELIJA, { perustelu });
      hyvaksytty += 1;
      console.log(`✓ ${nimi} (${saanto})`);
    } catch (virhe) {
      virheet += 1;
      console.log(`✗ ${nimi}: ${virhe instanceof Error ? virhe.message : virhe}`);
    }
  }

  console.log(`\n=== GENERAATTORIT_LKM (${GENERAATTORIT_LKM.length}) ===`);
  for (const id of GENERAATTORIT_LKM) {
    const { data: e } = await sb
      .from("muutosehdotukset")
      .select("id, hanke_id, sisalto")
      .eq("id", id)
      .eq("tila", "odottaa")
      .maybeSingle();
    if (!e) continue;
    const nimi = e.hanke_id ? (nimet.get(e.hanke_id) ?? e.hanke_id) : "?";
    try {
      await korjaaLahdeLaji(sb, id, e.sisalto as EhdotusSisalto);
      await hyvaksyMuutosehdotus(id, KASITTELIJA);
      hyvaksytty += 1;
      console.log(`✓ ${nimi}`);
    } catch (virhe) {
      virheet += 1;
      console.log(`✗ ${nimi}: ${virhe instanceof Error ? virhe.message : virhe}`);
    }
  }

  const { count } = await sb
    .from("muutosehdotukset")
    .select("*", { count: "exact", head: true })
    .eq("tila", "odottaa");

  console.log(`\n=== YHTEENVETO ===`);
  console.log(`Hyväksytty: ${hyvaksytty}, virheitä: ${virheet}`);
  console.log(`Odottaa vielä: ${count ?? "?"}`);
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
