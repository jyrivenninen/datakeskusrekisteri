/**
 * Tehoerittely erä 1 + CNF Visulahti + Nebius pinta-ala.
 *
 * Aja: npx tsx scripts/teho-erittely-era1-2026-10-12.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";

/** IT-sana → pidä it_teho_mw, tyhjennä teho_mw */
const IT_NIMET = [
  "Equinix HE3",
  "Espoon datakeskusalue",
  "Jokelan datakeskushanke",
  "Polarnode Heinola, Vierumäki",
  "Pure DC Seinäjoki (SJK01)",
  "Scale42 Liperi",
  "Winda Rastikangas",
  "XTX Marketsin datakeskus, Kajaani",
] as const;

/** Kokonais-sana → pidä teho_mw, tyhjennä it_teho_mw */
const KOK_NIMET = [
  "atNorth FIN04, Myllykoski",
  "Pajarilan datakeskus, Nebius",
  "Polarnode Kuopio, Mustakorpi",
  "Glesys, The Deck",
] as const;

const CNF_ID = "894ec2a9-ed7e-4714-a0cd-077725198018";
const NEBIUS_ID = "6df78b4b-ae27-4a9a-b264-1ea50ad2a390";
const KH_URL =
  "https://mantsalad10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=2024302-4";
const YRITYSKEHITYS_URL =
  "https://www.yrityskehitys.net/en/plots/kapuli/31-graniittitie-6";
const YLE_URL = "https://yle.fi/a/74-20244279";
const MIKSEI_URL =
  "https://mikseimikkeli.fi/mikkeli-hakee-kasvua-datakeskusinvestoinneista/";
const KAUPPALEHTI_URL =
  "https://www.kauppalehti.fi/uutiset/a/ecf8c7b2-cc43-40ba-b381-c27d026d3cd4";

type Sb = SupabaseClient;

async function lisaaHuomautus(
  sb: Sb,
  hankeId: string,
  lisays: string,
  lahdeUrl: string,
  lainaus: string,
  tunniste: string,
) {
  const { data: hanke, error } = await sb
    .from("hankkeet")
    .select("huomautus")
    .eq("id", hankeId)
    .single();
  if (error || !hanke) throw new Error(error?.message ?? "hanke");
  const vanha = (hanke.huomautus ?? "").trim();
  if (vanha.includes(tunniste)) {
    console.log("  huomautus jo sisältää:", tunniste);
    return;
  }
  const huom = vanha ? `${vanha}\n\n${lisays}` : lisays;
  const { data: ehdotus, error: iVirhe } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "taydennys",
      hanke_id: hankeId,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: lahdeUrl,
      sisalto: {
        huomio: "hanke-huomautus",
        kentat: {
          huomautus: {
            arvo: huom,
            lahde_url: lahdeUrl,
            lahde_laji: "html",
            luottamus: "epavarma",
            lainaus,
          },
        },
      },
    })
    .select("id")
    .single();
  if (iVirhe || !ehdotus) throw new Error(iVirhe?.message ?? "huomautus");
  await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
  console.log("  ✓ huomautus:", tunniste);
}

async function tyhjennaKentta(
  sb: Sb,
  hankeId: string,
  nimi: string,
  kentta: "teho_mw" | "it_teho_mw",
  perustelu: string,
  lahdeUrl: string,
) {
  const { data: hanke } = await sb
    .from("hankkeet")
    .select("teho_mw, it_teho_mw")
    .eq("id", hankeId)
    .single();
  const arvo = kentta === "teho_mw" ? hanke?.teho_mw : hanke?.it_teho_mw;
  if (arvo == null) {
    console.log("  jo tyhjä", nimi, kentta);
    return;
  }

  const { data: ehdotus, error } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "kentta_tyhjennys",
      hanke_id: hankeId,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      tila: "odottaa",
      lahde_url: lahdeUrl,
      sisalto: {
        tyhjennys: {
          taulu: "hankkeet",
          kentta,
          perustelu,
          lainaus: perustelu.slice(0, 200),
          lahde_url: lahdeUrl,
        },
      },
    })
    .select("id")
    .single();
  if (error || !ehdotus) throw new Error(error?.message ?? "tyhjennys");
  await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
  console.log("  ✓ tyhjennetty", nimi, kentta, "(oli", arvo, ")");
}

async function kasitteleCnf(sb: Sb) {
  console.log("\n=== CNF Visulahti ===");
  await lisaaHuomautus(
    sb,
    CNF_ID,
    [
      "Teho: Kauppalehti («165 megawatin it-kapasiteettiin») on it_teho_mw-lähde.",
      "Yle («165 megawatin datakeskus») on erittelemätön tukilähde samalle 165 MW:lle — ei it_teho_mw-lähteenä.",
      "Lehtitiedoissa 165 MW (IT) ja 200 MW (kokonaisuus); mikseimikkeli («200 megawatin kokonaisuutta») vain huomautuksessa, ei kummankaan kentän lähteenä.",
    ].join(" "),
    KAUPPALEHTI_URL,
    "165 megawatin it-kapasiteettiin",
    "erittelemätön tukilähde samalle 165 MW",
  );
  await tyhjennaKentta(
    sb,
    CNF_ID,
    "Compute Nordic, Visulahti",
    "teho_mw",
    "Yle ja mikseimikkeli eivät erittele IT-/kokonaistehoa kenttälähteeksi; 165 MW IT Kauppalehdestä.",
    YLE_URL,
  );
}

