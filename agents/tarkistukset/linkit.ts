/**
 * 7A.1 Linkkitarkistus. Ei kielimallia.
 * Kirjoittaa vain muutosehdotukset-tauluun tyypillä linkki_rikki.
 *
 * Jonoon vain kun HTTP-vastaus osoittaa kuolleen osoitteen (404/410 tms.).
 * Bot-esto (401/403/429/5xx), TLS-/verkko-/timeout-virheet eivät ole
 * rikkinäinen linkki — selain voi avata saman URL:n ongelmitta.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: LINKIT_VIIVE_MS (oletus 1000), LINKIT_KATTO, LINKIT_KUIVA=1
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { piilotaJulkinenAsiakirjaUrl } from "../../src/lib/lahde-geokoodaus-url";
import { robotsSallii } from "./robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

type TietokantaAsiakas = SupabaseClient;

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://www.datakeskusrekisteri.fi/; linkkitarkistus)";
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

/** Bot-suojaus / rate limit / väliaikainen palvelinvirhe — ei linkki_rikki. */
export const LINKKI_ESTETTY_TILAT = new Set([
  401, 403, 408, 425, 429,
  500, 502, 503, 504,
  520, 521, 522, 523, 524, 525, 526,
]);

export type LinkkiTarkistusTila = "toimii" | "estetty" | "kuollut";

export function luokitteleLinkkiTarkistus(t: {
  http_tila: number | null;
  virhe: string | null;
}): LinkkiTarkistusTila {
  if (t.http_tila != null && LINKKI_ESTETTY_TILAT.has(t.http_tila)) return "estetty";
  if (t.http_tila === 404 || t.http_tila === 410) return "kuollut";
  // Ei HTTP-tilaa / verkko-/TLS-virhe (fetch failed, CERT_…) → ei kuollut.
  // Selain voi avata saman URL:n vaikka Node-fetch kaatuu.
  if (t.virhe || t.http_tila == null) return "estetty";
  if (t.http_tila >= 400) return "kuollut";
  return "toimii";
}

