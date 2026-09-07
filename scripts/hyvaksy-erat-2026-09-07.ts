/**
 * Hyväksyy kolme erää: päätökset, vaihe/tyyppi-korjaukset, merkittävät numeeriset korjaukset.
 * Aja: npx tsx scripts/hyvaksy-erat-2026-09-07.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";
import type { EhdotusSisalto } from "../src/lib/ehdotus";

const KASITTELIJA = "Jyri Venninen";

const MERKITTAVAT_AVAIMET = new Set([
  "Fortum Orimattila, Pennala|pinta_ala_ha",
  "atNorth FIN04, Myllykoski|pinta_ala_ha",
  "FCDC Valkeakoski, Mahlianmaa|pinta_ala_ha",
  "Espoon datakeskusalue|it_teho_mw",
  "Digita Helsinki Data Center 1|teho_mw",
  "Telia Helsinki Data Center|teho_mw",
  "E-Heat Kankaanpää|it_teho_mw",
  "Kouvolan datakeskus, Hyperco Data Systems Oy|generaattori_polttoaineteho_mw",
  "Hyperco Loviisa|pinta_ala_ha",
  "Verne, Kapuli|pinta_ala_ha",
  "Equinix HE7|pinta_ala_ha",
  "Vihdin datakeskus|kaavatunnus",
  "Fortum Sipoo, Stormosskärret|kaavatunnus",
]);

function kuuluuMerkittaviin(nimi: string, sisalto: EhdotusSisalto): boolean {
  for (const k of Object.keys(sisalto.kentat ?? {})) {
    if (MERKITTAVAT_AVAIMET.has(`${nimi}|${k}`)) return true;
  }
  return false;
}

function kuuluuVaiheTyyppiin(
  tyyppi: string,
  huomautus: string | null,
  sisalto: EhdotusSisalto,
): boolean {
  if ((huomautus ?? "").includes("placeholder")) return false;
  if (tyyppi === "korjaus" && sisalto.kentat?.vaihe) return true;
  if (sisalto.kentat?.sijainti_alue_tyyppi) {
    return tyyppi === "korjaus" || tyyppi === "taydennys";
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

  const erat: { nimi: string; idt: string[] }[] = [
    { nimi: "päätökset", idt: [] },
    { nimi: "vaihe/tyyppi", idt: [] },
    { nimi: "merkittävät numeeriset", idt: [] },
  ];

  for (const e of data ?? []) {
    const nimi = hankeKartta.get(e.hanke_id!) ?? e.hanke_id ?? "?";
    const sis = e.sisalto as EhdotusSisalto;
    if (e.tyyppi === "paatos") erat[0].idt.push(e.id);
    if (kuuluuVaiheTyyppiin(e.tyyppi, e.huomautus, sis)) erat[1].idt.push(e.id);
    if (
      (e.tyyppi === "korjaus" || e.tyyppi === "taydennys") &&
      kuuluuMerkittaviin(nimi, sis)
    ) {
      erat[2].idt.push(e.id);
    }
  }

  const tulokset: { era: string; hanke: string; ok: boolean; virhe?: string }[] =
    [];

  for (const era of erat) {
    console.log(`\n=== ${era.nimi.toUpperCase()} (${era.idt.length} kpl) ===\n`);
    for (const id of era.idt) {
      const ehdotus = (data ?? []).find((e) => e.id === id);
      const nimi = ehdotus?.hanke_id
        ? (hankeKartta.get(ehdotus.hanke_id) ?? ehdotus.hanke_id)
        : "?";
      try {
        await hyvaksyMuutosehdotus(id, KASITTELIJA);
        tulokset.push({ era: era.nimi, hanke: nimi, ok: true });
        console.log(`✓ ${nimi}`);
      } catch (virhe) {
        const viesti = virhe instanceof Error ? virhe.message : String(virhe);
        tulokset.push({ era: era.nimi, hanke: nimi, ok: false, virhe: viesti });
        console.log(`✗ ${nimi}: ${viesti}`);
      }
    }
  }

  console.log("\n=== YHTEENVETO ===");
  for (const era of erat) {
    const osa = tulokset.filter((t) => t.era === era.nimi);
    const ok = osa.filter((t) => t.ok).length;
    console.log(`${era.nimi}: ${ok}/${osa.length}`);
  }

  if (tulokset.some((t) => !t.ok)) process.exitCode = 1;
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
