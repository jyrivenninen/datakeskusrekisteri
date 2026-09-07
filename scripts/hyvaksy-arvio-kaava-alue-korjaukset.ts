/**
 * Hyväksyy odottavat korjaus-ehdotukset: sijainti_alue_tyyppi arvio → kaava_alue.
 * Aja: npx tsx scripts/hyvaksy-arvio-kaava-alue-korjaukset.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

function onArvioKaavaAlueKorjaus(huomautus: string | null): boolean {
  const h = huomautus ?? "";
  return (
    h.includes("sijainti_alue_tyyppi=arvio") &&
    (h.includes("→ kaava_alue") || h.includes("-> kaava_alue") || h.includes("kaava_alue."))
  );
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, hanke_id, huomautus, luotu_pvm, sisalto")
    .eq("tyyppi", "korjaus")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });

  if (error) throw error;

  const osumat = (data ?? []).filter((e) => {
    const kentta = (e.sisalto as EhdotusSisalto).kentat?.sijainti_alue_tyyppi;
    return kentta?.arvo === "kaava_alue" && onArvioKaavaAlueKorjaus(e.huomautus);
  });

  const hankeIdt = [...new Set(osumat.map((e) => e.hanke_id).filter(Boolean))] as string[];
  const { data: hankkeet } = hankeIdt.length
    ? await sb.from("hankkeet").select("id, nimi, sijainti_alue_tyyppi").in("id", hankeIdt)
    : { data: [] };

  const hankeKartta = new Map((hankkeet ?? []).map((h) => [h.id, h]));
  const kasittelija = "Jyri Venninen";

  console.log(`Löytyi ${osumat.length} arvio→kaava_alue -korjausta (${hankeIdt.length} hanketta).\n`);

  const tulokset: { id: string; hanke: string; ok: boolean; virhe?: string }[] = [];

  for (const ehdotus of osumat) {
    const hanke = hankeKartta.get(ehdotus.hanke_id!);
    const nimi = hanke?.nimi ?? ehdotus.hanke_id ?? "?";
    try {
      await hyvaksyMuutosehdotus(ehdotus.id, kasittelija);
      tulokset.push({ id: ehdotus.id, hanke: nimi, ok: true });
      console.log(`✓ ${nimi}`);
    } catch (virhe) {
      const viesti = virhe instanceof Error ? virhe.message : String(virhe);
      tulokset.push({ id: ehdotus.id, hanke: nimi, ok: false, virhe: viesti });
      console.log(`✗ ${nimi}: ${viesti}`);
    }
  }

  const onnistui = tulokset.filter((t) => t.ok).length;
  console.log(`\nValmis: ${onnistui}/${tulokset.length} hyväksytty.`);
  if (tulokset.some((t) => !t.ok)) {
    process.exitCode = 1;
  }
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
