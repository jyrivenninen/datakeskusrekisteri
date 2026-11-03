/**
 * LS13 erät 2–3: Merijärvi-korjaukset, vaihe-päiväysvertailu,
 * asiakirjavajeen tarkistus, Sipoo karttaliite avoimeksi.
 *
 * Aja: npx tsx scripts/lahdeselvitys13-era23-lisat.ts [--kuiva]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const MERIJARVI_ID = "e30c8dd4-95a9-4eb9-a864-0ba6360b1dae";
const MERIJARVI_LUPA =
  "https://poytakirjat.merijarvi.fi/kokous/202615-3.PDF";
const SIPOO_KARTTA =
  "https://sipoofi.oncloudos.com/kokous/2024709-10-39278.PDF";
const SIPOO_ID = "32fada54-3fde-4866-82c8-a043c22acee5";

const VAIHE_HANKKEET = [
  "Polarnode Kangasala, Ruutana",
  "SR-Kiinteistöt Kauhajoki, Aronkylä",
  "Regant Naarajärvi",
  "Regant Pornainen, Portti",
];

const VAJE_HANKKEET = [
  "Hyperco Kouvola-Voikkaa",
  "Scale42 Kristiinankaupunki, Pohjoislahti",
  "Helios Ii, Isokangas Juniper",
  "Fortum Sipoo, Stormosskärret",
  "Fu-Gen Toholampi, Marjokangas",
];

function parsiPvmNimesta(teksti: string): string | null {
  // 10.2.2026 / 16.6.2026 / 26.1.2026
  const m = teksti.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  // --- 1) Merijärvi pinta_ala ---
  const { data: meri } = await sb
    .from("hankkeet")
    .select("id, nimi, pinta_ala_ha, teho_mw, huomautus")
    .eq("id", MERIJARVI_ID)
    .single();
  if (!meri) throw new Error("Merijärvi puuttuu");

  const { data: meriLahteet } = await sb
    .from("kentta_lahteet")
    .select("lahde_url, lainaus, luottamus, vahvistettu_pvm")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", MERIJARVI_ID)
    .eq("kentta", "pinta_ala_ha")
    .neq("tila", "korvattu");

  const pintaRivi = {
    tyyppi: "korjaus",
    hanke_id: MERIJARVI_ID,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: "lahdeselvitys13_merijarvi",
    lahde_url: MERIJARVI_LUPA,
    huomautus:
      "LS13 Merijärvi: pinta_ala_ha 75 → noin 7,5 ha (energiavaraston hankealue). Todennäköisesti desimaalivirhe.",
    tila: "odottaa",
    sisalto: {
      kentat: {
        pinta_ala_ha: {
          arvo: "7.5",
          lahde_url: MERIJARVI_LUPA,
          lahde_sivu: null,
          lainaus: "Koko hankealue yhteensä n. 7,5 ha.",
          luottamus: "epavarma",
          lahde_laji: "html",
        },
      },
      lahdeselvitys13: {
        era: 3,
        osa: "merijarvi_pinta_ala",
        kentta: "pinta_ala_ha",
        rekisterin_arvo: String(meri.pinta_ala_ha ?? ""),
        rekisterin_lahteet: meriLahteet ?? [],
        asiakirjan_arvo: "n. 7,5 (energiavaraston hankealue)",
        lainaus: "Koko hankealue yhteensä n. 7,5 ha.",
        ratkaisuvaihtoehdot: [
          "arvo korjataan asiakirjan mukaiseksi, vanha lähde korvatuksi",
        ],
      },
    },
  };

  // teho: monitoimisääntö — tyhjennys + huomautus (125 MW on akku, ei datakeskus)
  const tehoRivi = {
    tyyppi: "kentta_tyhjennys",
    hanke_id: MERIJARVI_ID,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: "lahdeselvitys13_merijarvi",
    lahde_url: MERIJARVI_LUPA,
    huomautus:
      "LS13 Merijärvi monitoimisääntö: 125 MW on energiavarastointilaitoksen (akun) teho, ei datakeskuksen. teho_mw tyhjäksi; älä merkitse 125 MW:tä hankkeen tehonä.",
    tila: "odottaa",
    sisalto: {
      kentat: {},
      tyhjennys: {
        taulu: "hankkeet",
        rivi_id: MERIJARVI_ID,
        kentta: "teho_mw",
        perustelu:
          "Asiakirja: energiavarastointilaitoksen (125MW) rakentaminen. Monitoimihanke — datakeskuksen tehoa ei ole eroteltu; kenttä jätetään tyhjäksi.",
        lahde_url: MERIJARVI_LUPA,
        lainaus: "energiavarastointilaitoksen (125MW)",
        merkitse_ei_lahdetta: true,
      },
      lahdeselvitys13: {
        era: 3,
        osa: "merijarvi_teho_tyhjennys",
        kentta: "teho_mw",
        rekisterin_arvo: meri.teho_mw == null ? null : String(meri.teho_mw),
        asiakirjan_arvo: "125MW (energiavarasto, ei datakeskus)",
      },
    },
  };

  // Huomautus hankkeelle akkuvarastosta (jos teho jo tyhjä, tyhjennys on silti dokumentointi)
  const huomRivi = {
    tyyppi: "korjaus",
    hanke_id: MERIJARVI_ID,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: "lahdeselvitys13_merijarvi",
    lahde_url: MERIJARVI_LUPA,
    huomautus:
      "LS13 Merijärvi: hankkeeseen liittyy energiavarasto (125 MW). Datakeskuksen tehoa ei merkitä tästä luvusta.",
    tila: "odottaa",
    sisalto: {
      kentat: {},
      lahdeselvitys13: {
        era: 3,
        osa: "merijarvi_huomautus",
        kentta: "huomautus",
        asiakirjan_arvo: "energiavarastointilaitos 125MW",
        lainaus: "energiavarastointilaitoksen (125MW)",
      },
    },
  };

  for (const rivi of [pintaRivi, tehoRivi, huomRivi]) {
    const { data: jo } = await sb
      .from("muutosehdotukset")
      .select("id")
      .eq("ehdottaja_tunniste", "lahdeselvitys13_merijarvi")
      .eq("tila", "odottaa")
      .eq("huomautus", rivi.huomautus)
      .maybeSingle();
    if (jo) {
      console.log("Merijärvi jo jonossa:", rivi.huomautus.slice(0, 60));
      continue;
    }
    if (kuiva) {
      console.log("[kuiva] Merijärvi", rivi.tyyppi, rivi.huomautus.slice(0, 70));
    } else {
      const { error } = await sb.from("muutosehdotukset").insert(rivi);
      if (error) throw new Error(`Merijärvi: ${error.message}`);
      console.log("jonoon Merijärvi", rivi.tyyppi);
    }
  }

  // --- 2) Vaihe-päiväysvertailu ---
  console.log("\n=== Vaihe-poikkeamat: päiväysvertailu ===");
  const aineistot = [2, 3].map((era) =>
    JSON.parse(
      readFileSync(
        resolve(process.cwd(), `agents/data/lahdeselvitys13-era${era}-2026-10-12.json`),
        "utf8",
      ),
    ),
  );
  for (const nimi of VAIHE_HANKKEET) {
    const { data: hanke } = await sb
      .from("hankkeet")
      .select("id, nimi, vaihe")
      .eq("nimi", nimi)
      .maybeSingle();
    if (!hanke) {
      console.log(nimi, "— hanketta ei löydy");
      continue;
    }
    const { data: lahteet } = await sb
      .from("kentta_lahteet")
      .select("lahde_url, lainaus, vahvistettu_pvm, luotu_pvm")
      .eq("taulu", "hankkeet")
      .eq("rivi_id", hanke.id)
      .eq("kentta", "vaihe")
      .neq("tila", "korvattu")
      .order("vahvistettu_pvm", { ascending: false });

    const rekPvm = (lahteet ?? [])
      .map((l) => l.vahvistettu_pvm as string | null)
      .filter(Boolean)
      .sort()
      .at(-1);

    for (const aineisto of aineistot) {
      for (const k of aineisto.kohteet ?? []) {
        if (k.hanke_nimi !== nimi) continue;
        for (const h of k.havainnot ?? []) {
          if (h.kentta !== "vaihe" || !h.poikkeaa_rekisterista) continue;
          if (h.kohdistus_epavarma?.arvo === true) {
            console.log(
              `${nimi}: asiakirja ${h.asiakirjan_nimi?.slice(0, 50)} — KOHDISTUS EPÄVARMA, ei vertailua`,
            );
            continue;
          }
          const asiPvm =
            parsiPvmNimesta(h.asiakirjan_nimi ?? "") ??
            parsiPvmNimesta(h.arvo ?? "") ??
            null;
          let tuomio = "ei voida päätellä";
          if (asiPvm && rekPvm) {
            if (rekPvm > asiPvm) {
              tuomio =
                "rekisterin lähde tuoreempi → hanke edennyt, rekisteri ei väärässä";
            } else if (asiPvm > rekPvm) {
              tuomio = "asiakirja tuoreempi → vaihe korjataan asiakirjan mukaiseksi";
            } else {
              tuomio = "sama päiväys → tarkista sisältö";
            }
          } else if (asiPvm && !rekPvm) {
            tuomio = "rekisterin vaihe-lähteellä ei päiväystä → tarkista manuaalisesti";
          }
          console.log(
            [
              nimi,
              `rekisteri vaihe=${hanke.vaihe} lähde_pvm=${rekPvm ?? "—"}`,
              `asiakirja=${asiPvm ?? "—"} «${(h.arvo as string).slice(0, 50)}»`,
              `→ ${tuomio}`,
            ].join(" | "),
          );
        }
      }
    }
  }

  // --- 3) Asiakirjavaje ---
  console.log("\n=== Asiakirjavaje (listalla vähemmän kuin pyydetty) ===");
  for (const aineisto of aineistot) {
    for (const k of aineisto.kohteet ?? []) {
      if (!VAJE_HANKKEET.includes(k.hanke_nimi)) continue;
      const listalla = k.asiakirjoja_listalla ?? "?";
      const huomio = k.huomio ?? "";
      const { count } = await sb
        .from("dokumentit")
        .select("id", { count: "exact", head: true })
        .eq("hanke_id", k.hanke_id);
      // Siirretyt pois (dokumentit joilla URL oli tällä hankkeella mutta ei enää)
      console.log(
        `${k.hanke_nimi}: listalla=${listalla}, dokumentit.hanke_id nyt=${count ?? 0}`,
        huomio ? `| ${huomio.slice(0, 120)}` : "",
      );
    }
  }

  // Siirtyneet: tarkista odottaa_kohdistusta / kohdistus-jonot näille hankkeille
  const { data: siirrot } = await sb
    .from("muutosehdotukset")
    .select("hanke_id, tila, huomautus, lahde_url, ehdottaja_tunniste")
    .or("tila.eq.odottaa_kohdistusta,ehdottaja_tunniste.like.lahdeselvitys13_era%_kohdistus")
    .in(
      "hanke_id",
      (
        await sb
          .from("hankkeet")
          .select("id")
          .in("nimi", VAJE_HANKKEET)
      ).data?.map((h) => h.id) ?? [],
    );
  console.log("Kohdistusjonoja vaje-hankkeilla:", (siirrot ?? []).length);
  for (const s of siirrot ?? []) {
    console.log(" ", (s.huomautus as string)?.slice(0, 100));
  }

  // --- 4) Sipoo kartta avoimeksi ---
  const sipooHuom =
    "LS13: Sipoon §58 karttaliite (kuva-PDF) ei auennut tekstintunnistuksellakaan — merkitty avoimeksi.";
  const { data: sipooJo } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("ehdottaja_tunniste", "lahdeselvitys13_sipoo_avoin")
    .eq("tila", "odottaa")
    .maybeSingle();
  if (sipooJo) {
    console.log("\nSipoo kartta jo jonossa");
  } else if (kuiva) {
    console.log("\n[kuiva] Sipoo kartta avoimeksi");
  } else {
    const { error } = await sb.from("muutosehdotukset").insert({
      tyyppi: "korjaus",
      hanke_id: SIPOO_ID,
      ehdottaja_tyyppi: "agentti",
      ehdottaja_tunniste: "lahdeselvitys13_sipoo_avoin",
      lahde_url: SIPOO_KARTTA,
      huomautus: sipooHuom,
      tila: "odottaa",
      sisalto: {
        kentat: {},
        lahdeselvitys13: {
          era: 3,
          osa: "sipoo_kartta_avoin",
          kentta: "asiakirja",
          asiakirjan_nimi: "§58 liite 1 kartta",
          huomio: "kuva-PDF, ei tekstiä myöskään OCR:n jälkeen",
        },
      },
    });
    if (error) throw new Error(error.message);
    console.log("\njonoon Sipoo kartta avoin");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
