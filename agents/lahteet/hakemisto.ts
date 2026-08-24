/**
 * 7A.5.5 Syken hakemisto: kuntakoodisto. Ei kielimallia.
 *
 * Alusta-entiteetti on näytealusta, ei kunta. Kunnat haetaan Kunta-kokoelmasta.
 * Gateway: https://api.ymparisto.fi/hakemisto/odata/Kunta?api-version=1
 * Lisenssi: CC BY 4.0. Avainta ei vaadittu (2026-08-24).
 *
 * Kirjoittaa kunnat-tauluun ja lahdeajot-lokiin. Ei hankkeet-tauluun.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "../tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; hakemisto)";
const SOVITIN = "hakemisto-kunta";
const API_VERSIO = "1";
const KUNTA_KOELMA = `https://api.ymparisto.fi/hakemisto/odata/Kunta?api-version=${API_VERSIO}`;
const SIVU_KOKO = 200;

type TietokantaAsiakas = SupabaseClient;

type ODataSivu<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
};

type HakemistoKunta = {
  kuntaId?: number;
  nro?: string;
  nimi?: string;
  nimiRuo?: string;
  ely?: { nimi?: string } | null;
  maakunta?: { nimi?: string } | null;
};

function viiveMs(): number {
  const n = Number(process.env.HAKEMISTO_VIIVE_MS ?? "500");
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tietueUrl(kuntaId: number): string {
  return `https://api.ymparisto.fi/hakemisto/odata/Kunta(${kuntaId})?api-version=${API_VERSIO}`;
}

function kokoelmaUrl(ohita: number): string {
  const u = new URL(KUNTA_KOELMA);
  u.searchParams.set("$top", String(SIVU_KOKO));
  u.searchParams.set("$skip", String(ohita));
  u.searchParams.set("$select", "kuntaId,nro,nimi,nimiRuo");
  u.searchParams.set("$expand", "ely($select=nimi),maakunta($select=nimi)");
  u.searchParams.set("$orderby", "nro");
  return u.toString();
}

async function haeJson(url: string): Promise<{ tila: number; runko: unknown; ms: number }> {
  const alku = Date.now();
  const vastaus = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
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

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const t = arvo.trim();
  return t === "" ? null : t;
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
  const kuiva = process.env.HAKEMISTO_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const eka = new URL(kokoelmaUrl(0));
  if (!(await robotsSallii(eka, USER_AGENT))) {
    throw new Error("robots.txt estää hakemiston haun.");
  }

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: kokoelmaUrl(0),
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const rivit: {
    koodi: string;
    nimi: string;
    nimi_sv: string | null;
    maakunta: string | null;
    ely: string | null;
    voimassa: boolean;
    lahde_url: string;
  }[] = [];
  let ohita = 0;
  let sivuja = 0;
  let httpTila: number | null = null;

  try {
    // $top=200 ei palauta @odata.nextLink vaikka osumia on yli 200.
    while (true) {
      sivuja += 1;
      if (sivuja > 20) throw new Error("Liikaa OData-sivuja.");
      const tulos = await haeJson(kokoelmaUrl(ohita));
      httpTila = tulos.tila;
      console.log(`${tulos.tila} ${tulos.ms}ms sivu ${sivuja} skip=${ohita}`);
      if (tulos.tila >= 400) {
        throw new Error(`Hakemisto HTTP ${tulos.tila}`);
      }
      const sivu = tulos.runko as ODataSivu<HakemistoKunta>;
      const erä = sivu.value ?? [];
      for (const k of erä) {
        const koodi = merkkijono(k.nro);
        const nimi = merkkijono(k.nimi);
        const kuntaId = typeof k.kuntaId === "number" ? k.kuntaId : null;
        if (!koodi || !nimi || kuntaId == null) continue;
        rivit.push({
          koodi,
          nimi,
          nimi_sv: merkkijono(k.nimiRuo),
          maakunta: merkkijono(k.maakunta?.nimi),
          ely: merkkijono(k.ely?.nimi),
          voimassa: true,
          lahde_url: tietueUrl(kuntaId),
        });
      }
      if (erä.length < SIVU_KOKO) break;
      ohita += erä.length;
      await odota(viiveMs());
    }

    const uniikit = new Map(rivit.map((r) => [r.koodi, r]));
    if (uniikit.size !== rivit.length) {
      console.log(`Varoitus: päällekkäisiä koodeja, ${rivit.length} → ${uniikit.size}.`);
    }
    const kirjoitettavat = [...uniikit.values()];
    const koodit = new Set(kirjoitettavat.map((r) => r.koodi));
    if (!kuiva) {
      const { error: upsertVirhe } = await supabase.from("kunnat").upsert(kirjoitettavat, {
        onConflict: "koodi",
      });
      if (upsertVirhe) throw new Error(upsertVirhe.message);

      const { data: kaikki } = await supabase.from("kunnat").select("koodi");
      const pois = (kaikki ?? [])
        .map((r) => r.koodi as string)
        .filter((koodi) => !koodit.has(koodi));
      if (pois.length > 0) {
        const { error: vanhennusVirhe } = await supabase
          .from("kunnat")
          .update({ voimassa: false })
          .in("koodi", pois);
        if (vanhennusVirhe) throw new Error(vanhennusVirhe.message);
      }
    }

    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia: rivit.length,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }
    console.log(
      `Valmis. Kunnat ${koodit.size}${kuiva ? " (kuiva-ajo)" : ""}, sivuja ${sivuja}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Hakemistoajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia: rivit.length,
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
