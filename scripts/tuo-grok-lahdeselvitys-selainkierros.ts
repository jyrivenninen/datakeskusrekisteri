/**
 * Selainkierros (Lähdeselvitys 14 / avoimet_kierros.json).
 * Aja: npx tsx scripts/tuo-grok-lahdeselvitys-selainkierros.ts [--kuiva]
 *
 * Tunnisteet erottavat erien 1–4 kirjauksista:
 *   grok_lahdeselvitys_selainkierros_laatijat
 *   grok_lahdeselvitys_selainkierros_asiakirjat
 *   grok_lahdeselvitys_selainkierros_huomautus
 *   grok_lahdeselvitys_selainkierros_eura_kohdistus
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { onOrganisaatioNimi } from "../src/lib/organisaatio-nimi";

const TIEDOSTO = resolve(process.cwd(), "agents/data/avoimet_kierros-2026-10-11.json");
const AVOIMET_TIEDOSTO = resolve(process.cwd(), "agents/data/avoimet-2026-10-11.json");
const PVM = "2026-10-11";
const TUN_LAATIJA = "grok_lahdeselvitys_selainkierros_laatijat";
const TUN_ASIAKIRJA = "grok_lahdeselvitys_selainkierros_asiakirjat";
const TUN_HUOMAUTUS = "grok_lahdeselvitys_selainkierros_huomautus";
const TUN_EURA = "grok_lahdeselvitys_selainkierros_eura_kohdistus";
const TUN_ERA2_EPAVARMA = "grok_lahdeselvitys_era2_epavarma";

const EURA_JUHOLA_URL =
  "https://eura10.oncloudos.com/cgi/DREQUEST.PHP?page=meetingitem&id=2026397-13";
const GRIDNODE_ID = "599c9794-9ced-4da2-97e9-9325acbf6c66";
const MERIJARVI_ID = "e30c8dd4-95a9-4eb9-a864-0ba6360b1dae";
const MERIJARVI_KV_URL =
  "https://www.merijarvi.fi/sites/default/files/liitetiedosto/asiakirjat/Kvalt.%2026-06-15%20p%C3%B6yt%C3%A4kirja.pdf";
const BILTTEK_ID = "2667d064-9581-45f2-88cd-bccee17bcb61";
const BILTTEK_PIIRUSTUS_URL = "https://kemi.oncloudos.com/kokous/2025717-3-43961.PDF";
const KONTIOLAHTI_VELLAMO_ID = "807b7292-9635-483e-a8e5-bc11840d38b6";

type Asiakirja = {
  url?: string;
  asiakirjan_nimi: string;
  laatija?: string;
  laatija_henkilo?: string;
  rooli?: string;
  mista_ilmenee?: string;
  lainaus?: string;
  tyyppi?: string;
};
type Puuttuva = {
  url?: string;
  asiakirjan_nimi: string;
  lahde_tyyppi?: string;
  julkaisija?: string;
  paivays?: string;
  huom?: string;
  mita_ilmenee?: string;
};
type Kohde = {
  hanke_id: string;
  hanke_nimi: string;
  kunta?: string;
  ratkesi?: string;
  syy?: string;
  ehdotettu_keino?: string;
  kohdistuu_hankkeeseen?: string;
  asiakirjat?: Asiakirja[];
  puuttuvat_asiakirjat?: Puuttuva[];
};
type Aineisto = { kierros?: string; pvm?: string; kohteet: Kohde[] };
type RooliEhdotus = {
  hankeId: string;
  hankeNimi: string;
  orgNimi: string;
  rooli: string;
  lahdeUrl: string;
  lainaus: string;
  huomautus: string;
};

function normalisoiOrgNimi(
  raaka: string,
  henkilo?: string,
): { org: string; henkiloHuom?: string } | null {
  const n = raaka.trim().replace(/\s+/g, " ");
  if (!n || /^ei ilmene/i.test(n)) return null;

  if (/Salon kaupungin maankäyttöpalvelut|Salon kaupunki/i.test(n)) {
    return {
      org: "Salon kaupunki",
      henkiloHuom: /Juha Mäki/i.test(`${n} ${henkilo ?? ""}`)
        ? "Laatijaksi merkitty yleiskaavapäällikkö Juha Mäki."
        : undefined,
    };
  }
  if (/Plandea/i.test(n)) {
    return {
      org: "Plandea Oy",
      henkiloHuom: /Ville Vihanta/i.test(`${n} ${henkilo ?? ""}`)
        ? "Kaavan laatija YKS 691 Ville Vihanta."
        : undefined,
    };
  }
  if (/Sweco Finland/i.test(n)) {
    return {
      org: "Sweco Finland Oy",
      henkiloHuom: /Juuso Pajukko/i.test(`${n} ${henkilo ?? ""}`)
        ? "Suunnittelija Juuso Pajukko, arkkitehti SAFA."
        : undefined,
    };
  }
  if (!onOrganisaatioNimi(n)) return null;
  return { org: n };
}

function paatteleLahdeTyyppi(a: { tyyppi?: string; asiakirjan_nimi?: string; lahde_tyyppi?: string }) {
  if (a.lahde_tyyppi && ["paatos", "viranomaisasiakirja", "hankkeen_oma"].includes(a.lahde_tyyppi)) {
    return a.lahde_tyyppi as "paatos" | "viranomaisasiakirja" | "hankkeen_oma";
  }
  const t = `${a.tyyppi ?? ""} ${a.asiakirjan_nimi ?? ""}`.toLowerCase();
  if (/pöytäkirja|pykälä|paatos|päätös/.test(t)) return "paatos";
  if (/oas|selostus|kaavakartta|piirustus|sopimus/.test(t)) return "viranomaisasiakirja";
  return "viranomaisasiakirja";
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
  const nahty = new Set<string>();

  for (const k of aineisto.kohteet) {
    if (k.ratkesi !== "kylla") continue;
    for (const a of k.asiakirjat ?? []) {
      if (!a.url?.startsWith("http")) continue;
      if (
        !["kaavan_laatija", "lupahakemuksen_laatija", "selvityksen_laatija"].includes(a.rooli ?? "")
      ) {
        continue;
      }
      // Logo ilman kirjoitettua nimeä / pelkkä henkilönimi → ei organisaatiota
      if (!a.laatija?.trim()) {
        if (a.laatija_henkilo?.trim()) {
          console.log(
            "OHITA henkilönimi ilman organisaatiota:",
            a.laatija_henkilo,
            k.hanke_nimi,
          );
        }
        continue;
      }
      if (/hakutulos|logo/i.test(a.mista_ilmenee ?? "")) {
        console.log("OHITA logo/hakutulos:", a.laatija, k.hanke_nimi);
        continue;
      }
      const norm = normalisoiOrgNimi(a.laatija, a.laatija_henkilo);
      if (!norm) {
        console.log("OHITA asiakirja-laatija:", a.laatija, k.hanke_nimi);
        continue;
      }
      const avain = `${k.hanke_id}|${norm.org}|${a.rooli}`;
      if (nahty.has(avain)) continue;
      nahty.add(avain);
      out.push({
        hankeId: k.hanke_id,
        hankeNimi: k.hanke_nimi,
        orgNimi: norm.org,
        rooli: a.rooli!,
        lahdeUrl: a.url,
        lainaus: (a.lainaus || a.mista_ilmenee || norm.org).trim(),
        huomautus: [
          `Selainkierros (Lähdeselvitys 14) laatija (${a.rooli}): ${norm.org}.`,
          norm.henkiloHuom,
          a.asiakirjan_nimi,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
  }
  return out;
}

async function jonoAsiakirja(
  sb: SupabaseClient,
  k: Kohde,
  p: Puuttuva,
  kuiva: boolean,
): Promise<"uusi" | "jo" | "ohita"> {
  const url = p.url?.trim();
  if (!url || !/^https?:\/\//i.test(url) || url.endsWith("/2026/09/")) {
    console.log("OHITA asiakirja ilman kelvollista URL:a:", p.asiakirjan_nimi, k.hanke_nimi);
    return "ohita";
  }

  const { data: dok } = await sb.from("dokumentit").select("id").eq("url", url).maybeSingle();
  if (dok) return "jo";
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "kunta_havainto")
    .eq("lahde_url", url)
    .eq("ehdottaja_tunniste", TUN_ASIAKIRJA)
    .eq("tila", "odottaa")
    .limit(1);
  if (odottaa?.length) return "jo";

  const lahdeTyyppi = paatteleLahdeTyyppi(p);
  const kunta = k.kunta ?? k.hanke_nimi.split(",")[0] ?? "";
  const huomautus =
    `Selainkierros (Lähdeselvitys 14) puuttuva asiakirja (${lahdeTyyppi}). ${p.julkaisija ?? kunta}. ${p.huom ?? p.mita_ilmenee ?? ""}`.trim();

  if (kuiva) return "uusi";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "kunta_havainto",
    hanke_id: k.hanke_id,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_ASIAKIRJA,
    lahde_url: url,
    huomautus,
    tila: "odottaa",
    sisalto: {
      kentat: {},
      kunta: {
        kunta_nimi: kunta,
        jarjestelma: "grok_lahdeselvitys_selainkierros",
        otsikko: p.asiakirjan_nimi,
        hakusana: TUN_ASIAKIRJA,
        grok_lahde_tyyppi: lahdeTyyppi,
        grok_julkaisija: p.julkaisija ?? null,
        grok_julkaistu_pvm:
          p.paivays && /^\d{4}-\d{2}-\d{2}$/.test(p.paivays) ? p.paivays : null,
        grok_ilmenee: p.mita_ilmenee ?? p.huom ?? null,
        dokumentit: [
          {
            url,
            otsikko: p.asiakirjan_nimi,
            laji: "muu",
            muoto: url.toLowerCase().includes(".pdf") ? "pdf" : "html",
            lahde_tyyppi: lahdeTyyppi,
            julkaisija: p.julkaisija ?? null,
            julkaistu_pvm:
              p.paivays && /^\d{4}-\d{2}-\d{2}$/.test(p.paivays) ? p.paivays : null,
          },
        ],
      },
      selainkierros: { osa: "puuttuva_asiakirja", kierros: "Lähdeselvitys 14" },
    },
  });
  if (error) throw new Error(`${k.hanke_nimi} ${url}: ${error.message}`);
  return "uusi";
}

async function ratkaiseEura(sb: SupabaseClient, kuiva: boolean) {
  const { data: epavarma } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("lahde_url", EURA_JUHOLA_URL)
    .eq("ehdottaja_tunniste", TUN_ERA2_EPAVARMA)
    .eq("tila", "odottaa");

  if (!kuiva && epavarma?.length) {
    const { error } = await sb
      .from("muutosehdotukset")
      .update({
        tila: "hylatty",
        kasitelty_pvm: new Date().toISOString(),
        kasittelija: "ylläpito",
        huomautus:
          "Selainkierros: Juhola-kaavoituspyyntö kohdistuu Gridnode Eura Paneliaan (Gridnode Oy + datakeskusalue; Paneliassa Alasatakunta). Epävarmuus poistettu.",
      })
      .eq("lahde_url", EURA_JUHOLA_URL)
      .eq("ehdottaja_tunniste", TUN_ERA2_EPAVARMA)
      .eq("tila", "odottaa");
    if (error) throw new Error(`Eura epävarmä hylkäys: ${error.message}`);
  }

  const { data: dok } = await sb
    .from("dokumentit")
    .select("id")
    .eq("url", EURA_JUHOLA_URL)
    .maybeSingle();
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "kunta_havainto")
    .eq("lahde_url", EURA_JUHOLA_URL)
    .eq("ehdottaja_tunniste", TUN_EURA)
    .eq("tila", "odottaa")
    .limit(1);
  if (dok || odottaa?.length) return { epavarma: epavarma?.length ?? 0, asiakirja: "jo" as const };
  if (kuiva) return { epavarma: epavarma?.length ?? 0, asiakirja: "uusi" as const };

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "kunta_havainto",
    hanke_id: GRIDNODE_ID,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_EURA,
    lahde_url: EURA_JUHOLA_URL,
    huomautus:
      "Selainkierros: Kh 24.8.2026 § 197 Kaavoituspyyntö Juhola → Gridnode Eura, Panelia. Hakija Gridnode Oy, datakeskusalue; Paneliassa Alasatakunta-artikkeli.",
    tila: "odottaa",
    sisalto: {
      kentat: {},
      kunta: {
        kunta_nimi: "Eura",
        jarjestelma: "grok_lahdeselvitys_selainkierros",
        otsikko: "Kh 24.8.2026 § 197 Kaavoituspyyntö Juhola -nimiselle kiinteistölle",
        hakusana: TUN_EURA,
        grok_lahde_tyyppi: "paatos",
        dokumentit: [
          {
            url: EURA_JUHOLA_URL,
            otsikko: "Kh 24.8.2026 § 197 Kaavoituspyyntö Juhola -nimiselle kiinteistölle",
            laji: "muu",
            muoto: "html",
            lahde_tyyppi: "paatos",
            julkaisija: "Euran kunta",
            julkaistu_pvm: "2026-08-24",
          },
        ],
      },
      selainkierros: { osa: "eura_kohdistus_ratkaistu", kierros: "Lähdeselvitys 14" },
    },
  });
  if (error) throw new Error(`Eura kohdistus: ${error.message}`);
  return { epavarma: epavarma?.length ?? 0, asiakirja: "uusi" as const };
}

async function jonoHuomautus(
  sb: SupabaseClient,
  hankeId: string,
  lahdeUrl: string,
  teksti: string,
  lainaus: string,
  huomautus: string,
  kuiva: boolean,
): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "taydennys")
    .eq("hanke_id", hankeId)
    .eq("ehdottaja_tunniste", TUN_HUOMAUTUS)
    .eq("tila", "odottaa")
    .limit(1);
  if (odottaa?.length) return "jo";
  if (kuiva) return "uusi";

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "taydennys",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: TUN_HUOMAUTUS,
    lahde_url: lahdeUrl,
    huomautus,
    tila: "odottaa",
    sisalto: {
      huomio: "hanke-huomautus",
      kentat: {
        huomautus: {
          arvo: teksti,
          lahde_url: lahdeUrl,
          lahde_sivu: null,
          lahde_laji: "dokumentti",
          vahvistettu_pvm: PVM,
          luottamus: "epavarma",
          lainaus,
        },
      },
    },
  });
  if (error) throw new Error(`huomautus ${hankeId}: ${error.message}`);
  return "uusi";
}

function paivitaAvoimetLista(aineisto: Aineisto) {
  if (!existsSync(AVOIMET_TIEDOSTO)) {
    console.log("Avoimet-lista puuttuu, ohitetaan tilapäivitys.");
    return;
  }
  const avoimet = JSON.parse(readFileSync(AVOIMET_TIEDOSTO, "utf8")) as Array<
    Record<string, unknown> & { hanke_id: string; ehdotettu_keino?: string }
  >;
  const ratkenneet = new Set(
    aineisto.kohteet.filter((k) => k.ratkesi === "kylla").map((k) => k.hanke_id),
  );
  const eiRatkenneet = new Set(
    aineisto.kohteet.filter((k) => k.ratkesi === "ei").map((k) => k.hanke_id),
  );

  // 11 avointa → odottaa tietopyyntöä: kierroksen ei-ratkenneet + aiemmat tietopyyntö-kohteet + Vellamo
  const tietopyyntoIdt = new Set<string>([
    ...eiRatkenneet,
    KONTIOLAHTI_VELLAMO_ID,
    ...avoimet
      .filter((a) => a.ehdotettu_keino === "tietopyyntö")
      .map((a) => a.hanke_id),
  ]);

  const paivitetty = avoimet.map((a) => {
    if (ratkenneet.has(a.hanke_id)) {
      return { ...a, tila: "ratkesi_selainkierroksella", ehdotettu_keino: a.ehdotettu_keino };
    }
    if (tietopyyntoIdt.has(a.hanke_id)) {
      return { ...a, tila: "odottaa tietopyyntöä", ehdotettu_keino: "tietopyyntö" };
    }
    return a;
  });

  // Varmista Vellamo on listalla
  if (!paivitetty.some((a) => a.hanke_id === KONTIOLAHTI_VELLAMO_ID)) {
    paivitetty.push({
      hanke_id: KONTIOLAHTI_VELLAMO_ID,
      hanke_nimi: "YIT Kontiolahti, Lehmo (Vellamo)",
      era: 4,
      url_tai_jarjestelma:
        "https://dynastyjulkaisu.pohjoiskarjala.net/kontiolahti/kokous/2025734-8-27439.PDF",
      mita_jai_lukematta: "Vellamon asemakaavakartta VE2 nimiö (logo vs kirjoitettu nimi)",
      syy: "Selainkierros ei käsitellyt kartan nimiötä; jää avoimeksi",
      ehdotettu_keino: "tietopyyntö",
      tila: "odottaa tietopyyntöä",
    });
  }

  writeFileSync(AVOIMET_TIEDOSTO, `${JSON.stringify(paivitetty, null, 1)}\n`, "utf8");
  const odottaa = new Set(
    paivitetty.filter((a) => a.tila === "odottaa tietopyyntöä").map((a) => a.hanke_id),
  );
  console.log(`Avoimet-lista: odottaa tietopyyntöä ${odottaa.size} hanketta`);
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

  const ratkenneet = aineisto.kohteet.filter((k) => k.ratkesi === "kylla");
  const raportti = {
    kuiva,
    kierros: aineisto.kierros ?? "Lähdeselvitys 14",
    ratkenneet: ratkenneet.length,
    laatijat_uusi: 0,
    laatijat_jo: 0,
    asiakirjat_uusi: 0,
    asiakirjat_jo: 0,
    asiakirjat_ohita: 0,
    eura: null as unknown,
    merijarvi_huomautus: "" as string,
    bilttek_huomautus: "" as string,
    kontiolahti_vellamo: "Kartan nimiö ei ratkennut tällä kierroksella — jää avoimeksi.",
  };

  for (const e of kerääLaatijat(aineisto)) {
    const orgId = kuiva ? "kuiva" : await haeTaiLuoOrg(sb, e.orgNimi, e.lahdeUrl);
    const tulos = kuiva ? ("uusi" as const) : await jonoRooli(sb, e, orgId, kuiva);
    if (tulos === "uusi") raportti.laatijat_uusi += 1;
    else raportti.laatijat_jo += 1;
    console.log(`laatija ${e.rooli}: ${e.orgNimi} → ${e.hankeNimi} [${tulos}]`);
  }

  for (const k of ratkenneet) {
    for (const p of k.puuttuvat_asiakirjat ?? []) {
      const tulos = await jonoAsiakirja(sb, k, p, kuiva);
      if (tulos === "uusi") raportti.asiakirjat_uusi += 1;
      else if (tulos === "jo") raportti.asiakirjat_jo += 1;
      else raportti.asiakirjat_ohita += 1;
    }
  }

  raportti.eura = await ratkaiseEura(sb, kuiva);
  if ((raportti.eura as { asiakirja: string }).asiakirja === "uusi") {
    raportti.asiakirjat_uusi += 1;
  }

  raportti.merijarvi_huomautus = await jonoHuomautus(
    sb,
    MERIJARVI_ID,
    MERIJARVI_KV_URL,
    "Kv 15.6.2026 § 10: kaavakonsulttia ei ole vielä valittu; kunnanjohtaja valtuutetaan hyväksymään kaavoitusta valmisteleva ja laativa kaavakonsultti.",
    "6. Merijärven kunta valtuuttaa kunnanjohtajan hyväksymään kaavoitusta valmistelevan ja laativan kaavakonsultin.",
    "Selainkierros: Merijärvi OCR onnistui — vanha skannaus-huomautus korvataan (konsultti valitsematta).",
    kuiva,
  );

  raportti.bilttek_huomautus = await jonoHuomautus(
    sb,
    BILTTEK_ID,
    BILTTEK_PIIRUSTUS_URL,
    "Poikkeamishakemuksen asemapiirustuksen nimiössä suunnittelijana Kari Kristo DI. Organisaatiosta näkyy vain logo (TSV), ei kirjoitettua nimeä — lupahakemuksen_laatijaa ei merkitty.",
    "26.8.2025 KARI KRISTO DI",
    "Selainkierros: BiltTek Tervaharju — henkilönimi huomautukseen, logo ei kelpaa organisaatioksi.",
    kuiva,
  );

  if (!kuiva) paivitaAvoimetLista(aineisto);

  console.log(JSON.stringify(raportti, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
