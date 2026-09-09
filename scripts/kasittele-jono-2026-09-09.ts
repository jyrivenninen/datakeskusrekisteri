/**
 * Käsittelee odottavat 2026-09-09: linkkikorjaukset, ristiriidat, YTJ.
 * Aja: npx tsx scripts/kasittele-jono-2026-09-09.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hyvaksyMuutosehdotus,
  hylkaaMuutosehdotus,
  paivitaKenttaLahdeUrl,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "Jyri Venninen";

const RISTIRIITA_PERUSTELU: Record<string, string> = {
  teho_suhde:
    "Generaattorikentät ja teho_mw ovat eri mittakaavoissa YVA-dokumenteissa; havainto kuitattu.",
  maaraaika_mennyt:
    "Uudempi määräaika on rekisterissä; vanhentunut havainto ei vaadi toimenpiteitä.",
  lahekkaiset_hankkeet:
    "Lähekkäiset erilliset hankkeet samalla alueella; havainto kuitattu.",
};

const JOKELA_SIJOINTI_VANHA =
  "https://kartta.tuusula.fi/kaava_pdf/asemakaavat/kaavamaaraykset/3662.pdf";
const JOKELA_SIJOINTI_UUSI =
  "https://tuusula.oncloudos.com/kokous/F56A518FX3010X4561XB713X45DDDAB5E7D0-4-52312.PDF";

const VALKEAKOSKI_PDF_VANHA =
  "https://www.valkeakoski.fi/uploads/sites/1/2025/11/54ea42fb-553_mahlianmaa_ehdotusvaiheen-kaavakartta.pdf";
const VALKEAKOSKI_PDF_VANHA2 =
  "https://www.valkeakoski.fi/uploads/sites/1/2025/11/55ac9a5d-553_mahlianmaa_ehdotus_selostuksen-liitteet-2-6_nahtaville.pdf";
const VALKEAKOSKI_ASEMAKaavaSivu =
  "https://www.valkeakoski.fi/asuminen-ja-ymparisto/kaupunkisuunnittelu/asemakaavoitus/";

const JOKELA_ID = "81096dd2-fc75-4145-a931-6cd6fdce7413";
const VALKEAKOSKI_ID = "a511e596-99c9-48de-8ebb-f8a2c15e473e";

const LINKKI_RIKKI = ["cfc51e92-c0ae-400b-9ee4-82b7231528b4", "cb9504a3-83bf-45c4-bf43-d8a9e551d0c5"];

const RISTIRIIDAT = [
  "bf071ec2-22ce-44e2-8361-7e51b8b5c210",
  "c0c07392-5822-4f74-91bb-76d729201157",
  "54cc5c5d-5734-4da0-856b-450c15f19464",
  "2a03845f-f359-4b0f-a1d4-9bf1e1eef17b",
  "8598a597-3d2c-48c0-bf0e-d20da0b3bb8b",
  "346e59bf-ad1e-48f1-b8d9-1f26ccb716ce",
];

async function korjaaLahteet() {
  await paivitaKenttaLahdeUrl(
    "hankkeet",
    JOKELA_ID,
    "sijainti",
    JOKELA_SIJOINTI_VANHA,
    JOKELA_SIJOINTI_UUSI,
  );
  console.log("✓ Jokela sijainti: kartta.tuusula → oncloudos PDF");

  for (const vanha of [VALKEAKOSKI_PDF_VANHA, VALKEAKOSKI_PDF_VANHA2]) {
    const { data } = await sb
      .from("kentta_lahteet")
      .select("kentta")
      .eq("taulu", "hankkeet")
      .eq("rivi_id", VALKEAKOSKI_ID)
      .eq("lahde_url", vanha);
    for (const rivi of (data ?? []) as { kentta: string }[]) {
      await paivitaKenttaLahdeUrl(
        "hankkeet",
        VALKEAKOSKI_ID,
        rivi.kentta,
        vanha,
        VALKEAKOSKI_ASEMAKaavaSivu,
      );
      console.log(`✓ Valkeakoski ${rivi.kentta}: PDF → asemakaavoitus-sivu`);
    }
  }
}

let sb: ReturnType<typeof createClient>;

async function main() {
  lataaPaikallinenYmparisto();
  sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  try {
    await korjaaLahteet();
  } catch (syy) {
    console.warn(
      "⚠ Lähde-URL-korjaukset epäonnistuivat (aja ensin: npx supabase db push):",
      syy instanceof Error ? syy.message : syy,
    );
  }

  for (const id of LINKKI_RIKKI) {
    await hyvaksyMuutosehdotus(id, KASITTELIJA);
    console.log(`✓ linkki_rikki ${id}`);
  }

  for (const id of RISTIRIIDAT) {
    const { data } = await sb
      .from("muutosehdotukset")
      .select("sisalto")
      .eq("id", id)
      .maybeSingle();
    const saanto = (
      (data as { sisalto?: { ristiriita?: { saanto?: string } } } | null)?.sisalto
    )?.ristiriita?.saanto;
    const perustelu = saanto ? RISTIRIITA_PERUSTELU[saanto] : undefined;
    await hyvaksyMuutosehdotus(id, KASITTELIJA, perustelu ? { perustelu } : undefined);
    console.log(`✓ ristiriita ${id} (${saanto ?? "?"})`);
  }

  // Verda Cloud Oy: Y-tunnus PRH:sta
  await hyvaksyMuutosehdotus("34d19db7-f1ad-4583-8118-95231f1e760b", KASITTELIJA);
  console.log("✓ ytj_havainto Verda Cloud");

  await hylkaaMuutosehdotus(
    "38b2c100-5971-460e-80f8-c569e0d52caa",
    KASITTELIJA,
    "PRH avoin YTJ ei kata tätä tunnusta; ei automaattista korjausta.",
  );
  console.log("⊘ ytj_havainto 3367058-8 hylätty");

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
