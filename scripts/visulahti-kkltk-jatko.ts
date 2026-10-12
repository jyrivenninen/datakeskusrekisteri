/**
 * Visulahti jatko: huomautussanamuoto, CNF rakentamis-huomautus,
 * FCDC vaihe-lähde (§16) + lainauksen_luonne=valmisteluteksti.
 *
 * Aja: npx tsx scripts/visulahti-kkltk-jatko.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const URL = "https://mikkeli.cloudnc.fi/fi-FI/content/81664/23";
const LAINAUS =
  "Visulahdessa asemakaava-alueella rakentamisluvan ovat saaneet 200 MW Compute Nordic Finland Oy:n 250 MW FCDC Corp Oy:n datakeskukset.";

const HUOMAUTUS_YHTEINEN =
  "Muutoslupa 491-2026-318 (250 MW:n datakeskus) koskee kiinteistöä 491-24-30-1, joka on vuokrattu Compute Nordic Finland Oy:lle (maankäyttöjohtajan päätös 23.5.2024 § 11). Kaupunkikehityslautakunta 17.2.2026 § 16 valmistelutekstissä todetaan, että FCDC Corp Oy:lle on myönnetty rakentamislupa 250 MW:n datakeskukselle. Lause on valmistelijoiden taustatekstiä rakennuskieltopäätöksessä. Asiakirjoista ei ilmene, miten nämä sopivat yhteen. Alkuperäisen luvan 491-2025-405 hakijaa ei ole selvitetty.";

const CNF_LISAYS =
  "Rakentamisen alkamista ei ole osoitettu viranomaislähteellä.";

const FCDC_ID = "ee7fe00f-41c3-4974-8a91-94b6b6f67916";
const CNF_ID = "894ec2a9-ed7e-4714-a0cd-077725198018";
const VAIHE_EHDOTUS = "51c78e89-8556-4f8a-8a9f-6bb44d2c62ea";

async function julkaiseHuomautus(
  sb: ReturnType<typeof createClient>,
  hankeId: string,
  teksti: string,
  kuiva: boolean,
) {
  const { data: hanke } = await sb
    .from("hankkeet")
    .select("nimi, huomautus")
    .eq("id", hankeId)
    .single();
  const nimi = hanke?.nimi ?? hankeId;
  if ((hanke?.huomautus ?? "").includes("valmistelutekstissä todetaan")) {
    if (
      hankeId === CNF_ID &&
      !(hanke?.huomautus ?? "").includes("Rakentamisen alkamista ei ole")
    ) {
      // jatka — CNF tarvitsee vielä rakentamis-lisän
    } else {
      console.log("huomautus jo ajan tasalla", nimi);
      return;
    }
  }
  if (kuiva) {
    console.log("[kuiva] huomautus", nimi, teksti.slice(0, 80));
    return;
  }
  const { data: ehdotus, error } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "taydennys",
      hanke_id: hankeId,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: "visulahti_kkltk_jatko_huomautus",
      lahde_url: URL,
      tila: "odottaa",
      huomautus: "Pilkku puuttuu alkuperäisestä lainauksesta (200 MW … Oy:n 250 MW).",
      sisalto: {
        huomio: "hanke-huomautus",
        kentat: {
          huomautus: {
            arvo: teksti,
            lahde_url: URL,
            lahde_laji: "html",
            luottamus: "epavarma",
            lainaus: LAINAUS,
            vahvistettu_pvm: "2026-02-17",
          },
        },
      },
    })
    .select("id")
    .single();
  if (error || !ehdotus) throw new Error(error?.message ?? "huomautus-insert");
  await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
  console.log("huomautus julkaistu", nimi);
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1) Hyväksy FCDC vaihe-ehdotus (arvo ennallaan lupamenettely) → lähderivä
  const { data: ehdotus } = await sb
    .from("muutosehdotukset")
    .select("id, tila")
    .eq("id", VAIHE_EHDOTUS)
    .maybeSingle();
  if (!ehdotus) {
    console.log("vaihe-ehdotus puuttuu", VAIHE_EHDOTUS);
  } else if (ehdotus.tila === "odottaa" && !kuiva) {
    await hyvaksyMuutosehdotus(VAIHE_EHDOTUS, KASITTELIJA);
    console.log("vaihe-ehdotus hyväksytty");
  } else {
    console.log("vaihe-ehdotus", ehdotus.tila);
  }

  // 2) Merkitse §16-vaihe-lähde valmistelutekstiksi
  const { data: lahde } = await sb
    .from("kentta_lahteet")
    .select("id")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", FCDC_ID)
    .eq("kentta", "vaihe")
    .eq("lahde_url", URL)
    .neq("tila", "korvattu")
    .maybeSingle();
  if (lahde && !kuiva) {
    const { data: n, error } = await sb.rpc("aseta_lahde_lainauksen_luonne", {
      p_lahde_id: lahde.id,
      p_luonne: "valmisteluteksti",
    });
    if (error) throw new Error(error.message);
    console.log("lainauksen_luonne=valmisteluteksti", lahde.id, n);
  } else if (!lahde) {
    console.log("§16 vaihe-lähderivää ei vielä löytynyt");
  }

  // 3) Huomautukset
  await julkaiseHuomautus(sb, FCDC_ID, HUOMAUTUS_YHTEINEN, kuiva);
  await julkaiseHuomautus(
    sb,
    CNF_ID,
    `${HUOMAUTUS_YHTEINEN} ${CNF_LISAYS}`,
    kuiva,
  );

  const { data: loppu } = await sb
    .from("hankkeet")
    .select("nimi, vaihe, teho_mw, it_teho_mw, huomautus")
    .in("id", [FCDC_ID, CNF_ID]);
  console.log(JSON.stringify(loppu, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
