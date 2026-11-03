/**
 * Grok lähdeselvitys erä 2 (laatijat + puuttuvat asiakirjat + haut + epävarmat).
 *
 * Aineisto: agents/data/grok-lahdeselvitys-era2-2026-10-11.json
 * Aja: npx tsx scripts/tuo-grok-lahdeselvitys-era2.ts [--kuiva]
 *
 * Tunnisteet:
 *   grok_lahdeselvitys_era2_laatijat_asiakirja — luettu hankkeen omasta asiakirjasta
 *   grok_lahdeselvitys_era2_laatijat_pykala    — kunnan pykälässä esitetty/hyväksytty
 *   grok_lahdeselvitys_era2_asiakirjat         — puuttuvat asiakirjat
 *   grok_lahdeselvitys_era2_epavarma           — kohdistamattomat epävarmat
 *   grok_lahdeselvitys_era2_huomautus          — Veteli: laatija selvittämättä
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { onOrganisaatioNimi } from "../src/lib/organisaatio-nimi";

const TIEDOSTO = resolve(
  process.cwd(),
  "agents/data/grok-lahdeselvitys-era2-2026-10-11.json",
);
const PVM = "2026-10-11";
const TUN_ASIAKIRJA_LAATIJA = "grok_lahdeselvitys_era2_laatijat_asiakirja";
const TUN_PYKALA_LAATIJA = "grok_lahdeselvitys_era2_laatijat_pykala";
const TUN_ASIAKIRJA = "grok_lahdeselvitys_era2_asiakirjat";
const TUN_EPAVARMA = "grok_lahdeselvitys_era2_epavarma";
const TUN_HUOMAUTUS = "grok_lahdeselvitys_era2_huomautus";
const TUN_HAKU = "grok_lahdeselvitys_era2_haku";

const VETELI_ID = "a096c49c-e961-44e6-825a-0f41b09e4bbc";
const TERVOLA_ID = "3f02c7bf-7b92-4346-954e-2df075643383";
const EURA_ID = "599c9794-9ced-4da2-97e9-9325acbf6c66";
const VAASA_ID = "7a10bbea-b7f3-4ada-8734-02bc16486378";
const GREENSKY_LAPINLAHTI_ID = "8a10b757-a095-4dc3-a74f-d379d8180f0a";

const VETELI_OAS_URL =
  "https://dynastyjulkaisu.kase.fi/D10_Veteli/kokous/2026219-4-6668.PDF";
const EURA_JUHOLA_URL =
  "https://eura10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=2026397-13";

const LUONTO_PIHLAJA_URL =
  "https://dynasty.lapinlahti.fi/Internet/kuulutus/D3E37351XE630X47BBXA4E7XC60C9D4ADB1D.45248.PDF";
const WELADO_URL =
  "https://dynasty.lapinlahti.fi/Internet/kuulutus/D3E37351XE630X47BBXA4E7XC60C9D4ADB1D.45249.PDF";

type Asiakirja = {
  url: string;
  asiakirjan_nimi: string;
  laatija: string;
  rooli: string;
  mista_ilmenee?: string;
  paivays?: string;
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
  tunniste: string;
};

function normalisoiOrgNimi(raaka: string): { org: string; henkiloHuom?: string } | null {
  const n = raaka.trim().replace(/\s+/g, " ");
  if (!n || n.toLowerCase() === "ei ilmene") return null;

  // Poista sulkuhuomautukset tyypistä "(päätöksessä…)"
  const ilmanSulkua = n.replace(/\s*\([^)]*\)\s*/g, " ").trim();

  if (/Tuomas Turpeinen/i.test(ilmanSulkua) && /Keravan kaupunki/i.test(ilmanSulkua)) {
    return {
      org: "Keravan kaupunki",
      henkiloHuom: "Laatijaksi merkitty Tuomas Turpeinen (kaavoituspäällikkö).",
    };
  }
  if (/KAUPUNKIRAKENNEPALVELUT/i.test(ilmanSulkua) || /Hämeenlinnan kaupunki/i.test(ilmanSulkua)) {
    return {
      org: "Hämeenlinnan kaupunki",
      henkiloHuom: "Asiakirjassa: KAUPUNKIRAKENNEPALVELUT – KAAVOITUS.",
    };
  }
  if (/Espoon kaupunki/i.test(ilmanSulkua)) {
    return { org: "Espoon kaupunki" };
  }
  if (/Luonto Pihlaja/i.test(ilmanSulkua)) {
    return {
      org: "Luonto Pihlaja Oy",
      henkiloHuom: "Selvityksen laatija: Tuomo Pihlaja.",
    };
  }
  if (/WELADO/i.test(ilmanSulkua)) {
    return { org: "WELADO DESIGN" };
  }
  if (/Plandea/i.test(ilmanSulkua)) {
    return {
      org: "Plandea Oy",
      henkiloHuom: /Ville Vihanta/i.test(n)
        ? "Pykälässä kaavan laatijaksi Ville Vihanta."
        : undefined,
    };
  }
  if (/Nosto Consulting/i.test(ilmanSulkua)) {
    return {
      org: "Nosto Consulting Oy",
      henkiloHuom: /Pasi Lappalainen/i.test(n)
        ? "Aloitteessa esitetty Pasi Lappalainen."
        : "Esitetty kaavan laativaksi konsultiksi; asiakirjaa ei luettu kansilehdeltä.",
    };
  }
  if (/Sweco Finland/i.test(ilmanSulkua)) {
    return { org: "Sweco Finland Oy" };
  }
  if (/Projoplan/i.test(ilmanSulkua)) {
    return { org: "Projoplan Oy" };
  }

  if (!onOrganisaatioNimi(ilmanSulkua)) return null;
  return { org: ilmanSulkua };
}

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
    for (const a of k.asiakirjat ?? []) {
      if (!["kaavan_laatija", "lupahakemuksen_laatija", "selvityksen_laatija"].includes(a.rooli)) {
        continue;
      }
      const norm = normalisoiOrgNimi(a.laatija);
      if (!norm) {
        console.log("OHITA henkilö/epäselvä asiakirja-laatija:", a.laatija, k.hanke_nimi);
        continue;
      }
      const avain = `${k.hanke_id}|${norm.org}|${a.rooli}|asiakirja`;
      if (nahty.has(avain)) continue;
      nahty.add(avain);

      const lainaus = (a.lainaus || a.mista_ilmenee || norm.org).trim();
      out.push({
        hankeId: k.hanke_id,
        hankeNimi: k.hanke_nimi,
        orgNimi: norm.org,
        rooli: a.rooli,
        lahdeUrl: a.url,
        lainaus,
        huomautus: [
          `Erä 2 laatija luettu hankkeen asiakirjasta (${a.rooli}): ${norm.org}.`,
          norm.henkiloHuom,
          a.asiakirjan_nimi,
        ]
          .filter(Boolean)
          .join(" "),
        tunniste: TUN_ASIAKIRJA_LAATIJA,
      });
    }
  }

  // Greensky Lapinlahti: selvityksen_laatijat omista selvityksistään
  out.push({
    hankeId: GREENSKY_LAPINLAHTI_ID,
    hankeNimi: "Greensky Lapinlahti, Alapitkä",
    orgNimi: "Luonto Pihlaja Oy",
    rooli: "selvityksen_laatija",
    lahdeUrl: LUONTO_PIHLAJA_URL,
    lainaus: "Selvityksen laatija: Tuomo Pihlaja, Luonto Pihlaja Oy",
    huomautus:
      "Erä 2 laatija luettu hankkeen asiakirjasta (selvityksen_laatija): Luonto Pihlaja Oy. Alapitkän asemakaavan luontoselvitys 2026.",
    tunniste: TUN_ASIAKIRJA_LAATIJA,
  });
  out.push({
    hankeId: GREENSKY_LAPINLAHTI_ID,
    hankeNimi: "Greensky Lapinlahti, Alapitkä",
    orgNimi: "WELADO DESIGN",
    rooli: "selvityksen_laatija",
    lahdeUrl: WELADO_URL,
    lainaus: "logo WELADO DESIGN (hulevesiselvitys ja vesienhallintasuunnitelma)",
    huomautus:
      "Erä 2 laatija luettu hankkeen asiakirjasta (selvityksen_laatija): WELADO DESIGN. Hulevesiselvitys liite 5; nimiö/logo.",
    tunniste: TUN_ASIAKIRJA_LAATIJA,
  });

  return out;
}

