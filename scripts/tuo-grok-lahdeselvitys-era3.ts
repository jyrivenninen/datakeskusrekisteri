/**
 * Grok lähdeselvitys erä 3.
 * Aja: npx tsx scripts/tuo-grok-lahdeselvitys-era3.ts [--kuiva]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { onOrganisaatioNimi } from "../src/lib/organisaatio-nimi";

const TIEDOSTO = resolve(
  process.cwd(),
  "agents/data/grok-lahdeselvitys-era3-2026-10-11.json",
);
const PVM = "2026-10-11";
const TUN_ASIAKIRJA_LAATIJA = "grok_lahdeselvitys_era3_laatijat_asiakirja";
const TUN_PYKALA_LAATIJA = "grok_lahdeselvitys_era3_laatijat_pykala";
const TUN_ASIAKIRJA = "grok_lahdeselvitys_era3_asiakirjat";
const TUN_HUOMAUTUS = "grok_lahdeselvitys_era3_huomautus";

const MERIJARVI_ID = "e30c8dd4-95a9-4eb9-a864-0ba6360b1dae";
const MERIJARVI_KV_URL =
  "https://www.merijarvi.fi/sites/default/files/liitetiedosto/asiakirjat/Kvalt.%2026-06-15%20p%C3%B6yt%C3%A4kirja.pdf";
const LAPPEENRANTA_ID = "666cf1d2-cd14-498c-aa37-d953c2c56827";
const FCG_HULEVESI_URL =
  "https://www.lappeenranta.fi/MFiles/MFFiles/Open?fileId=169024&objectId=122584&objectTypeId=0";
const HARJAVALTA_ID = "8a750f33-3630-4b26-84db-c98743a65bba";
const HARJAVALTA_SELOSTUS_URL =
  "https://harjavalta10.oncloudos.com/kokous/2026364-12-15402.PDF";
const SUOSAARI_ID = "772df07e-88a7-409c-8516-a748b4c86276";
const SUOSAARI_SELOSTUS_URL =
  "https://espoo.oncloudos.com/kokous/20251365-8-283774.PDF";
const PORNAINEN_ID = "6f071fa5-380a-4984-9f10-ac07db598890";
const PORNAINEN_URL =
  "https://pornainen-julkaisu.triplancloud.fi/ktwebscr/fileshow?doctype=7&docid=39992";
const NORDVIRE_II_ID = "a33866dc-1210-4799-85d1-6d7af1415b1a";
const II_SWECO_URL =
  "https://ii.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=2026752-7";
const JOROINEN_ID = "4069cde3-6b44-4e54-994e-c25f56c429ed";

type Asiakirja = {
  url: string;
  asiakirjan_nimi: string;
  laatija: string;
  rooli: string;
  mista_ilmenee?: string;
  lainaus?: string;
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
  tunniste: string;
};

function normalisoiOrgNimi(raaka: string): { org: string; henkiloHuom?: string } | null {
  const n = raaka.trim().replace(/\s+/g, " ");
  if (!n || /^ei ilmene/i.test(n)) return null;
  const ilmanSulkua = n.replace(/\s*\([^)]*\)\s*/g, " ").trim();

  if (/Ramboll/i.test(ilmanSulkua)) {
    return {
      org: "Ramboll Finland Oy",
      henkiloHuom: /Satu Laitinen|Niko Mäkinen|Tiina Heikkilä|Sonja Semeri/i.test(n)
        ? `Henkilöt säilytetty lainauksessa: ${n.slice(0, 120)}`
        : undefined,
    };
  }
  if (/Sweco Finland/i.test(ilmanSulkua)) return { org: "Sweco Finland Oy" };
  if (/Projoplan/i.test(ilmanSulkua)) return { org: "Projoplan Oy" };
  if (/TIKA/i.test(ilmanSulkua)) {
    return {
      org: "TIKA maankäytön suunnittelu",
      henkiloHuom: /Katri Peltoniemi/i.test(n)
        ? "Laatijaksi merkitty Katri Peltoniemi."
        : undefined,
    };
  }
  if (/Karttaako/i.test(ilmanSulkua)) return { org: "Karttaako Oy" };
  if (/FCG/i.test(ilmanSulkua)) return { org: "FCG Rakennettu Ympäristö Oy" };
  if (/Espoon kaupunki/i.test(ilmanSulkua)) return { org: "Espoon kaupunki" };
  if (/Nokian kaupunki/i.test(ilmanSulkua)) {
    return {
      org: "Nokian kaupunki",
      henkiloHuom: /Johanna Fingerroos/i.test(n)
        ? "Projektiarkkitehti Johanna Fingerroos."
        : undefined,
    };
  }
  if (/Pieksämäen kaupunki/i.test(ilmanSulkua)) return { org: "Pieksämäen kaupunki" };
  if (/Otto Arponen|Harri Kahelin|Porin kaupunki|kaupunkisuunnittelu/i.test(n)) {
    return {
      org: "Porin kaupunki",
      henkiloHuom: "Kaavan laatijat: Otto Arponen; 2. ehdotus Harri Kahelin.",
    };
  }
  if (/Granlund/i.test(ilmanSulkua)) return null; // Joroinen: ei kirjata
  if (!onOrganisaatioNimi(ilmanSulkua)) return null;
  return { org: ilmanSulkua };
}

