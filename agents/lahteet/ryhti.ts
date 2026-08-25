/**
 * 7A.5.1 Ryhti, avoin kaava-aineisto (OGC API Features). Ei kielimallia.
 *
 * Juuri (todennettu 24.8.2026):
 * https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1
 * Syke (gistuki): sykeuserid URL-parametrina, ei salasanaa. Oletus on
 * tämän sovelluksen tunniste. Rakennuksia/osoitteita ei ladata OGC:stä
 * kokonaan (siihen Syke ohjaa vuorokausipaketit). Kutsut peräkkäin,
 * ei rinnakkain. Tietueen lähde-URL ilman tunnistetta.
 * Maksullista lupa- tai tarkennettua rakennustietoa ei haeta.
 *
 * Kattavuus: velvoite 1.1.2024 alkaen, valtakunnallinen kattavuus 1.1.2029.
 * Ryhdistä puuttuva kaava ei ole todiste siitä, ettei hanketta ole.
 *
 * Kirjoittaa muutosehdotukset (ryhti_havainto), rajapinta_tiivisteet ja lahdeajot.
 * Ei hankkeet-tauluun.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "../tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT_POHJA =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; ryhti)";
const SOVITIN = "ryhti-kaava";
const EHDOTTAJA = "agents/lahteet/ryhti";
const JUURI =
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1";
const SIVU_KOKO = 1000;
const OLETUS_HAKUSANAT = [
  "datakeskus",
  "konesali",
  "hyperscale",
  "palvelinkeskus",
  "serverikeskus",
  "datahalli",
];

const KOKOELMAT: { id: string; nimi: string; vireilla: boolean }[] = [
  { id: "pub_prep_ld_plan_ix_gs", nimi: "Valmisteilla olevat asemakaavat", vireilla: true },
  { id: "pub_prep_lm_plan_ix_gs", nimi: "Valmisteilla olevat yleiskaavat", vireilla: true },
  { id: "pub_valid_ld_plan_ix_gs", nimi: "Asemakaavahakemisto", vireilla: false },
  { id: "pub_valid_lm_plan_ix_gs", nimi: "Yleiskaavahakemisto", vireilla: false },
];

type TietokantaAsiakas = SupabaseClient;

type OgcLinkki = { rel?: string; href?: string };

type OgcKohde = {
  id?: string;
  type?: string;
  properties?: Record<string, unknown>;
  links?: OgcLinkki[];
};

type OgcSivu = {
  type?: string;
  features?: OgcKohde[];
  numberMatched?: number;
  numberReturned?: number;
  links?: OgcLinkki[];
  title?: string;
  code?: string;
};

const SYKE_USERID_OLETUS = "datakeskusrekisteri";

function sykeUserid(): string {
  return process.env.SYKE_RAJAPINTA_TUNNISTE?.trim() || SYKE_USERID_OLETUS;
}

function userAgent(): string {
  return `${USER_AGENT_POHJA} sykeuserid/${sykeUserid()}`;
}

/** Liittää Syken edellyttämän sykeuserid-parametrin. Ei muuta tietueen lähde-URL:ää. */
function osoiteSykeTunnisteella(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("sykeuserid")) {
    u.searchParams.set("sykeuserid", sykeUserid());
  }
  return u.toString();
}

function viiveMs(): number {
  const n = Number(process.env.RYHTI_VIIVE_MS ?? "1000");
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const t = arvo.trim();
  return t === "" ? null : t;
}

function cqlMerkkijono(arvo: string): string {
  return arvo.replaceAll("'", "''");
}

function hakusanatYmparistosta(): string[] {
  const raaka = process.env.RYHTI_HAKUSANAT?.trim();
  const lista = raaka
    ? raaka.split(",").map((s) => s.trim()).filter((s) => s.length >= 4)
    : OLETUS_HAKUSANAT;
  return [...new Set(lista.map((s) => s.toLowerCase()))];
}