function kerääPykalaLaatijat(aineisto: Aineisto): RooliEhdotus[] {
  const out: RooliEhdotus[] = [];
  const säännöt: {
    hankeId: string;
    org: string;
    urlSisaltaa?: string;
    kunta?: string;
    hankeNimiSisaltaa?: string;
    laatijaSisaltaa: string;
  }[] = [
    {
      hankeId: "f82bc855-1cb2-4a5e-aac9-a7c6530eeaf6",
      org: "Plandea Oy",
      kunta: "Toholampi",
      laatijaSisaltaa: "Plandea",
    },
    {
      hankeId: "835ee5c4-903d-4a08-b4f7-5d17dc4aca87",
      org: "Plandea Oy",
      kunta: "Halsua",
      laatijaSisaltaa: "Plandea",
    },
    {
      hankeId: "60073159-2736-4d0b-aad8-947fc04d2909",
      org: "Nosto Consulting Oy",
      hankeNimiSisaltaa: "Helios Lapinlahti",
      laatijaSisaltaa: "Nosto",
      urlSisaltaa: "meetingitem",
    },
  ];

  for (const s of säännöt) {
    const k = aineisto.kohteet.find((x) => x.hanke_id === s.hankeId);
    if (!k) continue;
    const p = (k.puuttuvat_asiakirjat ?? []).find((r) => {
      if (!r.laatija?.includes(s.laatijaSisaltaa)) return false;
      if (s.urlSisaltaa && !r.url.includes(s.urlSisaltaa)) return false;
      // Veteliä ei koskaan
      if (k.hanke_id === VETELI_ID) return false;
      return r.lahde_tyyppi === "paatos" || r.url.includes("meetingitem") || r.url.includes("fileshow");
    });
    if (!p) {
      console.log("VAROITUS: pykälä-laatijaa ei löytynyt", s.org, s.hankeId);
      continue;
    }
    const norm = normalisoiOrgNimi(p.laatija ?? s.org);
    if (!norm) continue;
    out.push({
      hankeId: k.hanke_id,
      hankeNimi: k.hanke_nimi,
      orgNimi: norm.org,
      rooli: "kaavan_laatija",
      lahdeUrl: p.url,
      lainaus: (p.mita_ilmenee || p.laatija || norm.org).slice(0, 400),
      huomautus: [
        `Erä 2 laatija kunnan pykälästä (esitetty/hyväksytty, asiakirjaa ei luettu kansilehdeltä): ${norm.org}.`,
        norm.henkiloHuom,
        p.asiakirjan_nimi,
      ]
        .filter(Boolean)
        .join(" "),
      tunniste: TUN_PYKALA_LAATIJA,
    });
  }

  // Kolme Iin hanketta: Sweco Finland Oy, Kh §226
  const iiIdt = [
    "f2f95884-e5fb-4325-9281-b4d0cc0f380d", // Helios Ii
    "dbd635f7-b712-49b6-b56b-3ed61c1c9f2d", // Ingrid
    "6fa0f09f-a0c4-4815-91d8-28b7790fdac6", // Isokangas Infrastructure
  ];
  for (const id of iiIdt) {
    const k = aineisto.kohteet.find((x) => x.hanke_id === id);
    if (!k) continue;
    const p = (k.puuttuvat_asiakirjat ?? []).find(
      (r) => r.laatija?.includes("Sweco") && r.url.includes("2026752-7"),
    );
    if (!p) {
      console.log("VAROITUS: Sweco-pykälää ei löytynyt", k.hanke_nimi);
      continue;
    }
    out.push({
      hankeId: k.hanke_id,
      hankeNimi: k.hanke_nimi,
      orgNimi: "Sweco Finland Oy",
      rooli: "kaavan_laatija",
      lahdeUrl: p.url,
      lainaus: (p.mita_ilmenee || "valita … konsultiksi Sweco Finland Oy").slice(0, 400),
      huomautus: `Erä 2 laatija kunnan pykälästä (esitetty/hyväksytty, asiakirjaa ei luettu kansilehdeltä): Sweco Finland Oy. ${p.asiakirjan_nimi}`,
      tunniste: TUN_PYKALA_LAATIJA,
    });
  }

  return out;
}