async function haeTaiLuoOrg(sb: SupabaseClient, nimi: string, lahdeUrl: string) {
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
    .eq("ehdottaja_tunniste", e.tunniste);
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
    ehdottaja_tunniste: e.tunniste,
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

function kerääAsiakirjaLaatijat(aineisto: Aineisto): RooliEhdotus[] {
  const out: RooliEhdotus[] = [];
  const nahty = new Set<string>();

  for (const k of aineisto.kohteet) {
    // Joroinen: älä kirjaa Granlundia mistään
    if (k.hanke_id === JOROINEN_ID) continue;
    const hankeId = k.hanke_id;

    for (const a of k.asiakirjat ?? []) {
      if (!["kaavan_laatija", "lupahakemuksen_laatija", "selvityksen_laatija"].includes(a.rooli)) {
        continue;
      }
      const norm = normalisoiOrgNimi(a.laatija);
      if (!norm) {
        console.log("OHITA asiakirja-laatija:", a.laatija, k.hanke_nimi);
        continue;
      }
      const avain = `${hankeId}|${norm.org}|${a.rooli}`;
      if (nahty.has(avain)) continue;
      nahty.add(avain);
      out.push({
        hankeId,
        hankeNimi: k.hanke_nimi,
        orgNimi: norm.org,
        rooli: a.rooli,
        lahdeUrl: a.url,
        lainaus: (a.lainaus || a.mista_ilmenee || norm.org).trim(),
        huomautus: [
          `Erä 3 laatija luettu hankkeen asiakirjasta (${a.rooli}): ${norm.org}.`,
          norm.henkiloHuom,
          a.asiakirjan_nimi,
        ]
          .filter(Boolean)
          .join(" "),
        tunniste: TUN_ASIAKIRJA_LAATIJA,
      });
    }
  }

  // Harjavalta: Ramboll kaavaselostuksesta (asiakirjataso)
  out.push({
    hankeId: HARJAVALTA_ID,
    hankeNimi: "Nscale Harjavalta Campus",
    orgNimi: "Ramboll Finland Oy",
    rooli: "kaavan_laatija",
    lahdeUrl: HARJAVALTA_SELOSTUS_URL,
    lainaus:
      "Projekti Datakeskuksen asemakaava / Ramboll … Laatija Niko Mäkinen, Tiina Heikkilä / Ramboll Finland Oy",
    huomautus:
      "Erä 3 laatija luettu hankkeen asiakirjasta (kaavan_laatija): Ramboll Finland Oy. Asemakaavan selostus.",
    tunniste: TUN_ASIAKIRJA_LAATIJA,
  });

  // Suosaari Espoo
  out.push({
    hankeId: SUOSAARI_ID,
    hankeNimi: "Suosaaren datakeskus, Laajalahti",
    orgNimi: "Espoon kaupunki",
    rooli: "kaavan_laatija",
    lahdeUrl: SUOSAARI_SELOSTUS_URL,
    lainaus: "Laatija-ruutu: Espoon kaupunki (Suosaari kaavaselostus)",
    huomautus:
      "Erä 3 laatija luettu hankkeen asiakirjasta (kaavan_laatija): Espoon kaupunki. Suosaari kaavaselostus.",
    tunniste: TUN_ASIAKIRJA_LAATIJA,
  });

  // Lappeenranta: FCG hulevesiselvitys
  out.push({
    hankeId: LAPPEENRANTA_ID,
    hankeNimi: "Neoen Lappeenranta, Yllikkälä",
    orgNimi: "FCG Rakennettu Ympäristö Oy",
    rooli: "selvityksen_laatija",
    lahdeUrl: FCG_HULEVESI_URL,
    lainaus:
      "Hulevesiselvitys laadittiin FCG Rakennettu Ympäristö Oy:n konsulttityönä; kansi FCG rakennettu ympäristö Oy 22.5.2026",
    huomautus:
      "Erä 3 laatija luettu hankkeen asiakirjasta (selvityksen_laatija): FCG Rakennettu Ympäristö Oy. Hulevesiselvitys.",
    tunniste: TUN_ASIAKIRJA_LAATIJA,
  });

  return out;
}

function kerääPykalaLaatijat(): RooliEhdotus[] {
  return [
    {
      hankeId: PORNAINEN_ID,
      hankeNimi: "Regant Pornainen, Portti",
      orgNimi: "Karttaako Oy",
      rooli: "kaavan_laatija",
      lahdeUrl: PORNAINEN_URL,
      lainaus:
        "Pornaisten kunta päättää valita osa-alueen 2 kaavoitustyön toteuttajaksi Karttaako Oy:n.",
      huomautus:
        "Erä 3 laatija kunnan pykälästä (esitetty/hyväksytty, asiakirjaa ei luettu kansilehdeltä): Karttaako Oy.",
      tunniste: TUN_PYKALA_LAATIJA,
    },
    {
      hankeId: NORDVIRE_II_ID,
      hankeNimi: "NordVire Ii, Isokangas",
      orgNimi: "Sweco Finland Oy",
      rooli: "kaavan_laatija",
      lahdeUrl: II_SWECO_URL,
      lainaus: "valita … konsultiksi Sweco Finland Oy:n",
      huomautus:
        "Erä 3 laatija kunnan pykälästä (esitetty/hyväksytty, asiakirjaa ei luettu kansilehdeltä): Sweco Finland Oy. Kh 28.9.2026 §226.",
      tunniste: TUN_PYKALA_LAATIJA,
    },
  ];
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
    .eq("tila", "odottaa")
    .limit(1);
  if (odottaa?.length) return "jo";

  const sallitut = ["paatos", "viranomaisasiakirja", "hankkeen_oma"] as const;
  const lahdeTyyppi = sallitut.includes(p.lahde_tyyppi as (typeof sallitut)[number])
    ? (p.lahde_tyyppi as (typeof sallitut)[number])
    : "viranomaisasiakirja";

  let huomautus =
    `Erä 3 puuttuva asiakirja (${lahdeTyyppi}). ${p.julkaisija ?? k.kunta}. ${p.mita_ilmenee ?? ""}`.trim();
  if (k.hanke_id === JOROINEN_ID && /Granlund/i.test(p.laatija ?? "")) {
    huomautus +=
      " HUOM: Granlund Oy on vain esitetty kaavoituskonsultiksi — ei kirjattu kaavan_laatijaksi.";
  }

  if (kuiva) return "uusi";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "kunta_havainto",
    hanke_id: k.hanke_id,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_ASIAKIRJA,
    lahde_url: p.url,
    huomautus,
    tila: "odottaa",
    sisalto: {
      kentat: {},
      kunta: {
        kunta_nimi: k.kunta,
        jarjestelma: "grok_lahdeselvitys_era3",
        otsikko: p.asiakirjan_nimi,
        hakusana: TUN_ASIAKIRJA,
        grok_lahde_tyyppi: lahdeTyyppi,
        grok_julkaisija: p.julkaisija ?? null,
        grok_julkaistu_pvm:
          p.paivays && /^\d{4}-\d{2}-\d{2}$/.test(p.paivays) ? p.paivays : null,
        grok_ilmenee: p.mita_ilmenee ?? null,
        dokumentit: [
          {
            url: p.url,
            otsikko: p.asiakirjan_nimi,
            laji: "muu",
            muoto: p.url.toLowerCase().includes(".pdf") ? "pdf" : "html",
            lahde_tyyppi: lahdeTyyppi,
            julkaisija: p.julkaisija ?? null,
            julkaistu_pvm:
              p.paivays && /^\d{4}-\d{2}-\d{2}$/.test(p.paivays) ? p.paivays : null,
          },
        ],
      },
      era3: { osa: "puuttuva_asiakirja" },
    },
  });
  if (error) throw new Error(`${k.hanke_nimi} ${p.url}: ${error.message}`);
  return "uusi";
}

