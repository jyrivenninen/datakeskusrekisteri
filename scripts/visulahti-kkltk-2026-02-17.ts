/**
 * Visulahti: Kaupunkikehityslautakunta 17.2.2026 § 16
 * - FCDC: ehdotus vaihe-lähteeksi (lupamenettely)
 * - Molemmat: julkinen huomautus ristiriidasta (250 MW / CNF)
 * - Ei teho_mw-lähdettä, ei Compute Nordic vaihe-liitosta
 *
 * Aja: npx tsx scripts/visulahti-kkltk-2026-02-17.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const TUN_VAIHE = "visulahti_kkltk_2026_02_17_vaihe";
const TUN_HUOM = "visulahti_kkltk_2026_02_17_huomautus";

const URL = "https://mikkeli.cloudnc.fi/fi-FI/content/81664/23";
const OTSikko =
  "Kaupunkikehityslautakunta 17.2.2026 § 16: Rakennuskiellon määrääminen Mikkelin 1. vaiheen yleiskaavan laatimiseksi";

/** Sanatarkka lainaus; pilkku puuttuu alkuperäisestä (200 MW … Oy:n 250 MW). */
const LAINAUS =
  "Visulahdessa asemakaava-alueella rakentamisluvan ovat saaneet 200 MW Compute Nordic Finland Oy:n 250 MW FCDC Corp Oy:n datakeskukset.";

const HUOMAUTUS =
  "Muutoslupa 491-2026-318 (250 MW:n datakeskus) koskee kiinteistöä 491-24-30-1, joka on vuokrattu Compute Nordic Finland Oy:lle (maankäyttöjohtajan päätös 23.5.2024 § 11). Kaupunkikehityslautakunta 17.2.2026 § 16 yhdistää 250 MW:n FCDC Corp Oy:öön. Asiakirjoista ei ilmene, miten nämä sopivat yhteen. Alkuperäisen luvan 491-2025-405 hakijaa ei ole selvitetty.";

const FCDC_ID = "ee7fe00f-41c3-4974-8a91-94b6b6f67916";
const CNF_ID = "894ec2a9-ed7e-4714-a0cd-077725198018";

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1) Asiakirja FCDC:lle (CNF saa URL:n huomautus-/kenttälähteen kautta)
  if (!kuiva) {
    const { data: docId, error: docVirhe } = await sb.rpc("lisaa_hanke_dokumentti", {
      p_hanke_id: FCDC_ID,
      p_url: URL,
      p_otsikko: OTSikko,
      p_laji: "muu",
      p_muoto: "html",
      p_lahde_url: URL,
      p_kasittelija: KASITTELIJA,
    });
    if (docVirhe) console.log("dokumentti:", docVirhe.message);
    else console.log("dokumentti ok", docId);

    // Metatiedot: päätös / sitova
    if (docId) {
      const { error: metaVirhe } = await sb.rpc(
        "julkaise_dokumentti_lahde_metatiedot",
        {
          p_dokumentti_id: docId,
          p_lahde_tyyppi: "paatos",
          p_sitovuustaso: "sitova",
          p_otsikko: OTSikko,
          p_ehdotus_id: null,
          p_kasittelija: KASITTELIJA,
        },
      );
      if (metaVirhe) console.log("metatiedot:", metaVirhe.message);
      else console.log("metatiedot paatos/sitova");
    }
  } else {
    console.log("[kuiva] dokumentti", URL);
  }

  // 2) FCDC vaihe-ehdotus (jää odottaa — ei automaattihyväksyntää)
  const { data: vaiheJonossa } = await sb
    .from("muutosehdotukset")
    .select("id, tila")
    .eq("ehdottaja_tunniste", TUN_VAIHE)
    .eq("hanke_id", FCDC_ID)
    .in("tila", ["odottaa", "hyvaksytty"])
    .maybeSingle();

  if (vaiheJonossa) {
    console.log("vaihe-ehdotus jo", vaiheJonossa.tila, vaiheJonossa.id);
  } else if (!kuiva) {
    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "taydennys",
        hanke_id: FCDC_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: TUN_VAIHE,
        lahde_url: URL,
        tila: "odottaa",
        huomautus:
          "Kaupunkikehityslautakunta 17.2.2026 § 16: päätös koskee rakennuskieltoa (akkuvarastot). " +
          "Lainaus on valmistelijan taustatekstiä «Näkymät Visulahden alueella» -osiossa, ei päätöslauselmaa. " +
          "Valmistelijat: Ilkka Tarkkanen, Topiantti Äikäs. Esittelijä: Jouni Riihelä. " +
          "Pilkku puuttuu alkuperäisestä lainauksesta (200 MW … Oy:n 250 MW).",
        sisalto: {
          kentat: {
            vaihe: {
              arvo: "lupamenettely",
              lahde_url: URL,
              lahde_laji: "html",
              lainaus: LAINAUS,
              luottamus: "epavarma",
              merkitty: "koneen_ehdottama",
            },
          },
          lahde_kuvaus:
            "Päätös: rakennuskielto 2 MW+ akkuenergiavarastoille. Maininta datakeskusten " +
            "rakentamisluvista on valmistelutekstiä (taustakuvaus), ei pykälän päätösosaa.",
        },
      })
      .select("id")
      .single();
    if (error || !ehdotus) throw new Error(error?.message ?? "vaihe-insert");
    console.log("vaihe-ehdotus odottaa", ehdotus.id);
  } else {
    console.log("[kuiva] vaihe-ehdotus FCDC");
  }

  // 3) Huomautus molempiin hankkeisiin
  for (const hankeId of [FCDC_ID, CNF_ID]) {
    const { data: hanke } = await sb
      .from("hankkeet")
      .select("nimi, huomautus")
      .eq("id", hankeId)
      .single();
    const nimi = hanke?.nimi ?? hankeId;
    const vanha = (hanke?.huomautus ?? "").trim();
    if (vanha.includes("491-2026-318") && vanha.includes("17.2.2026 § 16")) {
      console.log("huomautus jo", nimi);
      continue;
    }
    const uusi = vanha ? `${vanha}\n\n${HUOMAUTUS}` : HUOMAUTUS;
    if (kuiva) {
      console.log("[kuiva] huomautus", nimi);
      continue;
    }
    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "taydennys",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: TUN_HUOM,
        lahde_url: URL,
        tila: "odottaa",
        huomautus:
          "Pilkku puuttuu alkuperäisestä lainauksesta (200 MW … Oy:n 250 MW).",
        sisalto: {
          huomio: "hanke-huomautus",
          kentat: {
            huomautus: {
              arvo: uusi,
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
    if (error || !ehdotus) {
      console.log("huomautus-insert", nimi, error?.message);
      continue;
    }
    await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
    console.log("huomautus julkaistu", nimi);
  }

  const { data: loppu } = await sb
    .from("hankkeet")
    .select("id, nimi, vaihe, teho_mw, it_teho_mw, huomautus")
    .in("id", [FCDC_ID, CNF_ID]);
  console.log(JSON.stringify(loppu, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
