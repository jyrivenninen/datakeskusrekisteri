/**
 * A1 pinta_ala tyhjennys (konesali/rakennus), A2 kooste luottamus→epavarma,
 * A3 FIN03-huomautus. Loki palautusta varten.
 *
 * Aja: npx tsx scripts/a123-pinta-ala-kooste-fin03-2026-10-12.ts
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const LOKI_POLKU = "agents/data/a123-loki-2026-10-12.json";

const TYHJENNYKSET: { id: string; nimi: string }[] = [
  { id: "8ac56292-8b3b-4b49-9327-9f3f8bdc0e2b", nimi: "atNorth FIN01" },
  { id: "9b8b4538-3eb6-4cb1-ae7f-4e00dda40480", nimi: "atNorth FIN03" },
  { id: "dba603c7-7af8-4d01-a792-849a732a25d5", nimi: "North Shore AH3, Pietarsaari" },
  { id: "e3c43aaf-9147-474c-8536-ac60998b0443", nimi: "DataVault Kanavuori" },
  { id: "30dfd76a-046a-47c5-b1df-3c6198c33734", nimi: "E-Heat Ivalo" },
  { id: "3f87b996-6082-495c-8bba-40e2b6678a35", nimi: "Elisa Tapiola Center" },
  { id: "d956d052-d749-4de2-8a24-f231e6c94cd0", nimi: "Glesys Oulu, Elektroniikkatie 15" },
  { id: "b95ca8df-719d-4841-9b25-5bc8808e350c", nimi: "Glesys Oulu, Elektroniikkatie 5" },
  { id: "b22e0f68-720a-4f59-93fb-62ae828bc13a", nimi: "Glesys Oulu, Yrttipellontie 1" },
  { id: "cf644fd7-6e12-4a07-8da6-43f53d22fc90", nimi: "Glesys, Porin datakeskus" },
  { id: "89863bd0-e42b-407b-8c23-53bf89a96e8f", nimi: "Glesys, Tampereen datakeskus" },
  { id: "36110282-b06d-4efa-ad3b-0f09217ae01c", nimi: "Telia Helsinki Data Center" },
];

const SCALE42_ID = "3c25954a-d472-4f04-a2e2-ac22f1ac3540";
const FIN03_ID = "9b8b4538-3eb6-4cb1-ae7f-4e00dda40480";
const FIN01_ATNORTH =
  "https://www.atnorth.com/nordic-data-centers/finland-data-centers/helsinki-metro-site-01/";

type LokiRivi = {
  toimenpide: string;
  hanke_id?: string;
  hanke_nimi?: string;
  kentta?: string;
  rivi_id?: string;
  vanha: unknown;
  uusi: unknown;
  lahde?: string;
};

type Sb = SupabaseClient;

async function julkinenPintaAlaSumma(sb: Sb) {
  const { data: hankkeet, error } = await sb
    .from("hankkeet")
    .select("id, pinta_ala_ha, hanke_vaihtoehdot(tunnus, pinta_ala_ha)")
    .eq("julkaistu", true);
  if (error) throw new Error(error.message);
  let min = 0;
  let max = 0;
  let merkitty = 0;
  for (const h of hankkeet ?? []) {
    const ve = ((h as { hanke_vaihtoehdot?: { tunnus: string; pinta_ala_ha: number | null }[] })
      .hanke_vaihtoehdot ?? []).filter(
      (v) => v.tunnus.trim().toUpperCase() !== "VE0" && v.pinta_ala_ha != null,
    );
    if (ve.length > 0) {
      const luvut = ve.map((v) => Number(v.pinta_ala_ha));
      min += Math.min(...luvut);
      max += Math.max(...luvut);
      merkitty += 1;
    } else if (h.pinta_ala_ha != null) {
      const n = Number(h.pinta_ala_ha);
      min += n;
      max += n;
      merkitty += 1;
    }
  }
  return { min, max, merkitty };
}

async function lisaaHuomautus(
  sb: Sb,
  hankeId: string,
  lisays: string,
  lahdeUrl: string,
  lainaus: string,
  tunniste: string,
  loki: LokiRivi[],
) {
  const { data: hanke, error } = await sb
    .from("hankkeet")
    .select("nimi, huomautus")
    .eq("id", hankeId)
    .single();
  if (error || !hanke) throw new Error(error?.message ?? "hanke");
  const vanha = (hanke.huomautus ?? "").trim();
  if (vanha.includes(tunniste)) {
    console.log("  huomautus jo:", tunniste);
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
  loki.push({
    toimenpide: "huomautus",
    hanke_id: hankeId,
    hanke_nimi: hanke.nimi,
    kentta: "huomautus",
    vanha: vanha || null,
    uusi: huom,
    lahde: lahdeUrl,
  });
  console.log("  ✓ huomautus", hanke.nimi);
}

async function tyhjennaPintaAla(sb: Sb, hankeId: string, nimi: string, loki: LokiRivi[]) {
  const { data: hanke } = await sb
    .from("hankkeet")
    .select("pinta_ala_ha")
    .eq("id", hankeId)
    .single();
  const vanha = hanke?.pinta_ala_ha ?? null;
  if (vanha == null) {
    console.log("  jo tyhjä", nimi);
    return;
  }

  const { data: lahteet } = await sb
    .from("kentta_lahteet")
    .select("id, lahde_url, lainaus, tila")
    .eq("rivi_id", hankeId)
    .eq("kentta", "pinta_ala_ha")
    .eq("tila", "voimassa");
  const voimassa = lahteet ?? [];
  const lainaukset = voimassa
    .map((l) => (l.lainaus ? `«${l.lainaus}» (${l.lahde_url})` : l.lahde_url))
    .join("; ");
  const lahdeUrl = voimassa[0]?.lahde_url ?? "https://datakeskusrekisteri.fi/";

  await lisaaHuomautus(
    sb,
    hankeId,
    `Pinta-ala tyhjennetty: lainauksen ala on konesalin tai rakennuksen ala, ei tontti. Aiempi arvo ${Number(vanha)} ha. Lähde: ${lainaukset || "—"}`,
    lahdeUrl,
    voimassa[0]?.lainaus ?? "lainauksen ala on konesalin tai rakennuksen ala, ei tontti",
    "lainauksen ala on konesalin tai rakennuksen ala, ei tontti",
    loki,
  );

  if (voimassa.length > 0) {
    const { data: n, error } = await sb.rpc("peruuta_kentta_lahde_kuittaus", {
      p_lahde_idt: voimassa.map((l) => l.id),
      p_kasittelija: KASITTELIJA,
      p_huomautus:
        "Lainaus kuvaa konesalin tai rakennuksen alaa, ei tontin pinta-alaa → ei_tue pinta_ala_ha.",
    });
    if (error) throw new Error(error.message);
    for (const l of voimassa) {
      loki.push({
        toimenpide: "ei_tue",
        hanke_id: hankeId,
        hanke_nimi: nimi,
        kentta: "pinta_ala_ha",
        rivi_id: l.id,
        vanha: { tila: "voimassa", url: l.lahde_url },
        uusi: { tila: "ei_tue" },
        lahde: l.lahde_url,
      });
    }
    console.log("  ✓ ei_tue", n, "riviä");
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
          kentta: "pinta_ala_ha",
          perustelu:
            "Lainauksen ala on konesalin tai rakennuksen ala, ei tontti; arvo siirretty huomautukseen.",
          lainaus: voimassa[0]?.lainaus ?? "konesalin tai rakennuksen ala",
          lahde_url: lahdeUrl,
        },
      },
    })
    .select("id")
    .single();
  if (error || !ehdotus) throw new Error(error?.message ?? "tyhjennys");
  await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
  loki.push({
    toimenpide: "tyhjennys",
    hanke_id: hankeId,
    hanke_nimi: nimi,
    kentta: "pinta_ala_ha",
    vanha: vanha,
    uusi: null,
    lahde: lahdeUrl,
  });
  console.log("  ✓ tyhjennetty", nimi, vanha);
}

async function koosteLuottamusEpavarma(sb: Sb, loki: LokiRivi[]) {
  const hostit = [
    "dcatlas.io",
    "datacenters.com",
    "datacenterhawk.com",
    "datacentermap.com",
    "peeringdb.com",
    "wikipedia.org",
    "openstreetmap.org",
    "colomap.com",
  ];
  const { data: rivit, error } = await sb
    .from("kentta_lahteet")
    .select("id, rivi_id, kentta, lahde_url, luottamus, tila")
    .eq("tila", "voimassa")
    .eq("luottamus", "vahvistettu")
    .limit(5000);
  if (error) throw new Error(error.message);
  const lista = (rivit ?? []).filter((r) => {
    try {
      const host = new URL(r.lahde_url).hostname.toLowerCase().replace(/^www\./, "");
      return hostit.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  });
  console.log("A2 kooste vahvistettu→epavarma:", lista.length);
  for (const r of lista) {
    const { error: rpcVirhe } = await sb.rpc("paivita_kentta_lahde_sisalto", {
      p_lahde_id: r.id,
      p_luottamus: "epavarma",
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    loki.push({
      toimenpide: "luottamus_epavarma",
      rivi_id: r.id,
      kentta: r.kentta,
      vanha: "vahvistettu",
      uusi: "epavarma",
      lahde: r.lahde_url,
    });
  }
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const loki: LokiRivi[] = [];

  const ennen = await julkinenPintaAlaSumma(sb);
  console.log("Pinta-ala ennen (julkinen):", ennen);

  console.log("\n=== A1 pinta_ala tyhjennykset ===");
  for (const h of TYHJENNYKSET) {
    console.log(h.nimi);
    await tyhjennaPintaAla(sb, h.id, h.nimi, loki);
  }

  console.log("\n=== A1 Scale42 Liperi huomautus ===");
  await lisaaHuomautus(
    sb,
    SCALE42_ID,
    "Pinta-ala 8,83 ha on vuokra-alue («noin 88 311 m²:n alue»).",
    "https://www.pohjoiskarjala.com/kunnat/liperi/paatoksenteko/863-kunnanhallitus/1247-2026/18661-18-5-2026-liperin-kunta-kunnanhallitus-liperi-vuokraa-datakeskukselle-noin-9-hehtaaria-valmistelee-1-324-miljoonan-euron-maakaupan-vie-ylamyllyn-uuden-paivakodin-20-vuoden-vuokramallilla-kilpailutukseen-ja-lahettaa-vt-9-kaavan-valtuustoon",
    "vuokrataan Northern DC AS:lle (Scale42) noin 88 311 m²:n alue",
    "vuokra-alue",
    loki,
  );

  console.log("\n=== A2 kooste luottamus ===");
  await koosteLuottamusEpavarma(sb, loki);

  console.log("\n=== A3 FIN03 huomautus ===");
  await lisaaHuomautus(
    sb,
    FIN03_ID,
    "FIN01: 1,6 MW (atNorth); DCD tammikuu 2023: FIN01+FIN03 yhteensä 3,2 MW, laji erittelemätön.",
    FIN01_ATNORTH,
    "1.6 MW Power capacity",
    "FIN01: 1,6 MW (atNorth)",
    loki,
  );

  const jalkeen = await julkinenPintaAlaSumma(sb);
  console.log("\nPinta-ala jälkeen (julkinen):", jalkeen);

  const raportti = { ennen, jalkeen, rivit: loki };
  writeFileSync(LOKI_POLKU, JSON.stringify(raportti, null, 2));
  console.log("Loki:", LOKI_POLKU, "rivejä", loki.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
