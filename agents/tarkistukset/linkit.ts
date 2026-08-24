/**
 * 7A.1 Linkkitarkistus. Ei kielimallia.
 * Kirjoittaa vain muutosehdotukset-tauluun tyypillä linkki_rikki.
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

function onRikki(t: Tarkistus): boolean {
  if (t.virhe) return true;
  if (t.http_tila == null) return true;
  return t.http_tila >= 400;
}

async function tarkistaOsoite(url: string): Promise<Tarkistus> {
  const alku = Date.now();
  try {
    let vastaus = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (vastaus.status === 405 || vastaus.status === 501) {
      const keskeytys = new AbortController();
      const ajastin = setTimeout(() => keskeytys.abort(), 15_000);
      try {
        vastaus = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": USER_AGENT,
            Range: "bytes=0-0",
          },
          signal: keskeytys.signal,
        });
      } finally {
        clearTimeout(ajastin);
        keskeytys.abort();
      }
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

  for (const rivi of rivit) {
    if (katto > 0 && tarkistettu >= katto) break;
    let osoite: URL;
    try {
      osoite = new URL(rivi.lahde_url);
    } catch {
      continue;
    }
    if (osoite.protocol !== "http:" && osoite.protocol !== "https:") continue;

    if (!(await robotsSallii(osoite, USER_AGENT))) {
      ohitettuRobots += 1;
      console.log(`robots.txt estää: ${rivi.lahde_url}`);
      await odota(viiveMs());
      continue;
    }

    const tulos = await tarkistaOsoite(rivi.lahde_url);
    tarkistettu += 1;
    console.log(
      `${tulos.http_tila ?? "virhe"} ${tulos.vaste_ms}ms ${rivi.lahde_url}${tulos.virhe ? ` (${tulos.virhe})` : ""}`,
    );

    if (onRikki(tulos) && !jonossa.has(rivi.lahde_url)) {
      const hankeId = await haeHankeId(supabase, rivi.taulu, rivi.rivi_id);
      const huomautus = tulos.virhe
        ? `Linkki ei vastannut: ${tulos.virhe}`
        : `HTTP ${tulos.http_tila}. ${tulos.http_tila === 401 || tulos.http_tila === 403 ? "Pääsy kielletty; ei välttämättä poistettu." : "Tarkista, onko lähde siirtynyt."}`;
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
    `Valmis. Tarkistettu ${tarkistettu}, kirjattu ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}, robots.txt ohitti ${ohitettuRobots}.`,
  );
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