async function jonoAsiakirja(
  sb: SupabaseClient,
  k: Kohde,
  p: Puuttuva,
  kuiva: boolean,
): Promise<"uusi" | "jo" | "ohita"> {
  // Eura Juhola: epävarma kohdistus — ei hankkeeseen
  if (p.url === EURA_JUHOLA_URL || p.url.includes("2026397-13")) {
    return "ohita";
  }

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

  const huomautus =
    `Erä 2 puuttuva asiakirja (${lahdeTyyppi}). ${p.julkaisija ?? k.kunta}. ${p.mita_ilmenee ?? ""}`.trim();

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
        jarjestelma: "grok_lahdeselvitys_era2",
        otsikko: p.asiakirjan_nimi,
        hakusana: TUN_ASIAKIRJA,
        grok_lahde_tyyppi: lahdeTyyppi,
        grok_julkaisija: p.julkaisija ?? null,
        grok_julkaistu_pvm: p.paivays && /^\d{4}-\d{2}-\d{2}$/.test(p.paivays) ? p.paivays : null,
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
      era2: { osa: "puuttuva_asiakirja" },
    },
  });
  if (error) throw new Error(`${k.hanke_nimi} ${p.url}: ${error.message}`);
  return "uusi";
}

async function jonoEpavarmaEura(sb: SupabaseClient, kuiva: boolean): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "kunta_havainto")
    .eq("lahde_url", EURA_JUHOLA_URL)
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
    lahde_url: EURA_JUHOLA_URL,
    huomautus:
      "Erä 2 epävarma kohdistus: Kh 24.8.2026 Kaavoituspyyntö Juhola-kiinteistölle. Älä liitä Gridnode Eura Paneliaan arvaamalla.",
    tila: "odottaa",
    sisalto: {
      kentat: {},
      kunta: {
        kunta_nimi: "Eura",
        jarjestelma: "grok_lahdeselvitys_era2",
        otsikko: "Kh 24.8.2026 Kaavoituspyyntö Juhola -nimiselle kiinteistölle",
        hakusana: TUN_EPAVARMA,
        grok_lahde_tyyppi: "paatos",
        dokumentit: [
          {
            url: EURA_JUHOLA_URL,
            otsikko: "Kh 24.8.2026 Kaavoituspyyntö Juhola -nimiselle kiinteistölle",
            laji: "muu",
            muoto: "html",
            lahde_tyyppi: "paatos",
          },
        ],
      },
      era2: {
        osa: "epavarma_kohdistus",
        ehdokas_hankkeet: ["Gridnode Eura, Panelia"],
        luottamus: "epavarma",
      },
    },
  });
  if (error) throw new Error(`Eura epävarmä: ${error.message}`);
  return "uusi";
}