function pyyntoVirheViesti(syy: unknown): string {
  if (!(syy instanceof Error)) return "Pyyntö epäonnistui.";
  const osat = [syy.message];
  const cause = (syy as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const koodi =
      "code" in cause && typeof (cause as { code?: unknown }).code === "string"
        ? (cause as { code: string }).code
        : null;
    if (koodi) osat.push(koodi);
    else if (cause.message && cause.message !== syy.message) osat.push(cause.message);
  } else if (cause && typeof cause === "object" && "code" in cause) {
    const koodi = (cause as { code?: unknown }).code;
    if (typeof koodi === "string") osat.push(koodi);
  }
  return osat.join(": ");
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
  const otsikot: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/pdf,text/html,*/*",
  };
  if (method === "GET" && osittainen) otsikot.Range = "bytes=0-0";
  return fetch(url, {
    method,
    redirect: "follow",
    headers: otsikot,
    signal: AbortSignal.timeout(15_000),
  });
}

async function pyyntoTaiVirhe(
  url: string,
  method: "HEAD" | "GET",
  osittainen = false,
): Promise<{ vastaus: Response } | { virhe: string }> {
  try {
    return { vastaus: await pyynto(url, method, osittainen) };
  } catch (syy) {
    return { virhe: pyyntoVirheViesti(syy) };
  }
}

export async function tarkistaOsoite(url: string): Promise<Tarkistus> {
  const alku = Date.now();
  let head = await pyyntoTaiVirhe(url, "HEAD");
  // HEAD epäonnistui verkossa → kokeile GET ennen estetty-luokittelua.
  if ("virhe" in head) {
    head = await pyyntoTaiVirhe(url, "GET", true);
    if ("virhe" in head) {
      return {
        url,
        http_tila: null,
        vaste_ms: Date.now() - alku,
        virhe: head.virhe,
      };
    }
  }

  let vastaus = head.vastaus;
  if (vastaus.status === 405 || vastaus.status === 501) {
    const get = await pyyntoTaiVirhe(url, "GET", true);
    if ("virhe" in get) {
      return {
        url,
        http_tila: null,
        vaste_ms: Date.now() - alku,
        virhe: get.virhe,
      };
    }
    vastaus = get.vastaus;
  } else if (
    vastaus.status === 401 ||
    vastaus.status === 403 ||
    vastaus.status === 404 ||
    vastaus.status === 410 ||
    vastaus.status === 429
  ) {
    const get = await pyyntoTaiVirhe(url, "GET");
    if ("virhe" in get) {
      // HEAD antoi 4xx mutta GET kaatui verkkoon — ei todistettu kuolleeksi.
      return {
        url,
        http_tila: null,
        vaste_ms: Date.now() - alku,
        virhe: get.virhe,
      };
    }
    vastaus = get.vastaus;
  }
  let yritys = 0;
  while (vastaus.status === 429 && yritys < 4) {
    await odota(odotus429(vastaus, yritys));
    const get = await pyyntoTaiVirhe(url, "GET");
    if ("virhe" in get) {
      return {
        url,
        http_tila: null,
        vaste_ms: Date.now() - alku,
        virhe: get.virhe,
      };
    }
    vastaus = get.vastaus;
    yritys += 1;
  }
  return {
    url,
    http_tila: vastaus.status,
    vaste_ms: Date.now() - alku,
    virhe: null,
  };
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
  let ohitettuMenetelma = 0;
  for (const rivi of (lahteet ?? []) as LahdeRivi[]) {
    const osoite = rivi.lahde_url?.trim();
    if (!osoite || nahdyt.has(osoite)) continue;
    // Nominatim/MML/WFS-menetelmä-URL:t eivät ole dokumentteja — ei HEAD/GET.
    if (piilotaJulkinenAsiakirjaUrl(osoite)) {
      ohitettuMenetelma += 1;
      nahdyt.add(osoite);
      continue;
    }
    nahdyt.add(osoite);
    rivit.push({ ...rivi, lahde_url: osoite });
  }
  for (const dok of dokumentit ?? []) {
    const osoite = String(dok.url ?? "").trim();
    if (!osoite || nahdyt.has(osoite)) continue;
    if (piilotaJulkinenAsiakirjaUrl(osoite)) {
      ohitettuMenetelma += 1;
      nahdyt.add(osoite);
      continue;
    }
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

  // Älä toista samaa URL:ää, jos se on jo kuitattu eikä lähde-URL:ää ole päivitetty sen jälkeen.
  const { data: kuitatut } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url, kasitelty_pvm")
    .eq("tyyppi", "linkki_rikki")
    .eq("tila", "hyvaksytty")
    .not("lahde_url", "is", null);
  const viimeisinKuittaus = new Map<string, string>();
  for (const rivi of kuitatut ?? []) {
    const url = rivi.lahde_url as string;
    const pvm = rivi.kasitelty_pvm as string;
    const edellinen = viimeisinKuittaus.get(url);
    if (!edellinen || pvm > edellinen) viimeisinKuittaus.set(url, pvm);
  }
  for (const [url, kasiteltyPvm] of viimeisinKuittaus) {
    const paiva = kasiteltyPvm.slice(0, 10);
    const { data: paivitettyLahde } = await supabase
      .from("kentta_lahteet")
      .select("id")
      .eq("lahde_url", url)
      .gt("vahvistettu_pvm", paiva)
      .limit(1);
    const { data: paivitettyDok } = await supabase
      .from("dokumentit")
      .select("id")
      .eq("url", url)
      .gt("paivitetty_pvm", kasiteltyPvm)
      .limit(1);
    if (!(paivitettyLahde?.length || paivitettyDok?.length)) {
      jonossa.add(url);
    }
  }

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

    const luokka = luokitteleLinkkiTarkistus(tulos);
    if (luokka === "estetty") {
      ohitettuEiJonoon += 1;
      console.log(
        `estetty (${tulos.http_tila != null ? `HTTP ${tulos.http_tila}` : tulos.virhe ?? "ei vastausta"}), ei jonoon: ${rivi.lahde_url}`,
      );
      continue;
    }

    if (luokka === "kuollut" && !jonossa.has(rivi.lahde_url)) {
      const hankeId = await haeHankeId(supabase, rivi.taulu, rivi.rivi_id);
      const huomautus = `HTTP ${tulos.http_tila}. Tarkista, onko lähde siirtynyt.`;
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
    `Valmis. Tarkistettu ${tarkistettu}, kirjattu ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}, robots.txt ohitti ${ohitettuRobots}, menetelmä-URL ohitti ${ohitettuMenetelma}, ei jonoon ${ohitettuEiJonoon}.`,
  );
}

function suoritetaankoLinkitAgentti(): boolean {
  const polku = (process.argv[1] ?? "").replace(/\\/g, "/");
  return polku.endsWith("/agents/tarkistukset/linkit.ts") || polku.endsWith("/linkit.ts");
}

if (suoritetaankoLinkitAgentti()) {
  main().catch((syy) => {
    console.error(syy instanceof Error ? syy.message : syy);
    process.exit(1);
  });
}
