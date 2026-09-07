/**
 * Hyväksyy jäljellä olevat: kenttätyhjennys, pienet pinta-alat, linkki_rikki.
 * Hylkää Creanova TEST ONLY -duplikaatin.
 * Aja: npx tsx scripts/hyvaksy-jaljella-2026-09-07.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hylkaaMuutosehdotus,
  hyvaksyMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";
import type { EhdotusSisalto } from "../src/lib/ehdotus";

const KASITTELIJA = "Jyri Venninen";

function onPieniPintaAlaKorjaus(huomautus: string | null, sisalto: EhdotusSisalto): boolean {
  if (!(huomautus ?? "").includes("TEST ONLY")) {
    const kentat = sisalto.kentat ?? {};
    if (kentat.pinta_ala_ha) return true;
  }
  return false;
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, tyyppi, hanke_id, huomautus, sisalto")
    .eq("tila", "odottaa");
  if (error) throw error;

  const hankeIdt = [
    ...new Set((data ?? []).map((e) => e.hanke_id).filter(Boolean)),
  ] as string[];
  const { data: hankkeet } = hankeIdt.length
    ? await sb.from("hankkeet").select("id, nimi").in("id", hankeIdt)
    : { data: [] };
  const hankeKartta = new Map((hankkeet ?? []).map((h) => [h.id, h.nimi]));

  const hyvaksyttavat: { id: string; era: string; nimi: string }[] = [];
  const hylattavat: { id: string; nimi: string; syy: string }[] = [];

  for (const e of data ?? []) {
    const nimi = hankeKartta.get(e.hanke_id!) ?? e.hanke_id ?? "?";
    const sis = e.sisalto as EhdotusSisalto;

    if ((e.huomautus ?? "").includes("TEST ONLY")) {
      hylattavat.push({
        id: e.id,
        nimi,
        syy: "Agentin testi-ehdotus (TEST ONLY).",
      });
      continue;
    }

    if (e.tyyppi === "kentta_tyhjennys") {
      hyvaksyttavat.push({ id: e.id, era: "tyhjennys", nimi });
      continue;
    }

    if (e.tyyppi === "linkki_rikki") {
      hyvaksyttavat.push({ id: e.id, era: "linkki_rikki", nimi });
      continue;
    }

    if (e.tyyppi === "korjaus" && onPieniPintaAlaKorjaus(e.huomautus, sis)) {
      hyvaksyttavat.push({ id: e.id, era: "pinta_ala", nimi });
    }
  }

  console.log(`Hylätään ${hylattavat.length}, hyväksytään ${hyvaksyttavat.length}\n`);

  for (const h of hylattavat) {
    try {
      await hylkaaMuutosehdotus(h.id, KASITTELIJA, h.syy);
      console.log(`⊘ Hylätty: ${h.nimi}`);
    } catch (virhe) {
      const viesti = virhe instanceof Error ? virhe.message : String(virhe);
      console.log(`✗ Hylkäys epäonnistui ${h.nimi}: ${viesti}`);
      process.exitCode = 1;
    }
  }

  const tulokset: { era: string; ok: number; yht: number }[] = [];
  for (const era of ["tyhjennys", "pinta_ala", "linkki_rikki"]) {
    const osa = hyvaksyttavat.filter((h) => h.era === era);
    if (osa.length === 0) continue;
    console.log(`\n=== ${era.toUpperCase()} (${osa.length} kpl) ===`);
    let ok = 0;
    for (const h of osa) {
      try {
        await hyvaksyMuutosehdotus(h.id, KASITTELIJA);
        ok += 1;
        console.log(`✓ ${h.nimi}`);
      } catch (virhe) {
        const viesti = virhe instanceof Error ? virhe.message : String(virhe);
        console.log(`✗ ${h.nimi}: ${viesti}`);
        process.exitCode = 1;
      }
    }
    tulokset.push({ era, ok, yht: osa.length });
  }

  console.log("\n=== YHTEENVETO ===");
  for (const t of tulokset) {
    console.log(`${t.era}: ${t.ok}/${t.yht}`);
  }
  console.log(`hylätty: ${hylattavat.length}`);
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
