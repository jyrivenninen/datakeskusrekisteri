/**
 * Korjaa jo julkaistujen dokumenttien otsikoita (lahde_metatiedot RPC).
 * Aja: npx tsx scripts/korjaa-lahde-otsikot.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const KASITTELIJA = "agentti:korjaa-lahde-otsikot";

const KORJAUKSET: Array<{ url: string; otsikko: string }> = [
  {
    url: "https://www.sievi.fi/ajankohtaista/datakeskuksesta-kaavoitusaloite",
    otsikko: "Datakeskuksesta kaavoitusaloite",
  },
  {
    url: "https://mikseimikkeli.fi/mikkeli-hakee-kasvua-datakeskusinvestoinneista/",
    otsikko: "Mikkeli hakee kasvua datakeskusinvestoinneista",
  },
  {
    url: "https://www.fortum.com/fi/media/2023/05/fortum-ja-equinix-yhteistyohon-equinixin-datakeskusten-hukkalampoa-hyodynnetaan-fortumin-kaukolampoverkossa",
    otsikko:
      "Fortum ja Equinix yhteistyöhön – Equinixin datakeskusten hukkalämpöä hyödynnetään Fortumin kaukolämpöverkossa",
  },
  {
    url: "https://www.equinix.com/data-centers/europe-colocation/finland-colocation/helsinki-data-centers/he3",
    otsikko: "Equinix HE3 Helsinki (datakeskukset)",
  },
];

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  for (const k of KORJAUKSET) {
    const { data: dok } = await sb.from("dokumentit").select("id, lahde_tyyppi, sitovuustaso").eq("url", k.url).maybeSingle();
    if (!dok) {
      console.warn("Ei dokumenttia:", k.url);
      continue;
    }
    if (!kuiva) {
      const { error } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
        p_dokumentti_id: dok.id,
        p_lahde_tyyppi: dok.lahde_tyyppi,
        p_sitovuustaso: dok.sitovuustaso,
        p_otsikko: k.otsikko,
        p_ehdotus_id: null,
        p_kasittelija: KASITTELIJA,
      });
      if (error) throw new Error(error.message);
    }
    console.log("Korjattu:", k.otsikko);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