function kuntaSuodatin(koodi: string): string | null {
  const pad = koodi.trim();
  if (!/^\d+$/.test(pad)) return null;
  const ilman = pad.replace(/^0+/, "") || "0";
  const osat = new Set([`%"${cqlMerkkijono(pad)}"%`]);
  if (ilman !== pad) osat.add(`%"${cqlMerkkijono(ilman)}"%`);
  return [...osat]
    .map((m) => `administrative_area_identifiers like '${m}'`)
    .join(" or ");
}

function hakusanaSuodatin(sanat: string[]): string | null {
  const osat: string[] = [];
  for (const sana of sanat) {
    const s = cqlMerkkijono(sana.toLowerCase());
    osat.push(`strToLowerCase(name_fin) like '%${s}%'`);
    osat.push(`strToLowerCase(description_fin) like '%${s}%'`);
    osat.push(`strToLowerCase(permanent_plan_identifier) like '%${s}%'`);
    osat.push(`strToLowerCase(producer_plan_identifier) like '%${s}%'`);
  }
  if (osat.length === 0) return null;
  return `(${osat.join(" or ")})`;
}

function kaavatunnusSuodatin(tunnus: string): string {
  const s = cqlMerkkijono(tunnus);
  return `(permanent_plan_identifier = '${s}' or producer_plan_identifier = '${s}')`;
}

function tietueUrl(kokoelmaId: string, kohdeId: string): string {
  return `${JUURI}/collections/${kokoelmaId}/items/${encodeURIComponent(kohdeId)}`;
}

function kohteenId(kohde: OgcKohde): string | null {
  return merkkijono(kohde.id);
}

function kuntaTunnukset(arvo: unknown): string[] {
  const teksti = merkkijono(arvo);
  if (!teksti) return [];
  try {
    const parsed = JSON.parse(teksti) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    /* merkkijono ei ole JSON */
  }
  return [];
}

function tiivisteOminaisuuksista(ominaisuudet: Record<string, unknown>): string {
  const jarjestetty: Record<string, unknown> = {};
  for (const avain of Object.keys(ominaisuudet).sort()) {
    jarjestetty[avain] = ominaisuudet[avain];
  }
  return createHash("sha256").update(JSON.stringify(jarjestetty), "utf8").digest("hex");
}

async function haeJson(url: string): Promise<{ tila: number; runko: unknown; ms: number }> {
  const alku = Date.now();
  const vastaus = await fetch(osoiteSykeTunnisteella(url), {
    method: "GET",
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/geo+json, application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });
  const teksti = await vastaus.text();
  let runko: unknown = teksti;
  try {
    runko = JSON.parse(teksti) as unknown;
  } catch {
    runko = { raaka: teksti.slice(0, 200) };
  }
  return { tila: vastaus.status, runko, ms: Date.now() - alku };
}

function kohteetSivulta(runko: unknown): { kohteet: OgcKohde[]; seuraava: string | null; virhe: string | null } {
  if (!runko || typeof runko !== "object") {
    return { kohteet: [], seuraava: null, virhe: "Tyhjä vastaus." };
  }
  const sivu = runko as OgcSivu & OgcKohde;
  if (typeof sivu.title === "string" && sivu.features == null && sivu.type !== "Feature") {
    return { kohteet: [], seuraava: null, virhe: sivu.title };
  }
  const kohteet =
    sivu.type === "Feature" && kohteenId(sivu)
      ? [sivu]
      : (sivu.features ?? []);
  const seuraava =
    (sivu.links ?? []).find((l) => l.rel === "next" && merkkijono(l.href))?.href ??
    null;
  return { kohteet, seuraava, virhe: null };
}

