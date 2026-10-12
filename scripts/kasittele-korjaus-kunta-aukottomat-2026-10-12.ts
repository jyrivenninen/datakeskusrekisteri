/**
 * Odottavat korjaus-/kuntahavainnot: vain aukottomat.
 * Aja: npx tsx scripts/kasittele-korjaus-kunta-aukottomat-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hylkaaMuutosehdotus,
  hyvaksyMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";

const HYVAKSY: Array<{ id: string; syy: string }> = [
  {
    id: "ae8c9b4e-5da4-441a-980b-e9e1cf1fb428",
    syy: "Orimattila Pennala: T-2 datakeskuskortteli 127,6 ha (viranomaisasiakirja).",
  },
];

const HYLKAA: Array<{ id: string; perustelu: string }> = [
  {
    id: "7767f57c-00ea-402f-b1d0-1b0319aae64a",
    perustelu:
      "1 276 600 m² on sama T-2-kortteli kuin 127,6 ha; arvoa ei tallenneta hehtaareina virheellisenä. Hyväksytty 127,6 ha -rivi.",
  },
  {
    id: "a2751f45-c485-4618-912c-af4d315fe8f0",
    perustelu:
      "517 893 m² / n. 52 ha on esisopimuksen kohde, ei T-2-datakeskuskorttelia (127,6 ha).",
  },
  {
    id: "89bcf9ad-0a13-4ad2-a736-3dfc113cb464",
    perustelu:
      "17,1204 ha on vuokra-alue Fortumille, ei asemakaavan T-2-datakeskuskorttelia (127,6 ha).",
  },
  {
    id: "12f4e786-3a5f-4d1b-a9eb-ca743347aca6",
    perustelu:
      "Ehdotettu vaihe «kaava hyväksytty …» ei ole sallittu vaihe-arvo. Kv 27.4.2026 § 38 hyväksyi kaavan; rekisterin lupamenettely on sen jälkeen oikea vaihe.",
  },
  {
    id: "31679b93-2226-4c3b-8c0e-70d32eba3868",
    perustelu:
      "60,3 ha on aloitusvaiheen alustava suunnittelualue. Rekisterissä kaava_ala_ha 62,9 ha lähteellä, joka toteaa alueen täsmentyneen aloitusvaiheesta.",
  },
  {
    id: "6e3786cd-82d4-407a-bc03-3f326e47d6f8",
    perustelu:
      "8,8001 ha on rakentamisluvan kiinteistön pinta-ala (505-407-7-140). Rekisterin 7,4 ha on Kh:n asemakaavan mukainen tontti; eri suureita, ei korvata.",
  },
  {
    id: "496da8ee-bbc9-4931-af17-97d4b80f1050",
    perustelu:
      "Ehdotettu vaihe «kaava hyväksytty Kh 4.5.2026 § 94» ei ole sallittu vaihe-arvo. Kaavan hyväksyntä ei itsessään vaihda vaihetta pois lupamenettelystä ilman erillistä perustelua.",
  },
];

async function main() {
  lataaPaikallinenYmparisto();
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  for (const r of HYVAKSY) {
    await hyvaksyMuutosehdotus(r.id, KASITTELIJA);
    console.log("✓ hyvaksytty", r.id.slice(0, 8), r.syy);
  }
  for (const r of HYLKAA) {
    await hylkaaMuutosehdotus(r.id, KASITTELIJA, r.perustelu);
    console.log("✓ hylätty", r.id.slice(0, 8), r.perustelu.slice(0, 80));
  }
  console.log("Valmis", HYVAKSY.length, "hyväksytty,", HYLKAA.length, "hylätty");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
