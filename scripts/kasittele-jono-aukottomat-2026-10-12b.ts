/**
 * Odottavat kunta_havainto / korjaus / täydennys: vain aukottomat (asiakirja luettu).
 * Aja: npx tsx scripts/kasittele-jono-aukottomat-2026-10-12b.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hylkaaMuutosehdotus,
  hyvaksyMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const kuiva = process.argv.includes("--kuiva");

const HELIOS_SIMO = "8e663ff1-3bd8-4fc3-9123-0ff17b2e72bc";
const DAYONE_LAHTI = "f0b6d05e-24f5-443e-9365-f840f7e8d933";
const INGRID_II = "dbd635f7-b712-49b6-b56b-3ed61c1c9f2d";

/** Hyväksy kunta_havainto tiettyyn hankkeeseen. */
const HYVAKSY_KUNTA: Array<{ id: string; hanke_id: string; syy: string }> = [
  {
    id: "d7d9e5c9-d7e8-4542-87b5-435bf6324d2f",
    hanke_id: HELIOS_SIMO,
    syy: "Kh 28.9.2026 §241: Helios 7 Simo Oy, Malinin alue (Eagle Eye) → Helios Simo, Malininperä.",
  },
  {
    id: "2ce4f4c0-bc56-4e1a-b1cf-3b658ffa652b",
    hanke_id: DAYONE_LAHTI,
    syy: "Kh 25.8.2025 §270 kasvusopimus DayOnen kanssa (Kiveriö) — Lahti.fi uutinen 25.8.2025.",
  },
  {
    id: "09589f32-a9a2-4a64-9219-832e7e8d787f",
    hanke_id: INGRID_II,
    syy: "Kh 15.6.2026 §164: Ingrid Capacity AB Metsäjakku / Isokangas — sama hanke.",
  },
  {
    id: "3fd3953f-8dd3-42f9-b2b3-7b5922f30e3a",
    hanke_id: INGRID_II,
    syy: "Kh 15.6.2026 §164 liite: Ingrid Capacity Metsäjakku — sama hanke.",
  },
  {
    id: "aab89a6b-b6d8-4c99-8d42-5b37ace496c3",
    hanke_id: INGRID_II,
    syy: "Kh 15.6.2026 §164 kokousasia: Ingrid Capacity Metsäjakku — sama hanke.",
  },
];

/** Hyväksy korjaus (kenttäarvo). */
const HYVAKSY_KORJAUS: Array<{ id: string; syy: string }> = [
  {
    id: "f32a88fd-5641-4a9a-9d81-a67c0e5fd335",
    syy: "Mahlianmaa hyväksymisvaiheen kaavaselostus: T-korttelialue 26,4 ha. Rekisterin 29,47 heikko lähde.",
  },
];