async function haeKokoelma(
  kokoelmaId: string,
  suodatin: string | null,
): Promise<{ kohteet: OgcKohde[]; httpTila: number | null }> {
  const alku = new URL(`${JUURI}/collections/${kokoelmaId}/items`);
  alku.searchParams.set("limit", String(SIVU_KOKO));
  if (suodatin) {
    alku.searchParams.set("filter-lang", "cql2-text");
    alku.searchParams.set("filter", suodatin);
  }
  let osoite: string | null = alku.toString();
  const kohteet: OgcKohde[] = [];
  let sivuja = 0;
  let httpTila: number | null = null;
  while (osoite) {
    sivuja += 1;
    if (sivuja > 50) throw new Error(`Liikaa OGC-sivuja (${kokoelmaId}).`);
    const tulos = await haeJson(osoite);
    httpTila = tulos.tila;
    console.log(`${tulos.tila} ${tulos.ms}ms ${kokoelmaId} sivu ${sivuja}`);
    if (tulos.tila >= 400) {
      throw new Error(`Ryhti HTTP ${tulos.tila} (${kokoelmaId})`);
    }
    const sivu = kohteetSivulta(tulos.runko);
    if (sivu.virhe) throw new Error(`Ryhti-suodatin (${kokoelmaId}): ${sivu.virhe}`);
    kohteet.push(...sivu.kohteet);
    osoite = sivu.seuraava;
    if (osoite) await odota(viiveMs());
  }
  return { kohteet, httpTila };
}

type Haku = { suodatin: string; hakuehto: string };

