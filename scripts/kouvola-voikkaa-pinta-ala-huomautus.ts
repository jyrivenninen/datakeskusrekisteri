/**
 * Kouvola-Voikkaa: lisää pinta-alaselvitys hankkeen huomautukseen.
 * Ei muuta pinta_ala_ha-kenttää eikä kirjaa Novagen/Hyperco-medianväitettä.
 *
 * Aja: npx tsx scripts/kouvola-voikkaa-pinta-ala-huomautus.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const HANKE_ID = "d92e39ef-2054-4ecb-9e5c-24eea5a3e9ed";
const PDF_URL = "https://ep10.kouvola.fi/kokous/20261369-7-158386.PDF";
const KASITTELIJA = "ylläpito";

const ALA_SELVITYS =
  "Pinta-ala: 21 ha on Ylen (10.3.2026) mukaan Redeven esisopimuksen kohteena olevan alueen koko (kiinteistökauppa), ei datakeskuksen tontti. Lupapäätös 286-2026-171 s. 3/6: tontista 106-33 lohkotaan noin 5,8 ha datakeskuksen tontiksi; muodostus vireillä. Päivitetään, kun tontti on muodostettu.";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: hanke, error } = await sb
    .from("hankkeet")
    .select("huomautus")
    .eq("id", HANKE_ID)
    .single();
  if (error || !hanke) throw new Error(error?.message ?? "ei hanketta");

  const vanha = (hanke.huomautus ?? "").trim();
  if (vanha.includes("5,8 ha datakeskuksen tontiksi")) {
    console.log("Huomautus sisältää jo pinta-alaselvityksen");
    console.log(vanha);
    return;
  }

  const huom = vanha ? `${vanha}\n\n${ALA_SELVITYS}` : ALA_SELVITYS;

  const { data: ehdotus, error: iVirhe } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "taydennys",
      hanke_id: HANKE_ID,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: PDF_URL,
      sisalto: {
        huomio: "hanke-huomautus",
        kentat: {
          huomautus: {
            arvo: huom,
            lahde_url: PDF_URL,
            lahde_sivu: 3,
            lahde_laji: "dokumentti",
            luottamus: "epavarma",
            lainaus:
              "noin 5,8 ha kokoinen osuus muodostettavaksi tontiksi datakeskuksen käyttöön",
          },
        },
      },
    })
    .select("id")
    .single();
  if (iVirhe || !ehdotus) throw new Error(iVirhe?.message ?? "insert epäonnistui");

  await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);

  const { data: loppu } = await sb
    .from("hankkeet")
    .select("huomautus, pinta_ala_ha")
    .eq("id", HANKE_ID)
    .single();
  console.log(JSON.stringify(loppu, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