async function kasitteleNebius(sb: Sb) {
  console.log("\n=== Nebius Mäntsälä 2 pinta_ala ===");
  // Varmistus: yrityskehitys Graniittitie 6 / 2319-1 = sama tontti kuin Kh 2319 tontti 1
  const { data: yritys } = await sb
    .from("kentta_lahteet")
    .select("id, lainaus")
    .eq("rivi_id", NEBIUS_ID)
    .eq("kentta", "pinta_ala_ha")
    .eq("lahde_url", YRITYSKEHITYS_URL)
    .eq("tila", "voimassa")
    .maybeSingle();
  if (!yritys) {
    console.log("  yrityskehitys-rivi jo pois tai ei voimassa");
  } else if (!/2319|Graniittitie 6|73.?775/i.test(yritys.lainaus ?? "")) {
    throw new Error("Yrityskehityksen lainaus ei viittaa samaan tonttiin — keskeytys.");
  } else {
    console.log("  sama tontti OK (2319 / Graniittitie 6 / 73 775 m²)");
  }

  const { data: hanke } = await sb
    .from("hankkeet")
    .select("pinta_ala_ha")
    .eq("id", NEBIUS_ID)
    .single();
  if (Number(hanke?.pinta_ala_ha) !== 7.4) {
    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "taydennys",
        hanke_id: NEBIUS_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: KH_URL,
        sisalto: {
          kentat: {
            pinta_ala_ha: {
              arvo: 7.4,
              lahde_url: KH_URL,
              lahde_laji: "dokumentti",
              luottamus: "epavarma",
              lainaus:
                "Asemakaavan mukaisen tontin pinta-ala on noin 7,4 hehtaaria.",
              merkitty: "ihmisen_vahvistama",
            },
          },
        },
      })
      .select("id")
      .single();
    if (error || !ehdotus) throw new Error(error?.message ?? "pinta_ala");
    await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
    console.log("  ✓ pinta_ala_ha = 7,4 (Kh)");
  } else {
    console.log("  pinta_ala_ha jo 7,4");
  }

  if (yritys) {
    const { data: n, error } = await sb.rpc("peruuta_kentta_lahde_kuittaus", {
      p_lahde_idt: [yritys.id],
      p_kasittelija: KASITTELIJA,
      p_huomautus:
        "73 775 m² (yrityskehitys, sama tontti 2319-1) kirjattu huomautukseen; ei toista pinta_ala_ha-riviä.",
    });
    if (error) throw new Error(error.message);
    console.log("  ✓ yrityskehitys ei_tue pinta_ala_ha:", n);
  }

  await lisaaHuomautus(
    sb,
    NEBIUS_ID,
    "Pinta-ala: Kh 19.8.2024 § 138 («noin 7,4 hehtaaria», asemakaavan mukainen tontti). Yrityskehitys ilmoittaa samalle tontille (Graniittitie 6, 2319-1) 73 775 m² (= 7,3775 ha); pyöristetty viranomaisluku 7,4 ha.",
    KH_URL,
    "Asemakaavan mukaisen tontin pinta-ala on noin 7,4 hehtaaria.",
    "73 775 m² (= 7,3775 ha)",
  );
}

async function era1(sb: Sb) {
  const { data: hankkeet } = await sb
    .from("hankkeet")
    .select("id, nimi, teho_mw, it_teho_mw")
    .eq("julkaistu", true)
    .not("teho_mw", "is", null)
    .not("it_teho_mw", "is", null);
  const sama = (hankkeet ?? []).filter(
    (h) => Number(h.teho_mw) === Number(h.it_teho_mw),
  );
  const byNimi = new Map(sama.map((h) => [h.nimi, h]));

  console.log("\n=== Erä 1: IT → tyhjennä teho_mw ===");
  for (const nimi of IT_NIMET) {
    const h = byNimi.get(nimi);
    if (!h) {
      console.log("  ei löydy / ei enää sama luku:", nimi);
      continue;
    }
    const { data: lahde } = await sb
      .from("kentta_lahteet")
      .select("lahde_url")
      .eq("rivi_id", h.id)
      .eq("kentta", "it_teho_mw")
      .eq("tila", "voimassa")
      .limit(1)
      .maybeSingle();
    await tyhjennaKentta(
      sb,
      h.id,
      nimi,
      "teho_mw",
      `Lainaus sanoo IT-tehoa; luku kuuluu it_teho_mw-kenttään (${Number(h.it_teho_mw)} MW).`,
      lahde?.lahde_url ?? "https://datakeskusrekisteri.fi/",
    );
  }

  console.log("\n=== Erä 1: kokonais → tyhjennä it_teho_mw ===");
  for (const nimi of KOK_NIMET) {
    const h = byNimi.get(nimi);
    if (!h) {
      console.log("  ei löydy / ei enää sama luku:", nimi);
      continue;
    }
    const { data: lahde } = await sb
      .from("kentta_lahteet")
      .select("lahde_url")
      .eq("rivi_id", h.id)
      .eq("kentta", "teho_mw")
      .eq("tila", "voimassa")
      .limit(1)
      .maybeSingle();
    await tyhjennaKentta(
      sb,
      h.id,
      nimi,
      "it_teho_mw",
      `Lainaus sanoo kokonaistehoa/kapasiteettia; luku kuuluu teho_mw-kenttään (${Number(h.teho_mw)} MW).`,
      lahde?.lahde_url ?? "https://datakeskusrekisteri.fi/",
    );
  }
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  await kasitteleCnf(sb);
  await kasitteleNebius(sb);
  await era1(sb);
  console.log("\nValmis erä 1 + CNF + Nebius");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
