/**
 * Grok lähdeselvitys erä 1 (laatijat + puuttuvat asiakirjat + erilliset kirjaukset).
 *
 * Aineisto: agents/data/grok-lahdeselvitys-era1-2026-10-11.json
 * Aja: npx tsx scripts/tuo-grok-lahdeselvitys-era1.ts [--kuiva]
 *
 * Tunnisteet:
 *   grok_lahdeselvitys_era1_laatijat   — organisaatioroolit
 *   grok_lahdeselvitys_era1_asiakirjat — 107 puuttuvaa asiakirjaa
 *   grok_lahdeselvitys_era1_epavarma   — kohdistamattomat epävarmat
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { tulkitseKohdistusIlmenee } from "../src/lib/kohdistus-epavarma";
import { onOrganisaatioNimi } from "../src/lib/organisaatio-nimi";

const TIEDOSTO = resolve(
  process.cwd(),
  "agents/data/grok-lahdeselvitys-era1-2026-10-11.json",
);
const PVM = "2026-10-11";
const TUN_LAATIJA = "grok_lahdeselvitys_era1_laatijat";
const TUN_ASIAKIRJA = "grok_lahdeselvitys_era1_asiakirjat";
const TUN_EPAVARMA = "grok_lahdeselvitys_era1_epavarma";

const SIMO_ID = "ee5e51d8-ac2c-4099-8d40-1abe859ccb78";
const SIEVI_ID = "15575f47-dc60-48f5-8b01-f47f18e9ec8c";
const VARKAUS_ID = "4431aa29-85ea-4c49-82f9-3384ae53ded9";
const NEBIUS_M2_ID = "6df78b4b-ae27-4a9a-b264-1ea50ad2a390";
const JYVASKYLA_ID = "7599d338-1da9-4816-9f6f-b353549a6264";

const SIMO_KH240_URL =
  "https://simo.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=187B5EE3XE6DEX4324X9F6EXE9BABE9C4FE6-6";
const MANTSALA_KH112_URL =
  "https://mantsalad10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=2026567-6";
const SIEVI_TEKLA53_URL =
  "https://sievi-julkaisu.triplancloud.fi/ktwebscr/fileshow?doctype=7&docid=134009";

type Asiakirja = {
  url: string;
  asiakirjan_nimi: string;
  laatija: string;
  rooli: string;
  mista_ilmenee?: string;
  paivays?: string;
  lainaus?: string;
  hakija?: string;
};

type Puuttuva = {
  url: string;
  asiakirjan_nimi: string;
  lahde_tyyppi?: string;
  julkaisija?: string;
  paivays?: string;
  laatija?: string;
  mita_ilmenee?: string;
};

type Kohde = {
  hanke_id: string;
  hanke_nimi: string;
  kunta: string;
  asiakirjat: Asiakirja[];
  puuttuvat_asiakirjat: Puuttuva[];
  haku?: string;
  aineisto_alkaa?: string;
};

type Aineisto = { kohteet: Kohde[] };

type RooliEhdotus = {
  hankeId: string;
  hankeNimi: string;
  orgNimi: string;
  rooli: string;
  lahdeUrl: string;
  lainaus: string;
  huomautus: string;
};

async function haeTaiLuoOrg(
  sb: SupabaseClient,
  nimi: string,
  lahdeUrl: string,
): Promise<string> {
  const { data: olemassa } = await sb
    .from("organisaatiot")
    .select("id")
    .eq("julkaistu", true)
    .ilike("nimi", nimi)
    .maybeSingle();
  if (olemassa?.id) return olemassa.id as string;

  const { data, error } = await sb.rpc("julkaise_organisaatio_ilman_ytunnusta", {
    p_nimi: nimi,
    p_lahde_url: lahdeUrl,
    p_vahvistettu_pvm: PVM,
    p_lainaus: nimi,
    p_merkitty: "ihmisen_vahvistama",
  });
  if (error) throw new Error(`${nimi}: ${error.message}`);
  return data as string;
}

async function jonoRooli(
  sb: SupabaseClient,
  e: RooliEhdotus,
  orgId: string,
  kuiva: boolean,
): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id, sisalto")
    .eq("hanke_id", e.hankeId)
    .eq("tyyppi", "hanke_organisaatio")
    .eq("tila", "odottaa")
    .eq("ehdottaja_tunniste", TUN_LAATIJA);

  const jo = (odottaa ?? []).some((rivi) => {
    const sis = rivi.sisalto as {
      hanke_organisaatio?: { organisaatio_id?: string; rooli?: string };
    };
    return (
      sis.hanke_organisaatio?.organisaatio_id === orgId &&
      sis.hanke_organisaatio?.rooli === e.rooli
    );
  });
  if (jo) return "jo";

  const { data: julkaistu } = await sb
    .from("hanke_organisaatiot")
    .select("id")
    .eq("hanke_id", e.hankeId)
    .eq("organisaatio_id", orgId)
    .eq("rooli", e.rooli)
    .eq("julkaistu", true)
    .maybeSingle();
  if (julkaistu?.id) return "jo";

  if (kuiva) return "uusi";

  const lahteet = ["organisaatio_id", "rooli"].map((kentta) => ({
    kentta,
    lahde_url: e.lahdeUrl,
    lahde_sivu: null,
    lahde_laji: "dokumentti",
    vahvistettu_pvm: PVM,
    luottamus: "epavarma",
    lainaus: e.lainaus,
    merkitty: "koneen_ehdottama",
  }));

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "hanke_organisaatio",
    hanke_id: e.hankeId,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_LAATIJA,
    lahde_url: e.lahdeUrl,
    huomautus: e.huomautus,
    tila: "odottaa",
    sisalto: {
      hanke_organisaatio: {
        organisaatio_id: orgId,
        organisaatio_nimi: e.orgNimi,
        rooli: e.rooli,
        lahde_url: e.lahdeUrl,
        lahde_kohta: e.lainaus.slice(0, 200),
        lahteet,
      },
    },
  });
  if (error) throw new Error(`${e.hankeNimi}/${e.orgNimi}: ${error.message}`);
  return "uusi";
}

function kerääLaatijat(aineisto: Aineisto): RooliEhdotus[] {
  const out: RooliEhdotus[] = [];

  for (const k of aineisto.kohteet) {
    for (const a of k.asiakirjat ?? []) {
      if (!a.laatija || a.laatija === "ei ilmene") continue;
      if (!onOrganisaatioNimi(a.laatija)) continue;
      if (
        !["kaavan_laatija", "lupahakemuksen_laatija", "selvityksen_laatija"].includes(
          a.rooli,
        )
      ) {
        continue;
      }
      out.push({
        hankeId: k.hanke_id,
        hankeNimi: k.hanke_nimi,
        orgNimi: a.laatija.trim(),
        rooli: a.rooli,
        lahdeUrl: a.url,
        lainaus: (a.lainaus || a.mista_ilmenee || a.laatija).trim(),
        huomautus: `Erä 1 laatija (${a.rooli}): ${a.laatija}. ${a.asiakirjan_nimi}`,
      });
    }
  }

  // Sievi: Sweco + Semecon (Tekla 28.9.2026 § 53)
  out.push({
    hankeId: SIEVI_ID,
    hankeNimi: "FR Malakakangas DC Oy, Sievi Kukonkylä",
    orgNimi: "Sweco Finland Oy",
    rooli: "kaavan_laatija",
    lahdeUrl: SIEVI_TEKLA53_URL,
    lainaus:
      "Sopimuksen mukaisesti Semecon Oy esittää kaavan laatijaksi Sweco Finland OY, Juha Pasma.",
    huomautus:
      "Erä 1: Sweco Finland Oy (ei Sweco UK Ltd) kaavan_laatija. Tekla 28.9.2026 § 53.",
  });
  out.push({
    hankeId: SIEVI_ID,
    hankeNimi: "FR Malakakangas DC Oy, Sievi Kukonkylä",
    orgNimi: "Semecon Oy",
    rooli: "muu",
    lahdeUrl: SIEVI_TEKLA53_URL,
    lainaus:
      "Sopimuksen mukaisesti Semecon Oy esittää kaavan laatijaksi Sweco Finland OY, Juha Pasma.",
    huomautus:
      "Erä 1: Semecon Oy esiintyy kaavoitussopimuksessa kaavan laatijan esittäjänä (ei kaavan_laatija). Tekla 28.9.2026 § 53.",
  });

  // Simo: FCDC Corp Oy kaavoitusaloitteen tekijä
  out.push({
    hankeId: SIMO_ID,
    hankeNimi: "FCDC Simo, Hirvimaa",
    orgNimi: "FCDC Corp Oy",
    rooli: "hankeyhtio",
    lahdeUrl: SIMO_KH240_URL,
    lainaus:
      "aloitteen tekijä FCDC Corp Oy perustettavan yhtiön lukuun (Kh 28.9.2026 § 240)",
    huomautus:
      "Erä 1: FCDC Corp Oy kaavoitusaloitteen tekijänä perustettavan yhtiön lukuun. Älä päättele suhdetta muihin hankkeisiin.",
  });

  // Nebius Mäntsälä 2: FCDC Corp Oy vuokralainen
  out.push({
    hankeId: NEBIUS_M2_ID,
    hankeNimi: "Nebius Mäntsälä 2, Kapuli",
    orgNimi: "FCDC Corp Oy",
    rooli: "vuokralainen",
    lahdeUrl: MANTSALA_KH112_URL,
    lainaus: "vuokralainen FinCap DC Corp Oy / FCDC Corp Oy (Khall 15.6.2026 § 112)",
    huomautus:
      "Erä 1: FCDC Corp Oy vuokralaisena Nebius Mäntsälä 2:ssa. Älä päättele suhdetta Simon hankkeeseen.",
  });

  return out;
}

async function jonoAsiakirja(
  sb: SupabaseClient,
  k: Kohde,
  p: Puuttuva,
  kuiva: boolean,
): Promise<"uusi" | "jo"> {
  const { data: dok } = await sb.from("dokumentit").select("id").eq("url", p.url).maybeSingle();
  if (dok) return "jo";

  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "kunta_havainto")
    .eq("lahde_url", p.url)
    .eq("ehdottaja_tunniste", TUN_ASIAKIRJA)
    .in("tila", ["odottaa", "odottaa_kohdistusta"])
    .limit(1);
  if (odottaa?.length) return "jo";

  const lahdeTyyppi =
    p.lahde_tyyppi === "paatos" || p.lahde_tyyppi === "viranomaisasiakirja"
      ? p.lahde_tyyppi
      : "viranomaisasiakirja";

  const kohdistus = tulkitseKohdistusIlmenee(p.mita_ilmenee);
  let huomautus = `Erä 1 puuttuva asiakirja (${lahdeTyyppi}). ${p.julkaisija ?? k.kunta}. ${p.mita_ilmenee ?? ""}`.trim();
  if (k.hanke_id === JYVASKYLA_ID || p.url.includes("64_004") || p.url.includes("64:004")) {
    huomautus +=
      " HUOM: Jyväskylän 64:004-aineisto on laaja; tarkista ennen hyväksyntää, koskevatko asiakirjat kaikki samaa hanketta (Fortum Jyväskylä, Seppälänkangas).";
  }

  if (kuiva) return "uusi";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "kunta_havainto",
    hanke_id: k.hanke_id,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_ASIAKIRJA,
    lahde_url: p.url,
    huomautus,
    tila: kohdistus.kohdistus_epavarma ? "odottaa_kohdistusta" : "odottaa",
    sisalto: {
      kentat: {},
      ...(kohdistus.kohdistus_epavarma
        ? {
            kohdistus_epavarma: true,
            kohdistus_huomio: kohdistus.kohdistus_huomio,
          }
        : {}),
      kunta: {
        kunta_nimi: k.kunta,
        jarjestelma: "grok_lahdeselvitys_era1",
        otsikko: p.asiakirjan_nimi,
        hakusana: TUN_ASIAKIRJA,
        grok_lahde_tyyppi: lahdeTyyppi,
        grok_julkaisija: p.julkaisija ?? null,
        grok_julkaistu_pvm: p.paivays || null,
        grok_ilmenee: p.mita_ilmenee ?? null,
        dokumentit: [
          {
            url: p.url,
            otsikko: p.asiakirjan_nimi,
            laji: "muu",
            muoto: p.url.toLowerCase().includes(".pdf") ? "pdf" : "html",
            // julkaise_kunta_havainto lukee nämä INSERT-vaiheessa
            // (service_rolella ei ole UPDATE-oikeutta dokumentit-tauluun).
            lahde_tyyppi: lahdeTyyppi,
            julkaisija: p.julkaisija ?? null,
            julkaistu_pvm: p.paivays || null,
            ...(kohdistus.kohdistus_epavarma
              ? {
                  kohdistus_epavarma: true,
                  kohdistus_huomio: kohdistus.kohdistus_huomio,
                }
              : {}),
          },
        ],
      },
      era1: { osa: "puuttuva_asiakirja" },
    },
  });
  if (error) throw new Error(`${k.hanke_nimi} ${p.url}: ${error.message}`);
  return "uusi";
}

const EPAVARMAT: {
  url: string;
  otsikko: string;
  kunta: string;
  huomautus: string;
  ehdokasHankkeet: string[];
}[] = [
  {
    url: "https://simo.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=187B5EE3XE6DEX4324X9F6EXE9BABE9C4FE6-7",
    otsikko: "Kh 28.9.2026 §241 Simon Eagle Eye datakeskuksen asemakaavoitusaloite",
    kunta: "Simo",
    huomautus:
      "Erä 1 epävarma kohdistus: toinen datakeskushanke Simossa. Älä kohdista FCDC Simo Hirvimaahan arvaamalla.",
    ehdokasHankkeet: ["FCDC Simo, Hirvimaa", "Helios Simo, Malininperä"],
  },
  {
    url: "https://julkaisut.raisio.fi/dynasty10/cgi/DREQUEST.PHP?page=meetingitem&id=2025502-11",
    otsikko:
      "Kh 3.2.2025 Suunnitteluvaraus, määräala Itä-Somersojan asemakaava-alueesta / Borg-kiinteistöt Oy",
    kunta: "Raisio",
    huomautus:
      "Erä 1 epävarma kohdistus: Borg-varaus. Raisiossa on Ecogrid Raisio (myös nimellä Raisio Data & Energy Campus). Älä kohdista arvaamalla.",
    ehdokasHankkeet: ["Ecogrid Raisio"],
  },
  {
    url: "https://lahti-prod.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=20251166-22",
    otsikko: "Kh 25.8.2025 Kasvusopimus kaupungin ja datakeskusoperaattorin välillä",
    kunta: "Lahti",
    huomautus:
      "Erä 1 epävarma kohdistus: kasvusopimus. Älä kohdista Ecogrid Lahti Kujalaan arvaamalla.",
    ehdokasHankkeet: ["Ecogrid Lahti, Kujala", "FCDC Lahti, Ilmarisentie"],
  },
  {
    url: "https://sievi-julkaisu.triplancloud.fi/ktwebscr/fileshow?doctype=7&docid=131393",
    otsikko: "Kh 17.8.2026 §130 Kysely osallistumisesta maakunnalliseen datakeskus-hankkeeseen",
    kunta: "Sievi",
    huomautus:
      "Erä 1 epävarma kohdistus: ei välttämättä FR Malakakangas DC -hanketta. Älä kohdista arvaamalla.",
    ehdokasHankkeet: ["FR Malakakangas DC Oy, Sievi Kukonkylä"],
  },
];

async function jonoEpavarma(
  sb: SupabaseClient,
  rivi: (typeof EPAVARMAT)[number],
  kuiva: boolean,
): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "kunta_havainto")
    .eq("lahde_url", rivi.url)
    .eq("ehdottaja_tunniste", TUN_EPAVARMA)
    .eq("tila", "odottaa")
    .limit(1);
  if (odottaa?.length) return "jo";

  if (kuiva) return "uusi";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "kunta_havainto",
    hanke_id: null,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_EPAVARMA,
    lahde_url: rivi.url,
    huomautus: rivi.huomautus,
    tila: "odottaa",
    sisalto: {
      kentat: {},
      kunta: {
        kunta_nimi: rivi.kunta,
        jarjestelma: "grok_lahdeselvitys_era1",
        otsikko: rivi.otsikko,
        hakusana: TUN_EPAVARMA,
        grok_lahde_tyyppi: "viranomaisasiakirja",
        dokumentit: [
          {
            url: rivi.url,
            otsikko: rivi.otsikko,
            laji: "muu",
            muoto: "pdf",
            lahde_tyyppi: "viranomaisasiakirja",
          },
        ],
      },
      era1: {
        osa: "epavarma_kohdistus",
        ehdokas_hankkeet: rivi.ehdokasHankkeet,
        luottamus: "epavarma",
      },
    },
  });
  if (error) throw new Error(`epävarmä ${rivi.url}: ${error.message}`);
  return "uusi";
}

async function kirjaaVarkausHaku(sb: SupabaseClient, kuiva: boolean): Promise<"uusi" | "jo"> {
  const { data: aiempi } = await sb
    .from("hanke_lahdehaut")
    .select("id")
    .eq("hanke_id", VARKAUS_ID)
    .eq("ajankohta", PVM)
    .eq("suorittaja", TUN_ASIAKIRJA)
    .maybeSingle();
  if (aiempi?.id) return "jo";

  if (kuiva) return "uusi";

  const { error } = await sb.from("hanke_lahdehaut").insert({
    hanke_id: VARKAUS_ID,
    jarjestelma: "Varkaus Tweb (varkaus.tweb.fi)",
    hakusanat:
      "Green Tech, Tech Valley, Green, Luttila, Huruslah, Pöppökallio, Pöppökallionpolku, APL, datakeskus",
    ajankohta: PVM,
    osumia: 0,
    yhteenveto:
      "Asianhallinnan aineisto alkaa noin marraskuusta 2024 (vanhin havaittu osuma 13.11.2024). Haku tuotti 0 hanketta koskevaa osumaa.",
    suorittaja: TUN_ASIAKIRJA,
    hakijan_tyyppi: "ulkopuolinen_selvitys",
    tila: "odottaa",
  });
  if (error) throw new Error(`Varkaus haku: ${error.message}`);
  return "uusi";
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  if (!existsSync(TIEDOSTO)) throw new Error(`Aineisto puuttuu: ${TIEDOSTO}`);

  const aineisto = JSON.parse(readFileSync(TIEDOSTO, "utf8")) as Aineisto;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const raportti = {
    kuiva,
    laatijat_uusi: 0,
    laatijat_jo: 0,
    laatijat_ohitettu_henkilo: 0,
    asiakirjat_uusi: 0,
    asiakirjat_jo: 0,
    epavarmat_uusi: 0,
    epavarmat_jo: 0,
    varkaus_haku: "" as string,
  };

  // 1 + 3 + 4: laatijat / FCDC / Sievi
  const laatijat = kerääLaatijat(aineisto);
  // Laske myös ohitetut henkilöt
  for (const k of aineisto.kohteet) {
    for (const a of k.asiakirjat ?? []) {
      if (a.laatija && a.laatija !== "ei ilmene" && !onOrganisaatioNimi(a.laatija)) {
        raportti.laatijat_ohitettu_henkilo += 1;
        console.log("OHITA henkilö-laatija:", a.laatija, k.hanke_nimi);
      }
    }
  }

  for (const e of laatijat) {
    const orgId = kuiva
      ? "kuiva"
      : await haeTaiLuoOrg(sb, e.orgNimi, e.lahdeUrl);
    const tulos = kuiva
      ? ("uusi" as const)
      : await jonoRooli(sb, e, orgId, kuiva);
    if (tulos === "uusi") raportti.laatijat_uusi += 1;
    else raportti.laatijat_jo += 1;
    console.log(`laatija ${e.rooli}: ${e.orgNimi} → ${e.hankeNimi} [${tulos}]`);
  }

  // 2: 107 puuttuvaa
  let puuttuvatLkm = 0;
  for (const k of aineisto.kohteet) {
    for (const p of k.puuttuvat_asiakirjat ?? []) {
      puuttuvatLkm += 1;
      const tulos = await jonoAsiakirja(sb, k, p, kuiva);
      if (tulos === "uusi") raportti.asiakirjat_uusi += 1;
      else raportti.asiakirjat_jo += 1;
    }
  }
  console.log(`puuttuvia aineistossa: ${puuttuvatLkm}`);

  // 5: Varkaus
  raportti.varkaus_haku = await kirjaaVarkausHaku(sb, kuiva);
  console.log("Varkaus hanke_lahdehaut:", raportti.varkaus_haku);

  // 6: epävarmat
  for (const r of EPAVARMAT) {
    const tulos = await jonoEpavarma(sb, r, kuiva);
    if (tulos === "uusi") raportti.epavarmat_uusi += 1;
    else raportti.epavarmat_jo += 1;
    console.log(`epävarmä: ${r.otsikko.slice(0, 60)} [${tulos}]`);
  }

  console.log(JSON.stringify(raportti, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
