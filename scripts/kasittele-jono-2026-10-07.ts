/**
 * Käsittelee odottavat muutosehdotukset 2026-10-07.
 * Aja: npx tsx scripts/kasittele-jono-2026-10-07.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hyvaksyMuutosehdotus,
  hylkaaMuutosehdotus,
  paivitaKenttaLahdeUrl,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "Jyri Venninen";

const NEBius_ID = "6df78b4b-ae27-4a9a-b264-1ea50ad2a390";
const KAPULI_EN_VANHA = "https://www.yrityskehitys.net/en/plots/kapuli";
const KAPULI_EN_UUSI =
  "https://www.yrityskehitys.net/en/plots/kapuli/31-graniittitie-6";
const KAPULI_FI_VANHA =
  "https://www.yrityskehitys.net/toimitilat-ja-tontit/tontit-alueittain/kapuli";
const KAPULI_FI_UUSI =
  "https://www.yrityskehitys.net/toimitilat-ja-tontit/tontit-alueittain/kapuli/31-graniittitie-6";

const PAATOKSET = [
  "36ab0b8b-ba87-4f11-89bb-6b8fa8a1026c",
  "ee9b5e46-4184-4241-8afb-f4e5620d009e",
  "04b35fab-093d-4a1f-9d54-2d459288f4cb",
  "cf73ae86-93c7-4bba-a029-3e089b11de76",
];

const MAARAAJAT = [
  "bbe3689b-9a2f-4534-ad92-4ff89f9dc2e0",
  "ee5449d9-48e8-4981-bfd1-d756e8ea05f6",
];

const YTJ_KUITATTAVAT = [
  "4473a14e-6131-47f4-8b08-8d53ea5a3994",
  "f707d92c-ac67-40c3-86c3-f9e8b9af7af1",
  "9c96810b-6f59-4fa9-a7d8-26dde88aa562",
  "2d6c7b4d-f2d0-43cc-be40-35e3b58b9248",
  "723ea9a7-4232-4afb-aae9-849faaa5861b",
  "26e1997d-91fe-4834-8a60-e907a738697b",
  "b347d64a-1043-432d-b0c1-2e823c3927f2",
  "5029e4c9-d98b-4528-96ab-e21c6bccaed0",
  "f25c2d11-bb0c-4755-a2d6-8e01a3202c63",
  "d584804e-9ae1-4209-bacc-ad5b13c16380",
];

const LINKKI_RIKKI = [
  "e09ae363-a7bc-41a5-a700-b6c6bc1e0519",
  "68a76043-4d13-48d8-be33-835bdec15f19",
  "d322c7f5-6082-437d-b0e8-acc60609adb9",
  "19161140-cdbc-4db1-88d1-f07224974888",
];

const KUNTA_HAVAINNOT: {
  id: string;
  hanke_id: string;
  dokumentit_url: string[];
}[] = [
  {
    id: "19d6d33b-570c-4409-ae25-2975b22082ea",
    hanke_id: "1a79cdbe-7a70-4d86-bde2-56fde9f0a691",
    dokumentit_url: [
      "https://raahe10.oncloudos.com/kokous/2026806-4.PDF",
      "https://raahe10.oncloudos.com/kokous/2026806-4-59198.PDF",
      "https://raahe10.oncloudos.com/kokous/2026806-4-60434.PDF",
    ],
  },
  {
    id: "5d264ab5-6b1d-4ce8-b70f-5a3c854f7852",
    hanke_id: "1a79cdbe-7a70-4d86-bde2-56fde9f0a691",
    dokumentit_url: [
      "https://raahe10.oncloudos.com/kokous/2026806-5.PDF",
      "https://raahe10.oncloudos.com/kokous/2026806-5-60406.PDF",
      "https://raahe10.oncloudos.com/kokous/2026806-5-60408.PDF",
    ],
  },
  {
    id: "ea3d4e45-756e-4a25-a58b-bea242ff46c3",
    hanke_id: "7f17cd7f-c1b8-495f-a3e3-3b439e7751b9",
    dokumentit_url: [
      "https://nurmijarvi10.oncloudos.com/kokous/20261016-3.PDF",
      "https://nurmijarvi10.oncloudos.com/kokous/20261016-3-75503.PDF",
    ],
  },
];

let sb: ReturnType<typeof createClient>;

async function odottaa(id: string): Promise<boolean> {
  const { data } = await sb
    .from("muutosehdotukset")
    .select("tila")
    .eq("id", id)
    .maybeSingle();
  return (data as { tila?: string } | null)?.tila === "odottaa";
}

async function hyvaksy(id: string, valinnat?: Parameters<typeof hyvaksyMuutosehdotus>[2]) {
  if (!(await odottaa(id))) {
    console.log(`− ohitettu ${id} (ei odottaa)`);
    return;
  }
  await hyvaksyMuutosehdotus(id, KASITTELIJA, valinnat);
  console.log(`✓ ${id}`);
}

async function hylkaa(id: string, perustelu: string) {
  if (!(await odottaa(id))) {
    console.log(`− ohitettu ${id} (ei odottaa)`);
    return;
  }
  await hylkaaMuutosehdotus(id, KASITTELIJA, perustelu);
  console.log(`✗ ${id}`);
}

async function korjaaKapuliLahteet() {
  await paivitaKenttaLahdeUrl(
    "hankkeet",
    NEBius_ID,
    "pinta_ala_ha",
    KAPULI_EN_VANHA,
    KAPULI_EN_UUSI,
  );
  console.log("✓ Nebius pinta_ala_ha → Graniittitie 6 -sivu");

  for (const kentta of ["kortteli", "sijainti"] as const) {
    await paivitaKenttaLahdeUrl(
      "hankkeet",
      NEBius_ID,
      kentta,
      KAPULI_FI_VANHA,
      KAPULI_FI_UUSI,
    );
    console.log(`✓ Nebius ${kentta} → Graniittitie 6 -sivu`);
  }
}

async function main() {
  lataaPaikallinenYmparisto();
  sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  try {
    await korjaaKapuliLahteet();
  } catch (syy) {
    console.warn(
      "⚠ Kapuli-URL-korjaukset:",
      syy instanceof Error ? syy.message : syy,
    );
  }

  for (const id of PAATOKSET) await hyvaksy(id);
  for (const id of MAARAAJAT) await hyvaksy(id);

  await hyvaksy("c3539377-63cc-4a4a-acd4-75f94593ac79");

  for (const id of YTJ_KUITATTAVAT) await hyvaksy(id);

  await hylkaa(
    "95aefc64-91a6-44be-b01f-decf8e3f65ab",
    "PRH avoin YTJ ei kata tätä tunnusta (erikoissijoitusrahasto); ei automaattista korjausta.",
  );

  await hyvaksy("8b29f58a-d6c8-41db-82db-fdc4561cd39b");

  for (const kh of KUNTA_HAVAINNOT) {
    await hyvaksy(kh.id, {
      hanke_id: kh.hanke_id,
      dokumentit_url: kh.dokumentit_url,
    });
  }

  for (const id of LINKKI_RIKKI) await hyvaksy(id);

  const { count } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .eq("tila", "odottaa");
  console.log(`\nOdottavia jäljellä: ${count ?? "?"}`);
}

main().catch((syy) => {
  console.error(syy);
  process.exit(1);
});