function yhdistaHaut(haut: Haku[]): Haku[] {
  const nahdyt = new Set<string>();
  const tulos: Haku[] = [];
  for (const h of haut) {
    if (nahdyt.has(h.suodatin)) continue;
    nahdyt.add(h.suodatin);
    tulos.push(h);
  }
  return tulos;
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  const kuiva = process.env.RYHTI_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const juuri = new URL(`${JUURI}/collections`);
  if (!(await robotsSallii(juuri, userAgent()))) {
    throw new Error("robots.txt estää Ryhti-haun.");
  }

  const sanat = hakusanatYmparistosta();
  const { data: hankkeet, error: hankeVirhe } = await supabase
    .from("hankkeet")
    .select("id, nimi, kunta, kunta_id, kaavatunnus")
    .eq("julkaistu", true);
  if (hankeVirhe) throw new Error(hankeVirhe.message);

  const { data: kuntaRivit, error: kuntaVirhe } = await supabase
    .from("kunnat")
    .select("id, koodi, nimi")
    .eq("voimassa", true);
  if (kuntaVirhe) throw new Error(kuntaVirhe.message);
  const kuntaKoodit = new Set<string>();
  for (const h of hankkeet ?? []) {
    const id = h.kunta_id as string | null;
    const rivi =
      (id ? (kuntaRivit ?? []).find((k) => k.id === id) : null) ??
      (kuntaRivit ?? []).find(
        (k) => merkkijono(k.nimi)?.toLowerCase() === merkkijono(h.kunta)?.toLowerCase(),
      );
    const koodi = merkkijono(rivi?.koodi);
    if (koodi) kuntaKoodit.add(koodi);
  }

  const kaavatunnukset = (hankkeet ?? [])
    .map((h) => ({
      hankeId: h.id as string,
      tunnus: merkkijono(h.kaavatunnus),
    }))
    .filter((r): r is { hankeId: string; tunnus: string } => r.tunnus != null);

  const kansallisetSanat = sanat;

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: `${JUURI}/collections`,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "ryhti_havainto")
    .eq("tila", "odottaa");
  const jonossa = new Set(
    (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
  );

  let httpTila: number | null = null;
  let osumia = 0;
  let kirjattu = 0;
  const nahdytKohteet = new Set<string>();

  try {
    for (const kokoelma of KOKOELMAT) {
      const haut: Haku[] = [];
      const sanaSuodatin = hakusanaSuodatin(kansallisetSanat);
      if (sanaSuodatin) {
        haut.push({ suodatin: sanaSuodatin, hakuehto: "hakusanat" });
      }
      if (kokoelma.vireilla && kuntaKoodit.size > 0) {
        const osat = [...kuntaKoodit]
          .map((koodi) => kuntaSuodatin(koodi))
          .filter((s): s is string => s != null)
          .map((s) => `(${s})`);
        if (osat.length > 0) {
          haut.push({
            suodatin: `(${osat.join(" or ")})`,
            hakuehto: `hankekunnat ${[...kuntaKoodit].join(",")}`,
          });
        }
      }
      if (kaavatunnukset.length > 0) {
        haut.push({
          suodatin: `(${kaavatunnukset.map((k) => kaavatunnusSuodatin(k.tunnus)).join(" or ")})`,
          hakuehto: "kaavatunnukset",
        });
      }

      for (const haku of yhdistaHaut(haut)) {
        let tulos: { kohteet: OgcKohde[]; httpTila: number | null };
        try {
          tulos = await haeKokoelma(kokoelma.id, haku.suodatin);
        } catch (syy) {
          const viesti = syy instanceof Error ? syy.message : "haku epäonnistui";
          console.error(`${kokoelma.id} ${haku.hakuehto}: ${viesti}`);
          continue;
        }
        httpTila = tulos.httpTila;
        osumia += tulos.kohteet.length;
        if (tulos.kohteet.length > 0) await odota(viiveMs());

        for (const kohde of tulos.kohteet) {
          const kohdeId = kohteenId(kohde);
          if (!kohdeId) continue;
          const tietue = tietueUrl(kokoelma.id, kohdeId);
          if (nahdytKohteet.has(tietue)) continue;
          nahdytKohteet.add(tietue);
          const ominaisuudet = kohde.properties ?? {};
          const tiiviste = tiivisteOminaisuuksista(ominaisuudet);
          const { data: vanha } = await supabase
            .from("rajapinta_tiivisteet")
            .select("tiiviste")
            .eq("sovitin", SOVITIN)
            .eq("tietue_url", tietue)
            .maybeSingle();
          const muuttunut = vanha != null && vanha.tiiviste !== tiiviste;
          const uusi = vanha == null;
          if (!muuttunut && !uusi) continue;

          const kaavatunnus =
            merkkijono(ominaisuudet.permanent_plan_identifier) ??
            merkkijono(ominaisuudet.producer_plan_identifier);
          const hankeId =
            kaavatunnukset.find(
              (k) =>
                k.tunnus === merkkijono(ominaisuudet.permanent_plan_identifier) ||
                k.tunnus === merkkijono(ominaisuudet.producer_plan_identifier),
            )?.hankeId ?? null;
          const nimi = merkkijono(ominaisuudet.name_fin);
          const kuvaus = merkkijono(ominaisuudet.description_fin);
          const huomautus = muuttunut
            ? `Kaavakohteen tiedot muuttuivat Ryhti-aineistossa (${kokoelma.nimi}).`
            : `Kaavakohde Ryhti-aineistossa (${kokoelma.nimi}). Ryhdistä puuttuva kaava ei ole todiste siitä, ettei hanketta ole.`;

          if (!kuiva) {
            const { error: tiivisteVirhe } = await supabase.from("rajapinta_tiivisteet").upsert(
              {
                sovitin: SOVITIN,
                tietue_url: tietue,
                tiiviste,
                tarkistettu_pvm: new Date().toISOString(),
              },
              { onConflict: "sovitin,tietue_url" },
            );
            if (tiivisteVirhe) throw new Error(tiivisteVirhe.message);

            if (!jonossa.has(tietue)) {
              const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
                tyyppi: "ryhti_havainto",
                hanke_id: hankeId,
                ehdottaja_tyyppi: "agentti",
                ehdottaja_tunniste: EHDOTTAJA,
                lahde_url: tietue,
                huomautus,
                tila: "odottaa",
                sisalto: {
                  kentat: {},
                  ryhti: {
                    kokoelma: kokoelma.id,
                    kokoelma_nimi: kokoelma.nimi,
                    kohde_id: kohdeId,
                    nimi,
                    kuvaus,
                    kunta_tunnukset: kuntaTunnukset(
                      ominaisuudet.administrative_area_identifiers,
                    ),
                    kaavatunnus,
                    elinkaari: merkkijono(ominaisuudet.plan_life_cycle_status),
                    hakuehto: haku.hakuehto,
                    muuttunut,
                  },
                },
              });
              if (lisaysVirhe) throw new Error(lisaysVirhe.message);
              jonossa.add(tietue);
            }
          }
          kirjattu += 1;
          console.log(`${muuttunut ? "muuttunut" : "uusi"} ${tietue}`);
        }
      }
    }

    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }
    console.log(
      `Valmis. Rajapintaosumat ${osumia}, kirjattavia ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Ryhti-ajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia,
          virhe: viesti,
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
