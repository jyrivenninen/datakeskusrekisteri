/**
 * Hyväksyy/hylkää grok-taydennys-2026-09-08 -jonon erät.
 * Aja: npx tsx scripts/hyvaksy-jono-2026-09-08.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import {
  hylkaaMuutosehdotus,
  hyvaksyMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "Jyri Venninen";

const HYLATTAVAT = new Set([
  "7cf7af5f-b19e-4c21-aef3-9ca5e4d4ef3e", // Winda duplikaattipäätös
  "3631b657-a0c9-414b-8956-4fc99f6503da", // Arcem 500 MW spekulatiivinen
  "336e638f-4d46-44db-8005-b6c6124e99a7", // FCDC weak skip
  "88301806-edc3-4563-adf2-097ae313b17a", // Parkano skip
  "b0d4b058-0ce3-4998-b1a8-ffbf703a264e", // Kerava duplikaatti tarkistus
  "00f35469-23a0-4df1-96be-67305e489293", // OnZero duplikaatti tarkistus
  "09286f8a-de0b-468d-90ce-e0607f5a00b0", // BiltTek duplikaatti tarkistus
]);

const HYLATYS_SYY: Record<string, string> = {
  "7cf7af5f-b19e-4c21-aef3-9ca5e4d4ef3e":
    "Duplikaatti: sama Winda-päätös kuin dc363127 (valtuusto 31.8.2026).",
  "3631b657-a0c9-414b-8956-4fc99f6503da":
    "Spekulatiivinen 500 MW potentiaali; julkaistu arvo 60 MW säilyy kunnes YVA vahvistaa.",
  "336e638f-4d46-44db-8005-b6c6124e99a7": "Heikko lähde (skip merkintä).",
  "88301806-edc3-4563-adf2-097ae313b17a": "Duplikaatti Parkano kaavatunnus.",
  "b0d4b058-0ce3-4998-b1a8-ffbf703a264e": "Duplikaatti kentta_tarkistus.",
  "00f35469-23a0-4df1-96be-67305e489293": "Duplikaatti kentta_tarkistus.",
  "09286f8a-de0b-468d-90ce-e0607f5a00b0": "Duplikaatti kentta_tarkistus.",
};

function kenttaHuomautuksesta(huomautus: string | null): string | null {
  if (!huomautus) return null;
  const osuma = huomautus.match(/^([a-z][a-z0-9_]*):/);
  return osuma?.[1] ?? null;
}

async function korjaaTarkistusSisalto(
  sb: SupabaseClient,
  id: string,
  hankeId: string,
  huomautus: string | null,
  sisalto: EhdotusSisalto,
): Promise<void> {
  const kentta =
    sisalto.tarkistus?.kentta?.trim() || kenttaHuomautuksesta(huomautus);
  if (!kentta) return;

  const tarkistusHuomautus =
    sisalto.tarkistus?.huomautus?.trim() ||
    (huomautus?.includes(":") ? huomautus.split(":").slice(1).join(":").trim() : huomautus) ||
    null;

  const korjattu: EhdotusSisalto = {
    ...sisalto,
    kentat: sisalto.kentat ?? {},
    tarkistus: {
      taulu: "hankkeet",
      rivi_id: sisalto.tarkistus?.rivi_id ?? hankeId,
      kentta,
      tulos: sisalto.tarkistus?.tulos ?? "ei_julkista_lahdetta",
      huomautus: tarkistusHuomautus,
    },
  };

  const { error } = await sb
    .from("muutosehdotukset")
    .update({ sisalto: korjattu })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}

async function hyvaksyFuGenTyhjennys(sb: SupabaseClient, id: string): Promise<void> {
  const { data: ehdotus, error } = await sb
    .from("muutosehdotukset")
    .select("sisalto, hanke_id, huomautus, lahde_url")
    .eq("id", id)
    .eq("tila", "odottaa")
    .single();
  if (error || !ehdotus) throw new Error(error?.message ?? "Ei löydy");

  const sis = ehdotus.sisalto as EhdotusSisalto & {
    tyhjennys?: Array<Record<string, unknown>>;
  };
  const rivit = Array.isArray(sis.tyhjennys) ? sis.tyhjennys : [];
  const ensimmainen = rivit.find((r) => r.kentta);
  if (!ensimmainen) throw new Error("Tyhjennyslista tyhjä");

  // RPC tyhjentää lat+lon+alue_tyyppi yhdellä kertaa.
  const yksittainen: EhdotusSisalto = {
    kentat: {},
    tyhjennys: {
      taulu: "hankkeet",
      rivi_id: ehdotus.hanke_id!,
      kentta: String(ensimmainen.kentta),
      perustelu: String(ensimmainen.syy ?? ehdotus.huomautus ?? ""),
      lahde_url: (ensimmainen.lahde_url as string) ?? ehdotus.lahde_url,
      lainaus: (ensimmainen.lainaus as string) ?? null,
    },
  };
  const { error: paivitysVirhe } = await sb
    .from("muutosehdotukset")
    .update({ sisalto: yksittainen })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (paivitysVirhe) throw new Error(paivitysVirhe.message);
  await hyvaksyMuutosehdotus(id, KASITTELIJA);
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, tyyppi, hanke_id, huomautus, sisalto, ehdottaja_tunniste")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });
  if (error) throw error;

  const hankeIdt = [...new Set((data ?? []).map((e) => e.hanke_id).filter(Boolean))] as string[];
  const { data: hankkeet } = hankeIdt.length
    ? await sb.from("hankkeet").select("id, nimi").in("id", hankeIdt)
    : { data: [] };
  const nimet = new Map((hankkeet ?? []).map((h) => [h.id, h.nimi]));

  let hyvaksytty = 0;
  let hylatty = 0;
  let virheet = 0;

  const kasittele = async (id: string, teko: () => Promise<void>) => {
    const e = (data ?? []).find((x) => x.id === id);
    const nimi = e?.hanke_id ? (nimet.get(e.hanke_id) ?? e.hanke_id) : "?";
    try {
      await teko();
      hyvaksytty += 1;
      console.log(`✓ ${nimi} (${e?.tyyppi})`);
    } catch (virhe) {
      virheet += 1;
      console.log(`✗ ${nimi}: ${virhe instanceof Error ? virhe.message : virhe}`);
    }
  };

  // 1. Hylkäykset
  for (const id of HYLATTAVAT) {
    if (!(data ?? []).some((e) => e.id === id)) continue;
    const syy = HYLATYS_SYY[id] ?? "Hylätty eräajossa.";
    try {
      await hylkaaMuutosehdotus(id, KASITTELIJA, syy);
      hylatty += 1;
      console.log(`⊘ ${id.slice(0, 8)}…`);
    } catch (virhe) {
      virheet += 1;
      console.log(`✗ hylkäys ${id}: ${virhe}`);
    }
  }

  // 2. Fu-Gen erikoistyhjennys
  if ((data ?? []).some((e) => e.id === "66e6c998-a996-405d-9740-6f91982fe469")) {
    try {
      await hyvaksyFuGenTyhjennys(sb, "66e6c998-a996-405d-9740-6f91982fe469");
      hyvaksytty += 1;
      console.log("✓ Fu-Gen Toholampi (sijainti tyhjennys)");
    } catch (virhe) {
      virheet += 1;
      console.log(`✗ Fu-Gen: ${virhe}`);
    }
  }

  // Päivitä lista
  const { data: jaljella } = await sb
    .from("muutosehdotukset")
    .select("id, tyyppi, hanke_id, huomautus, sisalto, ehdottaja_tunniste")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });

  const jarjestys = [
    "paatos",
    "ristiriita_havainto",
    "kentta_tarkistus",
    "korjaus",
    "taydennys",
  ];

  for (const tyyppi of jarjestys) {
    const osa = (jaljella ?? []).filter((e) => e.tyyppi === tyyppi && !HYLATTAVAT.has(e.id));
    if (osa.length === 0) continue;
    console.log(`\n=== ${tyyppi.toUpperCase()} (${osa.length}) ===`);

    for (const e of osa) {
      const nimi = e.hanke_id ? (nimet.get(e.hanke_id) ?? e.hanke_id) : "?";

      if (tyyppi === "kentta_tarkistus") {
        try {
          await korjaaTarkistusSisalto(sb, e.id, e.hanke_id!, e.huomautus, e.sisalto as EhdotusSisalto);
          await hyvaksyMuutosehdotus(e.id, KASITTELIJA);
          hyvaksytty += 1;
          console.log(`✓ ${nimi}`);
        } catch (virhe) {
          virheet += 1;
          console.log(`✗ ${nimi}: ${virhe instanceof Error ? virhe.message : virhe}`);
        }
        continue;
      }

      if (tyyppi === "taydennys") {
        const kentat = (e.sisalto as EhdotusSisalto).kentat ?? {};
        const avaimet = Object.keys(kentat);
        // sijainti_alue → erillinen skripti myöhemmin
        if (avaimet.length === 1 && avaimet[0] === "sijainti_alue") continue;
      }

      try {
        await hyvaksyMuutosehdotus(e.id, KASITTELIJA);
        hyvaksytty += 1;
        console.log(`✓ ${nimi}`);
      } catch (virhe) {
        virheet += 1;
        console.log(`✗ ${nimi}: ${virhe instanceof Error ? virhe.message : virhe}`);
      }
    }
  }

  console.log(`\n=== YHTEENVETO ===`);
  console.log(`Hyväksytty: ${hyvaksytty}, hylätty: ${hylatty}, virheitä: ${virheet}`);

  const { count } = await sb
    .from("muutosehdotukset")
    .select("*", { count: "exact", head: true })
    .eq("tila", "odottaa");
  console.log(`Odottaa vielä: ${count ?? "?"}`);
}

main().catch((virhe) => {
  console.error(virhe);
  process.exit(1);
});
