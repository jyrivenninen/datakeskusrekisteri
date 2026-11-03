/**
 * Hyperco Kouvola-Voikkaa, lupa 286-2026-171:
 * 1) Hylkää pinta_ala_ha 375448 (yksikkö puuttuu; asiakirja jää hankkeelle)
 * 2) Ehdota 5,8 ha jos puuttuu (ei korvaa Ylen 21 ha)
 * 3) Ehdota polttoainevarasto 600 m3
 * 4) Huomautus: lupa liitetty paikan perusteella, hakija Redeve Oy
 *
 * Aja: npx tsx scripts/kouvola-voikkaa-lupapäätös-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hylkaaMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const HANKE_ID = "d92e39ef-2054-4ecb-9e5c-24eea5a3e9ed";
const EHDOTUS_375448 = "f9ae3030-8cdb-4b45-ba30-e30caee3fcda";
const PDF_URL = "https://ep10.kouvola.fi/kokous/20261369-7-158386.PDF";
const KASITTELIJA = "ylläpito";
const TANAAN = new Date().toISOString().slice(0, 10);

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1) Hylkää 375448 + liitä asiakirja hankkeelle
  console.log("1) Hylätään pinta_ala_ha 375448…");
  const { data: olemassaDok } = await sb
    .from("dokumentit")
    .select("id, otsikko, laji, muoto")
    .eq("url", PDF_URL)
    .maybeSingle();
  const { error: dokVirhe } = await sb.rpc("lisaa_hanke_dokumentti", {
    p_hanke_id: HANKE_ID,
    p_url: PDF_URL,
    p_otsikko: (
      olemassaDok?.otsikko ||
      "Rakentamislupapäätös 286-2026-171 (liite, lupajaosto 2.6.2026 §52)"
    ).slice(0, 200),
    p_laji: olemassaDok?.laji || "muu",
    p_muoto: olemassaDok?.muoto || "pdf",
    p_lahde_url: PDF_URL,
    p_kasittelija: KASITTELIJA,
  });
  if (dokVirhe) console.log("  dokumentti:", dokVirhe.message);
  else console.log("  ✓ asiakirja hankkeella");

  await hylkaaMuutosehdotus(
    EHDOTUS_375448,
    KASITTELIJA,
    "Yksikkö puuttuu asiakirjasta (375448.0 ei tulkita hehtaareiksi). Asiakirja liitetty hankkeen asiakirjoihin, ei kentän lähteeksi.",
  );
  console.log("  ✓ ehdotus hylätty");

  // 2) 5,8 ha — onko jo jonossa?
  const { data: jono } = await sb
    .from("muutosehdotukset")
    .select("id, tila, sisalto")
    .eq("hanke_id", HANKE_ID)
    .eq("tila", "odottaa");
  const on58 = (jono ?? []).some((r) => {
    const arvo = (r.sisalto as { kentat?: Record<string, { arvo?: string }> })
      ?.kentat?.pinta_ala_ha?.arvo;
    return arvo === "5.8" || arvo === "5,8";
  });
  if (on58) {
    console.log("2) 5,8 ha -ehdotus on jo jonossa — ei uutta");
  } else {
    const { error } = await sb.from("muutosehdotukset").insert({
      tyyppi: "taydennys",
      hanke_id: HANKE_ID,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: PDF_URL,
      huomautus:
        "Ei korvaa automaattisesti Ylen 21 ha:a — eri suure/vaihe, ratkaisu käsin.",
      sisalto: {
        kentat: {
          pinta_ala_ha: {
            arvo: "5.8",
            yksikko: "ha",
            lahde_url: PDF_URL,
            lahde_sivu: 3,
            lahde_laji: "dokumentti",
            luottamus: "epavarma",
            lainaus:
              "noin 5,8 ha kokoinen osuus muodostettavaksi tontiksi datakeskuksen käyttöön",
          },
        },
        lahdeselvitys13: {
          era: 2,
          osa: "poikkeama",
          kentta: "pinta_ala_ha",
          rekisterin_arvo: "21",
          asiakirjan_arvo: "5.8 ha (tonttiosuus)",
          asiakirjan_nimi:
            "Rakentamislupapäätös 286-2026-171 (lupajaosto 2.6.2026 §52)",
          sivu: "3/6",
          lainaus:
            "noin 5,8 ha kokoinen osuus muodostettavaksi tontiksi datakeskuksen käyttöön",
          huomio:
            "Rekisterissä 21 ha (Yle). 5,8 ha on lupapäätöksen tonttiosuus — eri suure; älä korvaa automaattisesti.",
          poikkeaa_rekisterista: true,
          ratkaisuvaihtoehdot: [
            "asiakirja vahvistaa nykyisen arvon eri sanamuodolla",
            "arvo korjataan asiakirjan mukaiseksi, vanha lähde korvatuksi",
            "lähteet tarkoittavat eri asiaa, uutta lähdettä ei liitetä kentälle",
            "lähteet tarkoittavat eri asiaa; uusi lähde liitetään hankkeen asiakirjoihin, ei kentän lähteeksi",
            "lähteet ovat ristiriidassa, luottamus ristiriitaiseksi",
          ],
        },
      },
    });
    if (error) console.log("2) 5,8 ha virhe:", error.message);
    else console.log("2) ✓ 5,8 ha -ehdotus luotu (Ylen 21 ha säilyy kunnes käsin)");
  }

  // 3) Polttoainevarasto 600 m3
  const onPoltto = (jono ?? []).some((r) => {
    const k = (r.sisalto as { kentat?: Record<string, unknown> })?.kentat;
    return Boolean(k?.polttoainevarasto_maara);
  });
  if (onPoltto) {
    console.log("3) polttoainevarasto jo jonossa");
  } else {
    const { error } = await sb.from("muutosehdotukset").insert({
      tyyppi: "taydennys",
      hanke_id: HANKE_ID,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: PDF_URL,
      huomautus:
        "40 varavoimamoduulia à 15 m³; ei merkitty generaattoreiksi (asiakirja ei sano generaattoria).",
      sisalto: {
        kentat: {
          polttoainevarasto_maara: {
            arvo: "600",
            yksikko: "m3",
            lahde_url: PDF_URL,
            lahde_sivu: 1,
            lahde_laji: "dokumentti",
            luottamus: "epavarma",
            lainaus:
              "600 m³ polttoainevarasto; 40 varavoimamoduulia, kussakin 15 m³",
          },
          polttoainevarasto_yksikko: {
            arvo: "m3",
            lahde_url: PDF_URL,
            lahde_sivu: 1,
            lahde_laji: "dokumentti",
            luottamus: "epavarma",
            lainaus:
              "600 m³ polttoainevarasto; 40 varavoimamoduulia, kussakin 15 m³",
          },
        },
      },
    });
    if (error) console.log("3) polttoaine virhe:", error.message);
    else console.log("3) ✓ polttoainevarasto 600 m3 -ehdotus");
  }

  // 4) Huomautus Redeve / paikkakohdistus
  const huomTeksti =
    "Rakentamislupa 286-2026-171 (Redeve Oy) on liitetty hankkeeseen paikan perusteella. Asiakirja ei mainitse Hypercoa; hakija on Redeve Oy.";
  const { data: hanke } = await sb
    .from("hankkeet")
    .select("huomautus")
    .eq("id", HANKE_ID)
    .single();
  const vanha = (hanke?.huomautus ?? "").trim();
  if (vanha.includes("286-2026-171") && vanha.includes("Redeve")) {
    console.log("4) huomautus jo olemassa");
  } else {
    const uusiHuom = vanha ? `${vanha}\n\n${huomTeksti}` : huomTeksti;
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
              arvo: uusiHuom,
              lahde_url: PDF_URL,
              lahde_sivu: 1,
              lahde_laji: "dokumentti",
              luottamus: "epavarma",
              lainaus:
                "Redeve Oy on jättänyt lupahakemuksen; rakennuspaikka Voikkaa. Hypercoa ei mainita.",
            },
          },
        },
      })
      .select("id")
      .single();
    if (iVirhe || !ehdotus) {
      console.log("4) huomautus-ehdotus virhe:", iVirhe?.message);
    } else {
      const { error: rpcVirhe } = await sb.rpc("julkaise_hanke_huomautus", {
        p_ehdotus_id: ehdotus.id,
        p_kasittelija: KASITTELIJA,
      });
      if (rpcVirhe) console.log("4) julkaise_hanke_huomautus:", rpcVirhe.message);
      else console.log("4) ✓ huomautus julkaistu");
    }
  }

  console.log("Valmis", TANAAN);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
