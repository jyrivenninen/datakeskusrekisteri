/**
 * 7A.1 Linkkitarkistus. Ei kielimallia.
 * Kirjoittaa vain muutosehdotukset-tauluun tyypillä linkki_rikki.
 * HTTP 401/403/429 ja 5xx eivät ole rikkinäinen linkki: GET-uudelleenyritys, sitten ohitus.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: LINKIT_VIIVE_MS (oletus 1000), LINKIT_KATTO, LINKIT_KUIVA=1
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "./robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

type TietokantaAsiakas = SupabaseClient;

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; linkkitarkistus)";
const EHDOTTAJA = "agents/tarkistukset/linkit";

type LahdeRivi = {
  lahde_url: string;
  taulu: string;
  rivi_id: string;
  kentta: string;
};

type Tarkistus = {
  url: string;
  http_tila: number | null;
  vaste_ms: number;
  virhe: string | null;
};

function viiveMs(): number {
  const n = Number(process.env.LINKIT_VIIVE_MS ?? "1000");
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const EI_JONOON_TILAT = new Set([401, 403, 408, 425, 429, 500, 502, 503, 504]);

function eiKirjataJonoon(tila: number | null): boolean {
  return tila != null && EI_JONOON_TILAT.has(tila);
}

function onRikki(t: Tarkistus): boolean {
  if (t.virhe) {
    return !/timeout|aborted|ETIMEDOUT|ECONNRESET/i.test(t.virhe);
  }
  if (t.http_tila == null) return true;
  if (eiKirjataJonoon(t.http_tila)) return false;
  return t.http_tila >= 400;
}

function odotus429(vastaus: Response, yritys: number): number {
  const raaka = vastaus.headers.get("retry-after");
  if (raaka) {
    const sekunnit = Number(raaka);
    if (Number.isFinite(sekunnit) && sekunnit > 0) {
      return Math.min(60, sekunnit) * 1000;
    }
  }
  return Math.min(8000, 1000 * 2 ** yritys);
}

async function pyynto(url: string, method: "HEAD" | "GET", osittainen = false): Promise<Response> {
  const otsikot: Record<string, string> = { "User-Agent": USER_AGENT };
  if (method === "GET" && osittainen) otsikot.Range = "bytes=0-0";
  return fetch(url, {
    method,
    redirect: "follow",
    headers: otsikot,
    signal: AbortSignal.timeout(15_000),
  });
}

async function tarkistaOsoite(url: string): Promise<Tarkistus> {
  const alku = Date.now();
  try {
    let vastaus = await pyynto(url, "HEAD");
    if (vastaus.status === 405 || vastaus.status === 501) {
      vastaus = await pyynto(url, "GET", true);
    } else if (
      vastaus.status === 401 ||
      vastaus.status === 403 ||
      vastaus.status === 404 ||
      vastaus.status === 410 ||
      vastaus.status === 429
    ) {
      vastaus = await pyynto(url, "GET");
    }
    let yritys = 0;
    while (vastaus.status === 429 && yritys < 4) {
      await odota(odotus429(vastaus, yritys));
      vastaus = await pyynto(url, "GET");
      yritys += 1;
    }
    return {
      url,
      http_tila: vastaus.status,
      vaste_ms: Date.now() - alku,
      virhe: null,
    };
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Pyyntö epäonnistui.";
    return {
      url,
      http_tila: null,
      vaste_ms: Date.now() - alku,
      virhe: viesti,
    };
  }
}

function hankeIdKentasta(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("hanke_id" in data)) return null;
  const id = (data as { hanke_id: unknown }).hanke_id;
  return typeof id === "string" ? id : null;
}

async function haeHankeId(
  supabase: TietokantaAsiakas,
  taulu: string,
  riviId: string,
): Promise<string | null> {
  if (taulu === "hankkeet") return riviId;
  const taulut: Record<string, string> = {
    hanke_vaihtoehdot: "hanke_vaihtoehdot",
    hanke_kuvat: "hanke_kuvat",
    hanke_johdot: "hanke_johdot",
    hanke_menettelyt: "hanke_menettelyt",
    maaraajat: "maaraajat",
    dokumentit: "dokumentit",
  };
  const kohde = taulut[taulu];
  if (!kohde) return null;
  const { data } = await supabase.from(kohde).select("hanke_id").eq("id", riviId).maybeSingle();
  return hankeIdKentasta(data);
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
  const kuiva = process.env.LINKIT_KUIVA === "1";
  const katto = Number(process.env.LINKIT_KATTO ?? "0");
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lahteet, error } = await supabase
    .from("kentta_lahteet")
    .select("lahde_url, taulu, rivi_id, kentta")
    .not("lahde_url", "is", null);
  if (error) throw new Error(error.message);

  const { data: dokumentit } = await supabase.from("dokumentit").select("id, url, hanke_id");

  const rivit: LahdeRivi[] = [];
  const nahdyt = new Set<string>();
  for (const rivi of (lahteet ?? []) as LahdeRivi[]) {
    const osoite = rivi.lahde_url?.trim();
    if (!osoite || nahdyt.has(osoite)) continue;
    nahdyt.add(osoite);
    rivit.push({ ...rivi, lahde_url: osoite });
  }
  for (const dok of dokumentit ?? []) {
    const osoite = String(dok.url ?? "").trim();
    if (!osoite || nahdyt.has(osoite)) continue;
    nahdyt.add(osoite);
    rivit.push({
      lahde_url: osoite,
      taulu: "dokumentit",
      rivi_id: String(dok.id),
      kentta: "url",
    });
  }

  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "linkki_rikki")
    .eq("tila", "odottaa");
  const jonossa = new Set(
    (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
  );

  let tarkistettu = 0;
  let kirjattu = 0;
  let ohitettuRobots = 0;
  let ohitettuEiJonoon = 0;
  const viimeksiHost = new Map<string, number>();

  for (const rivi of rivit) {
    if (katto > 0 && tarkistettu >= katto) break;
    let osoite: URL;
    try {
      osoite = new URL(rivi.lahde_url);
    } catch {
      continue;
    }
    if (osoite.protocol !== "http:" && osoite.protocol !== "https:") continue;

    const hostTauko = Math.max(viiveMs(), 2000);
    const edellinen = viimeksiHost.get(osoite.hostname) ?? 0;
    const hostOdotus = hostTauko - (Date.now() - edellinen);
    if (hostOdotus > 0) await odota(hostOdotus);

    if (!(await robotsSallii(osoite, USER_AGENT))) {
      ohitettuRobots += 1;
      console.log(`robots.txt estää: ${rivi.lahde_url}`);
      viimeksiHost.set(osoite.hostname, Date.now());
      continue;
    }

    const tulos = await tarkistaOsoite(rivi.lahde_url);
    viimeksiHost.set(osoite.hostname, Date.now());
    tarkistettu += 1;
    console.log(
      `${tulos.http_tila ?? "virhe"} ${tulos.vaste_ms}ms ${rivi.lahde_url}${tulos.virhe ? ` (${tulos.virhe})` : ""}`,
    );

    if (eiKirjataJonoon(tulos.http_tila)) {
      ohitettuEiJonoon += 1;
      console.log(`HTTP ${tulos.http_tila}, ei jonoon: ${rivi.lahde_url}`);
      continue;
    }

    if (onRikki(tulos) && !jonossa.has(rivi.lahde_url)) {
      const hankeId = await haeHankeId(supabase, rivi.taulu, rivi.rivi_id);
      const huomautus = tulos.virhe
        ? `Linkki ei vastannut: ${tulos.virhe}`
        : `HTTP ${tulos.http_tila}. Tarkista, onko lähde siirtynyt.`;
      if (!kuiva) {
        const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
          tyyppi: "linkki_rikki",
          hanke_id: hankeId,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: rivi.lahde_url,
          huomautus,
          tila: "odottaa",
          sisalto: {
            kentat: {},
            linkki: {
              url: rivi.lahde_url,
              http_tila: tulos.http_tila,
              vaste_ms: tulos.vaste_ms,
              virhe: tulos.virhe,
              taulu: rivi.taulu,
              rivi_id: rivi.rivi_id,
              kentta: rivi.kentta,
            },
          },
        });
        if (lisaysVirhe) throw new Error(lisaysVirhe.message);
        jonossa.add(rivi.lahde_url);
      }
      kirjattu += 1;
    }

    await odota(viiveMs());
  }

  console.log(
    `Valmis. Tarkistettu ${tarkistettu}, kirjattu ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}, robots.txt ohitti ${ohitettuRobots}, ei jonoon ${ohitettuEiJonoon}.`,
  );
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
