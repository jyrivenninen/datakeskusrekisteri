/**
 * 7A.5.6 Syken kuulutukset — rajapintakartoitus ja sivun seuranta. Ei kielimallia.
 *
 * Todennus 7.9.2026:
 * - Syken kuulutukset-sivu on rajat ylittävien YVA/SOVA-kuulutusten staattinen lista,
 *   ei kotimaisten ympäristölupa- eikä YVA-kuulutusten RSS/API-syötettä.
 * - Kotimaisten YVA-hankkeiden haku: ymparisto.fi (HTML, 7A.6).
 *
 * Tämä agentti seuraa Syken kuulutussivun ja ymparisto.fi YVA-haun tiivisteitä
 * sekä kirjaa lahdeajot-lokiin. Muutos → virhe-kenttään merkintä ylläpitoon.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: KUULUTUKSET_KUIVA=1
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "../tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; kuulutukset)";
const SOVITIN = "syke-kuulutukset";

const SEURATUT: { id: string; url: string; kuvaus: string }[] = [
  {
    id: "syke-kv-kuulutukset",
    url: "https://www.syke.fi/fi/palvelut/viranomaispalvelut/kuulutukset",
    kuvaus: "Syke: valtioiden rajat ylittävät YVA/SOVA-kuulutukset (HTML)",
  },
  {
    id: "ymparisto-yva-haku",
    url: "https://www.ymparisto.fi/fi/search?filters=any&filters=type&filters=yva_project&size=n_20_n",
    kuvaus: "Ymparisto.fi: YVA-hankelista (sisäinen haku, HTML)",
  },
];

type TietokantaAsiakas = SupabaseClient;

function viiveMs(): number {
  const n = Number(process.env.KUULUTUKSET_VIIVE_MS ?? "800");
  return Number.isFinite(n) && n >= 0 ? n : 800;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tiivista(teksti: string): string {
  return createHash("sha256").update(teksti).digest("hex");
}

async function haeSivu(url: string): Promise<{ tila: number; teksti: string }> {
  const vastaus = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const teksti = await vastaus.text();
  return { tila: vastaus.status, teksti };
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
  const kuiva = process.env.KUULUTUKSET_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ensimmainen = new URL(SEURATUT[0]!.url);
  if (!(await robotsSallii(ensimmainen, USER_AGENT))) {
    throw new Error("robots.txt estää kuulutusten haun.");
  }

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: SEURATUT[0]!.url,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const muutokset: string[] = [];
  let httpTila: number | null = null;

  try {
    for (const kohde of SEURATUT) {
      const { tila, teksti } = await haeSivu(kohde.url);
      httpTila = tila;
      if (tila >= 400) {
        throw new Error(`${kohde.id}: HTTP ${tila}`);
      }

      const uusiTiiviste = tiivista(teksti);
      if (!kuiva) {
        const { data: aiempi } = await supabase
          .from("rajapinta_tiivisteet")
          .select("tiiviste")
          .eq("sovitin", kohde.id)
          .eq("tietue_url", kohde.url)
          .maybeSingle();

        if (aiempi?.tiiviste && aiempi.tiiviste !== uusiTiiviste) {
          muutokset.push(`${kohde.kuvaus}: sivu muuttunut`);
        }

        const { error: tiivisteVirhe } = await supabase.from("rajapinta_tiivisteet").upsert(
          {
            sovitin: kohde.id,
            tietue_url: kohde.url,
            tiiviste: uusiTiiviste,
          },
          { onConflict: "sovitin,tietue_url" },
        );
        if (tiivisteVirhe) throw new Error(tiivisteVirhe.message);
      }

      console.log(`${kohde.id}: HTTP ${tila}, ${teksti.length} tavua`);
      await odota(viiveMs());
    }

    const huomautus =
      muutokset.length > 0
        ? muutokset.join("; ")
        : "Ei rakenteista kuulutus-API:a; HTML-seuranta ok.";

    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia: SEURATUT.length,
          virhe: muutokset.length > 0 ? huomautus.slice(0, 500) : null,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }

    console.log(`${SOVITIN}: ${SEURATUT.length} sivua${kuiva ? " (kuiva-ajo)" : ""}. ${huomautus}`);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Kuulutusten ajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          virhe: viesti.slice(0, 500),
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