async function jonoVeteliHuomautus(sb: SupabaseClient, kuiva: boolean): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "taydennys")
    .eq("hanke_id", VETELI_ID)
    .eq("ehdottaja_tunniste", TUN_HUOMAUTUS)
    .eq("tila", "odottaa")
    .limit(1);
  if (odottaa?.length) return "jo";

  if (kuiva) return "uusi";

  const teksti =
    "Kaavan laatija on selvittämättä: OAS:n kansilehdellä on vain logo (PLANDEA), ei kirjoitettua organisaationimeä.";
  const lainaus =
    "VETELIN KUNTA / Laurinnevan osayleiskaava / Osallistumis- ja arviointisuunnitelma 7.5.2026 + logo PLANDEA; yhteystiedoissa vain kunnanjohtaja ja tekninen johtaja";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "taydennys",
    hanke_id: VETELI_ID,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_HUOMAUTUS,
    lahde_url: VETELI_OAS_URL,
    huomautus: "Erä 2: Veteli — Plandeaa ei kirjata laatijaksi (vain logo).",
    tila: "odottaa",
    sisalto: {
      huomio: "hanke-huomautus",
      kentat: {
        huomautus: {
          arvo: teksti,
          lahde_url: VETELI_OAS_URL,
          lahde_sivu: null,
          lahde_laji: "dokumentti",
          vahvistettu_pvm: PVM,
          luottamus: "epavarma",
          lainaus,
        },
      },
    },
  });
  if (error) throw new Error(`Veteli huomautus: ${error.message}`);
  return "uusi";
}

