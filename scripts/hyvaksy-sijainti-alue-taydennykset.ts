/**
 * Hyväksyy odottavat täydennys-ehdotukset: sijainti_alue (osoiteteksti → geokoodaus).
 * Aja: npx tsx scripts/hyvaksy-sijainti-alue-taydennykset.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { onSijaintiAluePolygon } from "../src/lib/geokoodaus";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";
import type { EhdotusSisalto } from "../src/lib/ehdotus";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, hanke_id, huomautus, luotu_pvm, sisalto")
    .eq("tyyppi", "taydennys")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });

  if (error) throw error;

  const osumat = (data ?? []).filter((e) => {
    const arvo = (e.sisalto as EhdotusSisalto).kentat?.sijainti_alue?.arvo;
    if (arvo == null || arvo === "") return false;
    return !onSijaintiAluePolygon(arvo);
  });

  const hankeIdt = [...new Set(osumat.map((e) => e.hanke_id).filter(Boolean))] as string[];
  const { data: hankkeet } = hankeIdt.length
    ? await sb
        .from("hankkeet")
        .select("id, nimi, sijainti_lat, sijainti_lon")
        .in("id", hankeIdt)
    : { data: [] };

  const hankeKartta = new Map((hankkeet ?? []).map((h) => [h.id, h]));
  const kasittelija = "Jyri Venninen";

  const jarjestetty = [...osumat].sort(
    (a, b) => new Date(b.luotu_pvm).getTime() - new Date(a.luotu_pvm).getTime(),
  );
  const nahdytHankeIdt = new Set<string>();
  const ajettavat = jarjestetty.filter((e) => {
    const hid = e.hanke_id;
    if (!hid || nahdytHankeIdt.has(hid)) return false;
    nahdytHankeIdt.add(hid);
    return true;
  });

  console.log(
    `Löytyi ${osumat.length} sijainti_alue-täydennystä (${hankeIdt.length} hanketta). ` +
      `Hyväksytään ${ajettavat.length} (yksi per hanke, uusin ensin).\n`,
  );

  const tulokset: { id: string; hanke: string; ok: boolean; virhe?: string }[] = [];

  for (const ehdotus of ajettavat) {
    const hanke = hankeKartta.get(ehdotus.hanke_id!);
    const nimi = hanke?.nimi ?? ehdotus.hanke_id ?? "?";
    const osoite = String(
      (ehdotus.sisalto as EhdotusSisalto).kentat?.sijainti_alue?.arvo ?? "",
    );
    try {
      await hyvaksyMuutosehdotus(ehdotus.id, kasittelija);
      tulokset.push({ id: ehdotus.id, hanke: nimi, ok: true });
      console.log(`✓ ${nimi} — ${osoite}`);
    } catch (virhe) {
      const viesti = virhe instanceof Error ? virhe.message : String(virhe);
      tulokset.push({ id: ehdotus.id, hanke: nimi, ok: false, virhe: viesti });
      console.log(`✗ ${nimi} — ${osoite}: ${viesti}`);
    }
  }

  const onnistui = tulokset.filter((t) => t.ok).length;
  console.log(`\nValmis: ${onnistui}/${tulokset.length} hyväksytty.`);

  const ohitetut = osumat.length - ajettavat.length;
  if (ohitetut > 0) {
    console.log(`${ohitetut} duplikaattia jätettiin odottamaan (sama hanke).`);
  }

  if (tulokset.some((t) => !t.ok)) {
    process.exitCode = 1;
  }
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
