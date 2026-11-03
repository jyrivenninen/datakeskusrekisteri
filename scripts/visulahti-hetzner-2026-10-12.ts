/**
 * Visulahti teho-huomautus + Yle tukilähde; Hetzner tehojen tyhjennys.
 * Aja: npx tsx scripts/visulahti-hetzner-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const CNF_ID = "894ec2a9-ed7e-4714-a0cd-077725198018";
const HETZNER_ID = "fc052519-52df-4abc-89e8-78e131177693";
const YLE_URL = "https://yle.fi/a/74-20244279";
const KKLTK_URL = "https://mikkeli.cloudnc.fi/fi-FI/content/81664/23";
const KAUPPALEHTI_URL =
  "https://www.kauppalehti.fi/uutiset/a/ecf8c7b2-cc43-40ba-b381-c27d026d3cd4";
const HETZNER_DOCS =
  "https://docs.hetzner.com/general/infrastructure-and-availability/data-centers-and-connection/";

const FCDC =
  "Muutoslupa 491-2026-318 (250 MW:n datakeskus) koskee kiinteistöä 491-24-30-1, joka on vuokrattu Compute Nordic Finland Oy:lle (maankäyttöjohtajan päätös 23.5.2024 § 11). Kaupunkikehityslautakunta 17.2.2026 § 16 valmistelutekstissä todetaan, että FCDC Corp Oy:lle on myönnetty rakentamislupa 250 MW:n datakeskukselle. Lause on valmistelijoiden taustatekstiä rakennuskieltopäätöksessä. Asiakirjoista ei ilmene, miten nämä sopivat yhteen. Alkuperäisen luvan 491-2025-405 hakijaa ei ole selvitetty. Rakentamisen alkamista ei ole osoitettu viranomaislähteellä.";

const TEHO =
  "Teho: Kauppalehti («165 megawatin it-kapasiteettiin») on it_teho_mw-lähde; Yle («165 megawatin datakeskus») on erittelemätön tukilähde samalle 165 MW:lle (ei it_teho_mw-lähteenä). Lehtitiedoissa 165 MW (IT) ja 200 MW (kokonaisuus). Mikkelin kaupunkikehityslautakunnan pöytäkirjassa 17.2.2026 (§ 16) 200 MW, erittelemätön, kuvataan maksimikapasiteetiksi; mikseimikkeli («200 megawatin kokonaisuutta») vain huomautuksessa, ei kummankaan teho-kentän lähteenä.";

const HUOMAUTUS = `${FCDC}\n\n${TEHO}`;

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  {
    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "taydennys",
        hanke_id: CNF_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: KAUPPALEHTI_URL,
        sisalto: {
          huomio: "hanke-huomautus",
          kentat: {
            huomautus: {
              arvo: HUOMAUTUS,
              lahde_url: KAUPPALEHTI_URL,
              lahde_laji: "html",
              luottamus: "epavarma",
              lainaus: "165 megawatin it-kapasiteettiin",
              merkitty: "ihmisen_vahvistama",
            },
          },
        },
      })
      .select("id")
      .single();
    if (error || !ehdotus) throw new Error(error?.message ?? "visulahti huomautus");
    await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
    console.log("Visulahti huomautus OK", ehdotus.id);
  }

  {
    const { data: olemassa } = await sb
      .from("kentta_lahteet")
      .select("id")
      .eq("rivi_id", CNF_ID)
      .eq("kentta", "huomautus")
      .eq("lahde_url", YLE_URL)
      .eq("tila", "voimassa")
      .maybeSingle();
    if (olemassa) {
      console.log("Yle huomautus-lähde jo", olemassa.id);
    } else {
      const { data: ehdotus, error } = await sb
        .from("muutosehdotukset")
        .insert({
          tyyppi: "taydennys",
          hanke_id: CNF_ID,
          ehdottaja_tyyppi: "yllapitaja",
          ehdottaja_tunniste: KASITTELIJA,
          tila: "odottaa",
          lahde_url: YLE_URL,
          sisalto: {
            huomio: "hanke-huomautus",
            kentat: {
              huomautus: {
                arvo: HUOMAUTUS,
                lahde_url: YLE_URL,
                lahde_laji: "html",
                luottamus: "epavarma",
                lainaus:
                  "165 megawatin datakeskus (erittelemätön tukilähde 165 MW:lle; ei it_teho_mw-lähde)",
                merkitty: "ihmisen_vahvistama",
              },
            },
          },
        })
        .select("id")
        .single();
      if (error || !ehdotus) throw new Error(error?.message ?? "yle tukilahde");
      await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
      console.log("Yle tukilähde OK", ehdotus.id);
    }
  }

  {
    const { data: kk } = await sb
      .from("kentta_lahteet")
      .select("id, lainaus")
      .eq("rivi_id", CNF_ID)
      .eq("kentta", "huomautus")
      .eq("lahde_url", KKLTK_URL)
      .eq("tila", "voimassa")
      .maybeSingle();
    console.log(
      "KKLTK huomautus-lähde:",
      kk ? `${kk.id} · ${(kk.lainaus ?? "").slice(0, 100)}` : "puuttuu",
    );
  }

  for (const kentta of ["teho_mw", "it_teho_mw"] as const) {
    const { data: h } = await sb
      .from("hankkeet")
      .select("teho_mw, it_teho_mw")
      .eq("id", HETZNER_ID)
      .single();
    const arvo = kentta === "teho_mw" ? h?.teho_mw : h?.it_teho_mw;
    if (arvo == null) {
      console.log("Hetzner jo tyhjä", kentta);
      continue;
    }
    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "kentta_tyhjennys",
        hanke_id: HETZNER_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: HETZNER_DOCS,
        sisalto: {
          tyhjennys: {
            taulu: "hankkeet",
            kentta,
            perustelu:
              "Aiempi 12 MW oli laskettu (10 × 1,2 MW), ei sellaisenaan lainattu luku. Tyhjennys; parempaa lähdettä haetaan.",
            lainaus:
              "Aiempi 12 MW oli laskettu (10 × 1,2 MW), ei sellaisenaan lainattu luku.",
            lahde_url: HETZNER_DOCS,
          },
        },
      })
      .select("id")
      .single();
    if (error || !ehdotus) throw new Error(error?.message ?? `hetzner ${kentta}`);
    await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
    console.log("Hetzner tyhjennetty", kentta, ehdotus.id);
  }

  const { data: cnf } = await sb
    .from("hankkeet")
    .select("huomautus, teho_mw, it_teho_mw")
    .eq("id", CNF_ID)
    .single();
  const { data: hetz } = await sb
    .from("hankkeet")
    .select("teho_mw, it_teho_mw")
    .eq("id", HETZNER_ID)
    .single();
  console.log("\n=== VISULAHTI HUOMAUTUS ===\n", cnf?.huomautus);
  console.log("\nCNF teho/it", cnf?.teho_mw, cnf?.it_teho_mw);
  console.log("Hetzner teho/it", hetz?.teho_mw, hetz?.it_teho_mw);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