async function jonoMerijarviHuomautus(sb: SupabaseClient, kuiva: boolean): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "taydennys")
    .eq("hanke_id", MERIJARVI_ID)
    .eq("ehdottaja_tunniste", TUN_HUOMAUTUS)
    .eq("tila", "odottaa")
    .limit(1);
  if (odottaa?.length) return "jo";
  if (kuiva) return "uusi";

  const teksti =
    "Kv 15.6.2026 pöytäkirja on skannattu PDF ilman tekstikerrosta; kaavan laatijaa ei voitu lukea.";
  const lainaus =
    "Listan Kv 15.6.2026 pöytäkirja-PDF on skannattu (ei tekstikerrosta); kansilehti katsottu kuvana, sisältöä ei luettu.";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "taydennys",
    hanke_id: MERIJARVI_ID,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_HUOMAUTUS,
    lahde_url: MERIJARVI_KV_URL,
    huomautus: "Erä 3: Merijärvi — skannattu pöytäkirja ilman tekstikerrosta.",
    tila: "odottaa",
    sisalto: {
      huomio: "hanke-huomautus",
      kentat: {
        huomautus: {
          arvo: teksti,
          lahde_url: MERIJARVI_KV_URL,
          lahde_sivu: null,
          lahde_laji: "dokumentti",
          vahvistettu_pvm: PVM,
          luottamus: "epavarma",
          lainaus,
        },
      },
    },
  });
  if (error) throw new Error(`Merijärvi huomautus: ${error.message}`);
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
    laatijat_asiakirja_uusi: 0,
    laatijat_asiakirja_jo: 0,
    laatijat_pykala_uusi: 0,
    laatijat_pykala_jo: 0,
    asiakirjat_uusi: 0,
    asiakirjat_jo: 0,
    merijarvi_huomautus: "" as string,
    joroinen_granlund_ohitettu: 0,
  };

  for (const e of kerääAsiakirjaLaatijat(aineisto)) {
    const orgId = kuiva ? "kuiva" : await haeTaiLuoOrg(sb, e.orgNimi, e.lahdeUrl);
    const tulos = kuiva ? ("uusi" as const) : await jonoRooli(sb, e, orgId, kuiva);
    if (tulos === "uusi") raportti.laatijat_asiakirja_uusi += 1;
    else raportti.laatijat_asiakirja_jo += 1;
    console.log(`asiakirja-laatija ${e.rooli}: ${e.orgNimi} → ${e.hankeNimi} [${tulos}]`);
  }

  for (const e of kerääPykalaLaatijat()) {
    const orgId = kuiva ? "kuiva" : await haeTaiLuoOrg(sb, e.orgNimi, e.lahdeUrl);
    const tulos = kuiva ? ("uusi" as const) : await jonoRooli(sb, e, orgId, kuiva);
    if (tulos === "uusi") raportti.laatijat_pykala_uusi += 1;
    else raportti.laatijat_pykala_jo += 1;
    console.log(`pykälä-laatija ${e.rooli}: ${e.orgNimi} → ${e.hankeNimi} [${tulos}]`);
  }

  for (const k of aineisto.kohteet) {
    for (const p of k.puuttuvat_asiakirjat ?? []) {
      const tulos = await jonoAsiakirja(sb, k, p, kuiva);
      if (tulos === "uusi") raportti.asiakirjat_uusi += 1;
      else raportti.asiakirjat_jo += 1;
    }
  }

  // Varmista ettei Granlund-roolia ole jonossa Joroisiin
  const { data: granlundJono } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus")
    .eq("hanke_id", JOROINEN_ID)
    .eq("tyyppi", "hanke_organisaatio")
    .eq("tila", "odottaa")
    .ilike("huomautus", "%Granlund%");
  raportti.joroinen_granlund_ohitettu = (granlundJono ?? []).length;

  raportti.merijarvi_huomautus = await jonoMerijarviHuomautus(sb, kuiva);
  console.log(JSON.stringify(raportti, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