const HYLKAA: Array<{ id: string; perustelu: string }> = [
  // Raisio Borg — ei datakeskus
  {
    id: "80058472-6849-4a2e-939f-5068972dc5ec",
    perustelu:
      "Kh 3.2.2025 §28: Borg-kiinteistöt Oy:n suunnitteluvaraus Itä-Somersojalla tuotantotiloille. Ei mainitse datakeskusta eikä Ecogridia.",
  },
  // Sievi Micropolis — ei FR Malakakangas (kaksi rivitä)
  {
    id: "91bca4bc-d7d4-4ef1-a108-9757e1e3839a",
    perustelu:
      "Kh 17.8.2026 §130: Iin Micropolis / maakunnallinen EAKR-yhteistyökysely. Ei koske FR Malakakangas DC -hanketta.",
  },
  {
    id: "46f6e5ea-0668-4695-b35b-8fe8112580ce",
    perustelu:
      "Kh 17.8.2026 §130: Iin Micropolis / maakunnallinen EAKR-yhteistyökysely. Ei koske FR Malakakangas DC -hanketta.",
  },
  // Kangasala Tarastenjärvi — ei Polarnode/DC
  {
    id: "8b974b5d-b1a9-4563-be8a-c8d71a2ff20b",
    perustelu:
      "Elinympäristölautakunta 10.2.2026 §12 kaava 912 Tarastenjärvi: asiakirja ei mainitse datakeskusta eikä Polarnodea.",
  },
  {
    id: "a0940008-1611-42f1-8ce3-5d38dd83c45d",
    perustelu:
      "Elinympäristölautakunta 16.6.2026 §95 kaava 912: asiakirja ei mainitse datakeskusta eikä Polarnodea.",
  },
  // Kauhajoki
  {
    id: "f6a13b63-8d8c-40df-b903-4a25e5cba1d7",
    perustelu:
      "Aronkylän teollisuuspuiston OYK: asiakirja ei mainitse datakeskusta eikä SR-Kiinteistöjä.",
  },
  // Kitee
  {
    id: "c98bb613-11b2-46cb-a6cf-107a1df063c7",
    perustelu:
      "Ympäristölautakunta 26.8.2026 §55 johtojen sijoittaminen Suorlahdessa: ei mainitse datakeskusta eikä Scale42:ta.",
  },
  // Kristiinankaupunki lakilausunto
  {
    id: "7124006e-7508-46ef-bd7d-7ed034250708",
    perustelu:
      "Kh 28.9.2026 §125: lausunto datakeskusrekisterilakiluonnoksesta. Ei koske yksittäistä hanketta.",
  },
  // Pornainen
  {
    id: "07c77193-26c8-4551-a8bf-892754915dd7",
    perustelu:
      "Kh 19.1.2026 §5 Pornaisten Portti hankintapäätös: ei mainitse Regantia eikä datakeskusta.",
  },
  // Ilmajoki hinnoittelu
  {
    id: "7d58b00e-a596-4645-a115-bf4284a84e3f",
    perustelu:
      "Kv 11.5.2026 §19 Koskenkorvan korttelien hinnoittelu: ei mainitse datakeskusta eikä Greenskyä.",
  },
  // Merijärvi BESS
  {
    id: "80904941-c171-4616-b441-3a47ea1c139e",
    perustelu:
      "Tekninen lautakunta 23.9.2026 §22: rakentamislupa energiavarastolle (akku), ei datakeskukselle.",
  },
  {
    id: "6654d225-501a-4cc4-a0b8-45b6b0cd3adb",
    perustelu:
      "Tekninen lautakunta 23.9.2026 §22: rakentamislupa energiavarastolle (akku), ei datakeskukselle.",
  },
  // Simo hukkalämpö EAKR — kaikki Simon hankkeet
  {
    id: "a233ab1c-e2c1-4ea7-87ea-3ddcdc6e8ae9",
    perustelu:
      "Kh 7.9.2026 §213: Simon datakeskusalueiden hukkalämmön EAKR-hanke (Hittikka, Hirvimaa, Malininperä). Ei yksittäisen hankkeen asiakirja.",
  },
  // Valkeakoski pinta-ala: vanhemmat / eri suureet
  {
    id: "753c8b2f-1e2e-4448-8c69-94749b2a08f0",
    perustelu:
      "26,5 ha on kaavaluonnoksen kortteliala; hyväksymisvaiheen selostus täsmentää 26,4 ha (hyväksytty erikseen).",
  },
  {
    id: "08076819-ae8a-4d69-91f8-b79cf45f4207",
    perustelu:
      "Noin 26 ha on varausaluehakemus (Kh 21.9.2026 §186), ei hyväksytyn kaavan T-korttelialaa (26,4 ha).",
  },
  {
    id: "4b47c98c-e22e-4ad6-90d7-18d35376de7e",
    perustelu:
      "Noin 20 ha on vuoden 2024 aloitusvaiheen suunniteltu tontti; hyväksymisvaihe täsmentää 26,4 ha.",
  },
];

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  async function vielaAuki(id: string): Promise<boolean> {
    const { data } = await sb
      .from("muutosehdotukset")
      .select("tila")
      .eq("id", id)
      .maybeSingle();
    return data?.tila === "odottaa" || data?.tila === "odottaa_kohdistusta";
  }

  // Magnora Kv §58: tyyppi taydennys → paatos, sitten hyväksy
  const MAGNORA_PAATOS = "d072a12a-080b-4306-b03f-b6497f379215";
  if (await vielaAuki(MAGNORA_PAATOS)) {
    if (kuiva) {
      console.log("[kuiva] korjaisi tyypin paatos + hyväksyisi", MAGNORA_PAATOS);
    } else {
      const { error: tyyppiVirhe } = await sb
        .from("muutosehdotukset")
        .update({ tyyppi: "paatos" })
        .eq("id", MAGNORA_PAATOS)
        .eq("tila", "odottaa");
      if (tyyppiVirhe) throw new Error(tyyppiVirhe.message);
      await hyvaksyMuutosehdotus(MAGNORA_PAATOS, KASITTELIJA);
      console.log("✓ Magnora Kv §58 päätös hyväksytty", MAGNORA_PAATOS.slice(0, 8));
    }
  } else {
    console.log("· Magnora jo käsitelty");
  }

  let nKunta = 0;
  let nKorjaus = 0;
  let nHyl = 0;

  for (const r of HYVAKSY_KUNTA) {
    if (!(await vielaAuki(r.id))) {
      console.log("· kunta jo", r.id.slice(0, 8));
      continue;
    }
    if (kuiva) {
      console.log("[kuiva] hyvaksy kunta", r.id.slice(0, 8), "→", r.hanke_id.slice(0, 8), r.syy);
      continue;
    }
    const tulos = await hyvaksyMuutosehdotus(r.id, KASITTELIJA, {
      hanke_id: r.hanke_id,
    });
    nKunta++;
    console.log("✓ kunta", tulos, r.id.slice(0, 8), r.syy.slice(0, 70));
  }

  for (const r of HYVAKSY_KORJAUS) {
    if (!(await vielaAuki(r.id))) {
      console.log("· korjaus jo", r.id.slice(0, 8));
      continue;
    }
    if (kuiva) {
      console.log("[kuiva] hyvaksy korjaus", r.id.slice(0, 8), r.syy);
      continue;
    }
    await hyvaksyMuutosehdotus(r.id, KASITTELIJA);
    nKorjaus++;
    console.log("✓ korjaus", r.id.slice(0, 8), r.syy.slice(0, 70));
  }

  for (const r of HYLKAA) {
    if (!(await vielaAuki(r.id))) {
      console.log("· hylkäys jo", r.id.slice(0, 8));
      continue;
    }
    if (kuiva) {
      console.log("[kuiva] hylkaa", r.id.slice(0, 8), r.perustelu.slice(0, 70));
      continue;
    }
    await hylkaaMuutosehdotus(r.id, KASITTELIJA, r.perustelu);
    nHyl++;
    console.log("✓ hylätty", r.id.slice(0, 8), r.perustelu.slice(0, 70));
  }

  console.log("Valmis tällä ajolla:", nKunta, "kunta,", nKorjaus, "korjaus,", nHyl, "hylätty");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
