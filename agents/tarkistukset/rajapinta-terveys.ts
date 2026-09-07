/**
 * Rajapintojen terveysvalvonta (7A.5). Ei kielimallia.
 *
 * - Pingaa keskeiset viranomaisrajapinnat
 * - Seuraa Syken rajapintamuutosten RSS-syötettä
 * - Kirjaa lahdeajot ja tiivisteet
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: RAJAPINTA_TERVEYS_KUIVA=1, FINGRID_API_AVAIN (Fingrid-ping)
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; rajapinta-terveys)";
const SOVITIN = "rajapinta-terveys";
const RSS_URL = "https://rajapinnat.ymparisto.fi/api/rss/feed.xml";
const SYKE_USERID = process.env.SYKE_RAJAPINTA_TUNNISTE?.trim() || "datakeskusrekisteri";

type TietokantaAsiakas = SupabaseClient;

type PingKohde = {
  nimi: string;
  url: string;
  odotettuMin?: number;
  odotettuMax?: number;
};

const PINGIT: PingKohde[] = [
  {
    nimi: "syke-hakemisto",
    url: "https://api.ymparisto.fi/hakemisto/odata/Kunta?api-version=1&$top=1",
    odotettuMin: 200,
    odotettuMax: 299,
  },
  {
    nimi: "ryhti-ogc",
    url: `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections?sykeuserid=${SYKE_USERID}`,
    odotettuMin: 200,
    odotettuMax: 299,
  },
  {
    nimi: "pxweb-vaerak",
    url: "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/vaerak/",
    odotettuMin: 200,
    odotettuMax: 299,
  },
  {
    nimi: "avoindata-ckan",
    url: "https://avoindata.fi/data/api/3/action/status_show",
    odotettuMin: 200,
    odotettuMax: 299,
  },
  {
    nimi: "ytj-prh",
    url: "https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=0112038-9",
    odotettuMin: 200,
    odotettuMax: 299,
  },
];

function viiveMs(): number {
  const n = Number(process.env.RAJAPINTA_TERVEYS_VIIVE_MS ?? "600");
  return Number.isFinite(n) && n >= 0 ? n : 600;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tiivista(teksti: string): string {
  return createHash("sha256").update(teksti).digest("hex");
}

function puraRssKohteet(sisalto: string): { otsikko: string; linkki: string }[] {
  const tulokset: { otsikko: string; linkki: string }[] = [];
  for (const lohko of sisalto.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []) {
    const otsikko = lohko.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const linkki = lohko.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim();
    if (otsikko && linkki) tulokset.push({ otsikko, linkki });
  }
  return tulokset;
}

async function ping(url: string): Promise<number> {
  const vastaus = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/xml, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  return vastaus.status;
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
  const kuiva = process.env.RAJAPINTA_TERVEYS_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: RSS_URL,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const virheet: string[] = [];
  let ok = 0;

  try {
    for (const kohde of PINGIT) {
      const tila = await ping(kohde.url);
      const onOk =
        tila >= (kohde.odotettuMin ?? 200) && tila <= (kohde.odotettuMax ?? 299);
      if (onOk) {
        ok += 1;
        console.log(`OK ${kohde.nimi}: ${tila}`);
      } else {
        virheet.push(`${kohde.nimi}: HTTP ${tila}`);
        console.log(`FAIL ${kohde.nimi}: ${tila}`);
      }
      await odota(viiveMs());
    }

    if (process.env.FINGRID_API_AVAIN?.trim()) {
      const fingridUrl = "https://data.fingrid.fi/api/datasets/192/data/latest";
      const vastaus = await fetch(fingridUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "x-api-key": process.env.FINGRID_API_AVAIN.trim(),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (vastaus.ok) {
        ok += 1;
        console.log("OK fingrid: 200");
      } else {
        virheet.push(`fingrid: HTTP ${vastaus.status}`);
      }
      await odota(viiveMs());
    }

    const rssVastaus = await fetch(RSS_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml" },
      signal: AbortSignal.timeout(20_000),
    });
    const rssTeksti = await rssVastaus.text();
    if (!rssVastaus.ok) {
      virheet.push(`syke-rss: HTTP ${rssVastaus.status}`);
    } else {
      ok += 1;
      const kohteet = puraRssKohteet(rssTeksti);
      const uusiTiiviste = tiivista(rssTeksti);
      console.log(`OK syke-rss: ${kohteet.length} kohdetta`);

      if (!kuiva) {
        const { data: aiempi } = await supabase
          .from("rajapinta_tiivisteet")
          .select("tiiviste")
          .eq("sovitin", "syke-rss")
          .eq("tietue_url", RSS_URL)
          .maybeSingle();

        if (aiempi?.tiiviste && aiempi.tiiviste !== uusiTiiviste) {
          const viimeisin = kohteet[0];
          virheet.push(
            `syke-rss muuttunut${viimeisin ? `: ${viimeisin.otsikko}` : ""}`,
          );
        }

        await supabase.from("rajapinta_tiivisteet").upsert(
          {
            sovitin: "syke-rss",
            tietue_url: RSS_URL,
            tiiviste: uusiTiiviste,
          },
          { onConflict: "sovitin,tietue_url" },
        );
      }
    }

    const tila = virheet.length > 0 ? "epaonnistui" : "valmis";
    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila,
          paattyi_pvm: new Date().toISOString(),
          http_tila: rssVastaus.status,
          osumia: ok,
          virhe: virheet.length > 0 ? virheet.join("; ").slice(0, 500) : null,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }

    console.log(`${SOVITIN}: ${ok} ok, ${virheet.length} huomautusta.`);
    if (virheet.length > 0 && !kuiva) {
      process.exitCode = 1;
    }
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Rajapintaterveys epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
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
