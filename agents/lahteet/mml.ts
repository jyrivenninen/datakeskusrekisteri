/**
 * 7A.5.3 Maanmittauslaitos, avoin geokoodaus. Ei kielimallia.
 *
 * Sama OmaTili-avain kuin kartassa (NEXT_PUBLIC_MML_API_AVAIN tai MML_API_AVAIN).
 * Avain vain Authorization-otsikossa, ei lahde_url-kentässä.
 *
 * Todennettu dokumentaatiosta 24.8.2026:
 * https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/reverse
 * CC BY 4.0. Ei massa-ajoa, ei maksullista sopimuspalvelua.
 * Taustakartta on jo käyttöliittymässä. Maastotietokantaa ei ladata kokonaan.
 *
 * Käänteinen geokoodaus julkaistuille sijainneille → mml_havainto vain jos kunta eroaa.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "../tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; mml)";
const SOVITIN = "mml-geokoodaus";
const EHDOTTAJA = "agents/lahteet/mml";
const JUURI = "https://avoin-paikkatieto.maanmittauslaitos.fi";

type TietokantaAsiakas = SupabaseClient;

type PeliasKohde = {
  id?: string;
  properties?: Record<string, unknown>;
};

type PeliasSivu = {
  type?: string;
  features?: PeliasKohde[];
};

function mmlAvain(): string {
  const avain =
    process.env.MML_API_AVAIN?.trim() ||
    process.env.NEXT_PUBLIC_MML_API_AVAIN?.trim() ||
    "";
  if (!avain) {
    throw new Error(
      "MML_API_AVAIN tai NEXT_PUBLIC_MML_API_AVAIN tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  return avain;
}

function basicAuth(avain: string): string {
  return `Basic ${Buffer.from(`${avain}:`, "utf8").toString("base64")}`;
}

function viiveMs(): number {
  const n = Number(process.env.MML_VIIVE_MS ?? "500");
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo === "number" && Number.isFinite(arvo)) return String(arvo);
  if (typeof arvo !== "string") return null;
  const t = arvo.trim();
  return t === "" ? null : t;
}

function vertaaNimi(a: string, b: string): boolean {
  return (
    a.replace(/\s+/g, " ").trim().toLocaleLowerCase("fi") ===
    b.replace(/\s+/g, " ").trim().toLocaleLowerCase("fi")
  );
}

function jarjesta(arvo: unknown): unknown {
  if (Array.isArray(arvo)) return arvo.map(jarjesta);
  if (arvo && typeof arvo === "object") {
    const lahde = arvo as Record<string, unknown>;
    const tulos: Record<string, unknown> = {};
    for (const avain of Object.keys(lahde).sort()) {
      tulos[avain] = jarjesta(lahde[avain]);
    }
    return tulos;
  }
  return arvo;
}

function tiiviste(arvo: unknown): string {
  return createHash("sha256").update(JSON.stringify(jarjesta(arvo)), "utf8").digest("hex");
}

function tietueUrl(lat: number, lon: number): string {
  const u = new URL(`${JUURI}/geocoding/v2/pelias/reverse`);
  u.searchParams.set("point.lat", lat.toFixed(6));
  u.searchParams.set("point.lon", lon.toFixed(6));
  u.searchParams.set("lang", "fi");
  u.searchParams.set("size", "1");
  return u.toString();
}

function ominaisuus(p: Record<string, unknown>, avaimet: string[]): string | null {
  for (const a of avaimet) {
    const v = merkkijono(p[a]);
    if (v) return v;
  }
  return null;
}

async function haeJson(
  url: string,
  avain: string,
): Promise<{ tila: number; runko: unknown; ms: number }> {
  const alku = Date.now();
  const vastaus = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      Authorization: basicAuth(avain),
    },
    signal: AbortSignal.timeout(30_000),
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

async function main() {
  lataaPaikallinenYmparisto();
  const avain = mmlAvain();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const palvelin = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !palvelin) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  const kuiva = process.env.MML_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, palvelin, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const juuri = new URL(`${JUURI}/geocoding/v2/pelias/reverse`);
  if (!(await robotsSallii(juuri, USER_AGENT))) {
    throw new Error("robots.txt estää MML-haun.");
  }

  const { data: hankkeet, error: hankeVirhe } = await supabase
    .from("hankkeet")
    .select("id, kunta, sijainti_lat, sijainti_lon")
    .eq("julkaistu", true)
    .not("sijainti_lat", "is", null)
    .not("sijainti_lon", "is", null);
  if (hankeVirhe) throw new Error(hankeVirhe.message);

  const katto = Number(process.env.MML_KATTO ?? "0");
  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: `${JUURI}/geocoding/v2/pelias/reverse`,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "mml_havainto")
    .eq("tila", "odottaa");
  const jonossa = new Set(
    (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
  );

  let httpTila: number | null = null;
  let osumia = 0;
  let kirjattu = 0;
  let tarkistettu = 0;

  try {
    for (const hanke of hankkeet ?? []) {
      if (katto > 0 && tarkistettu >= katto) break;
      const lat = Number(hanke.sijainti_lat);
      const lon = Number(hanke.sijainti_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const tietue = tietueUrl(lat, lon);
      const tulos = await haeJson(tietue, avain);
      httpTila = tulos.tila;
      tarkistettu += 1;
      console.log(`${tulos.tila} ${tulos.ms}ms`);
      if (tulos.tila >= 400) {
        console.error(`MML HTTP ${tulos.tila}`);
        await odota(viiveMs());
        continue;
      }
      const sivu = tulos.runko as PeliasSivu;
      const kohde = (sivu.features ?? [])[0] ?? null;
      if (kohde) osumia += 1;
      const p = kohde?.properties ?? {};
      const mmlNimi = ominaisuus(p, ["label", "name"]);
      const mmlKunta = ominaisuus(p, ["localadmin", "locality", "county"]);
      const kiinteistotunnus = ominaisuus(p, [
        "kiinteistotunnus",
        "propertyIdentifier",
        "registerUnitIdentifier",
      ]);
      const tiivisteArvo = tiiviste({
        id: kohde?.id ?? null,
        properties: p,
      });

      const { data: vanha } = await supabase
        .from("rajapinta_tiivisteet")
        .select("tiiviste")
        .eq("sovitin", SOVITIN)
        .eq("tietue_url", tietue)
        .maybeSingle();
      const muuttunut = vanha != null && vanha.tiiviste !== tiivisteArvo;
      const uusiTiiviste = vanha == null;

      // Jonoon vain kuntaero (7A.5.3). Tyhjä geokoodaus ja tiiviste-muutos eivät ole toimenpiteitä.
      const havainnot: string[] = [];
      if (
        kohde &&
        mmlKunta &&
        merkkijono(hanke.kunta) &&
        !vertaaNimi(String(hanke.kunta), mmlKunta)
      ) {
        havainnot.push(
          `Rekisterissä kunta on ${hanke.kunta}, MML-geokoodauksessa localadmin on ${mmlKunta}.`,
        );
      }

      const ehdotusTarvitaan = havainnot.length > 0 && !jonossa.has(tietue);

      if (!kuiva && (uusiTiiviste || muuttunut)) {
        const { error: tiivisteVirhe } = await supabase.from("rajapinta_tiivisteet").upsert(
          {
            sovitin: SOVITIN,
            tietue_url: tietue,
            tiiviste: tiivisteArvo,
            tarkistettu_pvm: new Date().toISOString(),
          },
          { onConflict: "sovitin,tietue_url" },
        );
        if (tiivisteVirhe) throw new Error(tiivisteVirhe.message);
      }

      if (!kuiva && ehdotusTarvitaan) {
        const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
          tyyppi: "mml_havainto",
          hanke_id: hanke.id,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: tietue,
          huomautus: havainnot.join(" "),
          tila: "odottaa",
          sisalto: {
            kentat: {},
            mml: {
              nimi: mmlNimi,
              kunta: mmlKunta,
              kiinteistotunnus,
              muuttunut,
              ei_loydy: kohde == null,
            },
          },
        });
        if (lisaysVirhe) throw new Error(lisaysVirhe.message);
        jonossa.add(tietue);
        kirjattu += 1;
      } else if (kuiva && ehdotusTarvitaan) {
        kirjattu += 1;
        console.log("kuiva: kuntaero");
      }

      await odota(viiveMs());
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
      `Valmis. Tarkistettu ${tarkistettu}, osumia ${osumia}, kirjattavia ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "MML-ajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia,
          virhe: viesti.slice(0, 500),
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
