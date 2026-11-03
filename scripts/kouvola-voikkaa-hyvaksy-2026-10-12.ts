/**
 * Kouvola-Voikkaa:
 * - hylkää k-m²-ehdotus 29804
 * - hyväksy polttoainevarasto 600 m3 (vaihtoehtona VE1)
 * - ehdota + hyväksy generaattorit_lkm = 40 (epavarma)
 * - päivitä hankkeen huomautus
 *
 * Aja: npx tsx scripts/kouvola-voikkaa-hyvaksy-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hyvaksyMuutosehdotus,
  hylkaaMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const HANKE_ID = "d92e39ef-2054-4ecb-9e5c-24eea5a3e9ed";
const POLTTO_ID = "704ca6cf-d18a-4773-85f7-cba62b5559ca";
const KM2_ID = "c7bd12a1-b7fb-44ac-a955-2e0a5c2998bf";
const PDF_URL = "https://ep10.kouvola.fi/kokous/20261369-7-158386.PDF";
const KASITTELIJA = "ylläpito";

const LAINAUS_A =
  "Piha-alueelle sijoitetaan 40 kpl varavoimamoduuleita, joissa kussakin on oma 15 m3:n polttoainesäiliönsä";
const LAINAUS_B =
  "Generattoreiden ja niiden päälle sijoittuvien teräsritilätasojen laajuudet muuttuneet.";
const LAINAUS_C = "Generaattoreiden piiput ja jäähdytystornit esitetty.";
const LAINAUS_POLTTO =
  "600 m³ polttoainevarasto; 40 varavoimamoduulia, kussakin 15 m³";

const HUOMAUTUS_GEN =
  "Asiakirja kertoo 40 varavoimamoduulia, joissa kussakin oma 15 m3:n säiliö, ja käyttää samoista tasoista sekä sanaa moduuli että generaattori. Generaattorien lukumäärää ei sanota suoraan; luku 40 olettaa yhden generaattorin moduulia kohti.";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1) Hylkää k-m²
  console.log("1) Hylätään k-m² 29804…");
  const { data: km2 } = await sb
    .from("muutosehdotukset")
    .select("id, tila")
    .eq("id", KM2_ID)
    .maybeSingle();
  if (!km2) {
    console.log("  ei löydy");
  } else if (km2.tila !== "odottaa") {
    console.log("  jo käsitelty:", km2.tila);
  } else {
    await hylkaaMuutosehdotus(
      KM2_ID,
      KASITTELIJA,
      "Lainaus on kerrosalaa (k-m² / rakennusoikeus), ei maa-alaa. Ei kelpaa pinta_ala_ha-kentälle.",
    );
    console.log("  ✓ hylätty");
  }

  // 2) Polttoainevarasto → VE1 (kenttä on vain vaihtoehdolla)
  console.log("2) Hyväksytään polttoainevarasto 600 m3 (VE1)…");
  const { data: poltto } = await sb
    .from("muutosehdotukset")
    .select("id, tila, sisalto")
    .eq("id", POLTTO_ID)
    .maybeSingle();
  if (!poltto) {
    console.log("  ei löydy");
  } else if (poltto.tila !== "odottaa") {
    console.log("  jo käsitelty:", poltto.tila);
  } else {
    const { error: paivVirhe } = await sb
      .from("muutosehdotukset")
      .update({
        sisalto: {
          huomio: "polttoainevarasto",
          kentat: {},
          vaihtoehdot: {
            VE1: {
              polttoainevarasto_maara: {
                arvo: "600",
                yksikko: "m3",
                lahde_url: PDF_URL,
                lahde_sivu: 1,
                lahde_laji: "dokumentti",
                luottamus: "epavarma",
                lainaus: LAINAUS_POLTTO,
              },
              polttoainevarasto_yksikko: {
                arvo: "m3",
                lahde_url: PDF_URL,
                lahde_sivu: 1,
                lahde_laji: "dokumentti",
                luottamus: "epavarma",
                lainaus: LAINAUS_POLTTO,
              },
            },
          },
        },
      })
      .eq("id", POLTTO_ID)
      .eq("tila", "odottaa");
    if (paivVirhe) throw new Error(paivVirhe.message);
    await hyvaksyMuutosehdotus(POLTTO_ID, KASITTELIJA);
    console.log("  ✓ hyväksytty VE1: 600 m3");
  }

  // 3) Generaattorit_lkm = 40
  console.log("3) Generaattorit_lkm = 40…");
  const { data: genEhdotus, error: gVirhe } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "taydennys",
      hanke_id: HANKE_ID,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: PDF_URL,
      huomautus:
        "40 varavoimamoduulia; asiakirja käyttää samoista tasoista sekä sanaa moduuli että generaattori.",
      sisalto: {
        kentat: {
          generaattorit_lkm: {
            arvo: "40",
            lahde_url: PDF_URL,
            lahde_sivu: 1,
            lahde_laji: "dokumentti",
            luottamus: "epavarma",
            lainaus: LAINAUS_A,
            lisalahteet: [
              {
                lahde_url: PDF_URL,
                lahde_sivu: 2,
                lahde_laji: "dokumentti",
                luottamus: "epavarma",
                lainaus: LAINAUS_B,
              },
              {
                lahde_url: PDF_URL,
                lahde_sivu: 3,
                lahde_laji: "dokumentti",
                luottamus: "epavarma",
                lainaus: LAINAUS_C,
              },
            ],
          },
        },
      },
    })
    .select("id")
    .single();
  if (gVirhe || !genEhdotus) {
    console.log("  insert:", gVirhe?.message);
  } else {
    await hyvaksyMuutosehdotus(genEhdotus.id, KASITTELIJA);
    console.log("  ✓ generaattorit_lkm 40 hyväksytty", genEhdotus.id);
  }

  // 4) Huomautus — korvaa vanha generaattori-fraasi tai lisää
  console.log("4) Päivitetään hankkeen huomautus…");
  const { data: hanke } = await sb
    .from("hankkeet")
    .select("huomautus")
    .eq("id", HANKE_ID)
    .single();
  const vanha = (hanke?.huomautus ?? "").trim();
  let huom = vanha;
  const vanhaFraasi =
    "ei merkitty generaattoreiksi (asiakirja ei sano generaattoria)";
  if (huom.includes(vanhaFraasi)) {
    huom = huom.replace(vanhaFraasi, HUOMAUTUS_GEN);
  } else if (!huom.includes("varavoimamoduulia")) {
    huom = huom ? `${huom}\n\n${HUOMAUTUS_GEN}` : HUOMAUTUS_GEN;
  } else if (!huom.includes("yhden generaattorin moduulia kohti")) {
    // vanha tekstiversio — korvaa kokonaan gen-osa
    huom = `${huom}\n\n${HUOMAUTUS_GEN}`;
  }

  // Poista myös jonossa olleen polttoaine-ehdotuksen vanha huomautusfraasi hankkeelta
  // (se oli ehdotuksen huomautus, ei hankkeen — tarkista silti)
  if (huom !== vanha) {
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
              lahde_sivu: 1,
              lahde_laji: "dokumentti",
              luottamus: "epavarma",
              lainaus: LAINAUS_A,
            },
          },
        },
      })
      .select("id")
      .single();
    if (iVirhe || !ehdotus) {
      console.log("  insert:", iVirhe?.message);
    } else {
      await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
      console.log("  ✓ huomautus päivitetty");
    }
  } else {
    console.log("  huomautus jo ajan tasalla");
  }

  // Varmistus
  const { data: loppu } = await sb
    .from("hankkeet")
    .select("generaattorit_lkm, huomautus")
    .eq("id", HANKE_ID)
    .single();
  const { data: ve } = await sb
    .from("hanke_vaihtoehdot")
    .select("tunnus, polttoainevarasto_maara, polttoainevarasto_yksikko")
    .eq("hanke_id", HANKE_ID);
  const { data: genLahteet } = await sb
    .from("kentta_lahteet")
    .select("lahde_sivu, luottamus, lainaus, merkitty")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", HANKE_ID)
    .eq("kentta", "generaattorit_lkm")
    .neq("tila", "korvattu");

  console.log(
    JSON.stringify(
      {
        generaattorit_lkm: loppu?.generaattorit_lkm,
        huomautus: loppu?.huomautus,
        vaihtoehdot: ve,
        generaattori_lahteet: genLahteet,
      },
      null,
      2,
    ),
  );
  console.log("Valmis");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