async function kirjaaHaku(
  sb: SupabaseClient,
  opts: {
    hankeId: string;
    jarjestelma: string;
    hakusanat: string;
    osumia: number;
    yhteenveto: string;
  },
  kuiva: boolean,
): Promise<"uusi" | "jo"> {
  const { data: aiempi } = await sb
    .from("hanke_lahdehaut")
    .select("id")
    .eq("hanke_id", opts.hankeId)
    .eq("ajankohta", PVM)
    .eq("suorittaja", TUN_HAKU)
    .maybeSingle();
  if (aiempi?.id) return "jo";

  if (kuiva) return "uusi";

  const { error } = await sb.from("hanke_lahdehaut").insert({
    hanke_id: opts.hankeId,
    jarjestelma: opts.jarjestelma,
    hakusanat: opts.hakusanat,
    ajankohta: PVM,
    osumia: opts.osumia,
    yhteenveto: opts.yhteenveto,
    suorittaja: TUN_HAKU,
    hakijan_tyyppi: "ulkopuolinen_selvitys",
    tila: "odottaa",
  });
  if (error) throw new Error(`haku ${opts.hankeId}: ${error.message}`);
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
    asiakirjat_ohita: 0,
    epavarma_eura: "" as string,
    veteli_huomautus: "" as string,
    haut: {} as Record<string, string>,
  };

  for (const e of kerääAsiakirjaLaatijat(aineisto)) {
    const orgId = kuiva ? "kuiva" : await haeTaiLuoOrg(sb, e.orgNimi, e.lahdeUrl);
    const tulos = kuiva ? ("uusi" as const) : await jonoRooli(sb, e, orgId, kuiva);
    if (tulos === "uusi") raportti.laatijat_asiakirja_uusi += 1;
    else raportti.laatijat_asiakirja_jo += 1;
    console.log(`asiakirja-laatija ${e.rooli}: ${e.orgNimi} → ${e.hankeNimi} [${tulos}]`);
  }

  for (const e of kerääPykalaLaatijat(aineisto)) {
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
      else if (tulos === "jo") raportti.asiakirjat_jo += 1;
      else raportti.asiakirjat_ohita += 1;
    }
  }

  raportti.epavarma_eura = await jonoEpavarmaEura(sb, kuiva);
  raportti.veteli_huomautus = await jonoVeteliHuomautus(sb, kuiva);

  raportti.haut.tervola = await kirjaaHaku(
    sb,
    {
      hankeId: TERVOLA_ID,
      jarjestelma: "Tervola KTweb (tervola.ktweb.fi)",
      hakusanat: "datakesk, Koivu, Helios, Cranberry (ei voitu ajaa)",
      osumia: 0,
      yhteenveto:
        "Järjestelmä ei avautunut 11.10.2026: curl TLS-virhe (unexpected eof), WebFetch HTTP 500. Hakua ei voitu ajaa.",
    },
    kuiva,
  );
  raportti.haut.eura = await kirjaaHaku(
    sb,
    {
      hankeId: EURA_ID,
      jarjestelma: "Eura Dynasty 10 (eura10.oncloudos.com)",
      hakusanat: "Panelia, datakesk, Gridnode",
      osumia: 0,
      yhteenveto:
        "Haku tehty. Hankkeen (Panelia / Gridnode) kaavapäätöksiä tai asiakirjoja ei ollut julkaisussa. Juhola-kaavoituspyyntö jätetty epävarmaksi kohdistukseksi.",
    },
    kuiva,
  );
  raportti.haut.vaasa = await kirjaaHaku(
    sb,
    {
      hankeId: VAASA_ID,
      jarjestelma: "Vaasa Tweb (tweb.vaasa.fi)",
      hakusanat: "datakeskus, datakeskuksen, Microsoft, Mustasaari, asemakaava",
      osumia: 0,
      yhteenveto:
        "Haku tehty (WebFetch; curl TLS-virhe). Hankkeen asiakirjoja ei ollut julkaisussa (ei ak110/GigaVaasa-kaavaa).",
    },
    kuiva,
  );

  console.log(JSON.stringify(raportti, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
