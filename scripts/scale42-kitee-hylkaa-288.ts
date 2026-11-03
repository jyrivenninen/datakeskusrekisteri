/**
 * Scale42 Kitee Puhos: hylkää kaava_ala_ha 288 (vuoden 2007 kaava).
 * Liittää PDF-liitteen hankkeen asiakirjoihin, jos se ei vielä ole.
 *
 * Aja: npx tsx scripts/scale42-kitee-hylkaa-288.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hylkaaMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const EHDOTUS_ID = "c8099a0f-9576-489f-95b5-ff517445384b";
const HANKE_ID = "9118093b-663b-47e1-8970-3aef182d27b8";
const PDF_URL =
  "https://dynastyjulkaisu.pohjoiskarjala.net/kitee/kokous/2025666-5-34500.PDF";
const KASITTELIJA = "ylläpito";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: ehdotus } = await sb
    .from("muutosehdotukset")
    .select("id, tila, lahde_url")
    .eq("id", EHDOTUS_ID)
    .maybeSingle();
  if (!ehdotus) {
    console.log("Ehdotusta ei löydy");
    return;
  }
  if (ehdotus.tila !== "odottaa") {
    console.log("Jo käsitelty:", ehdotus.tila);
    return;
  }

  const url = String(ehdotus.lahde_url ?? PDF_URL).trim();
  const { data: olemassa } = await sb
    .from("dokumentit")
    .select("id, otsikko, laji, muoto, hanke_id")
    .eq("url", url)
    .maybeSingle();

  if (!olemassa || olemassa.hanke_id !== HANKE_ID) {
    const otsikko =
      (olemassa?.otsikko && String(olemassa.otsikko).trim()) ||
      "Puhoksen/Suorlahden teollisuusalueen asemakaavaselostus (Kh 24.2.2025 §56 liite, voimassa oleva 2007)";
    const { error: rpcVirhe } = await sb.rpc("lisaa_hanke_dokumentti", {
      p_hanke_id: HANKE_ID,
      p_url: url,
      p_otsikko: otsikko.slice(0, 200),
      p_laji: olemassa?.laji ?? "muu",
      p_muoto: olemassa?.muoto ?? "pdf",
      p_lahde_url: url,
      p_kasittelija: KASITTELIJA,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    console.log("✓ PDF liitetty hankkeen asiakirjoihin");
  } else {
    console.log("PDF jo hankkeen asiakirjoissa:", olemassa.id);
  }

  await hylkaaMuutosehdotus(
    EHDOTUS_ID,
    KASITTELIJA,
    "288 ha on vuoden 2007 voimassa olevan asemakaavan ala, ei uuden asemakaavan suunnittelualue. Ei kelpaa kaava_ala_ha-kentälle; asiakirja jää hankkeen asiakirjoihin.",
  );
  console.log("✓ kaava_ala_ha 288 hylätty");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
