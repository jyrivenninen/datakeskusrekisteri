/**
 * 7A.2 Dokumenttien muutosvahti. Ei kielimallia.
 *
 * Noutaa julkaistut dokumentit-taulun osoitteet, laskee SHA-256 uutettusta
 * tekstistä (PDF ja HTML) ja vertaa dokumentti_tiivisteet-tauluun.
 * Muutos → muutosehdotukset tyypillä dokumentti_muuttunut.
 * Ei kirjoita hankkeet- eikä dokumentit-tauluun.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: DOKUMENTIT_VIIVE_MS (oletus 1000), DOKUMENTIT_KATTO, DOKUMENTIT_KUIVA=1
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractText } from "unpdf";
import { robotsSallii } from "./robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

type TietokantaAsiakas = SupabaseClient;

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; dokumentit)";
const EHDOTTAJA = "agents/tarkistukset/dokumentit";
const SOVITIN = "dokumentit";
const MAX_BAITIT = 25 * 1024 * 1024;

type DokumenttiRivi = {
  id: string;
  url: string;
  otsikko: string;
  muoto: string | null;
  hanke_id: string | null;
};

function viiveMs(): number {
  const n = Number(process.env.DOKUMENTIT_VIIVE_MS ?? "1000");
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tiiviste(teksti: string): string {
  return createHash("sha256").update(teksti, "utf8").digest("hex");
}

function tasaaValilyonnit(teksti: string): string {
  return teksti.replace(/\s+/g, " ").trim();
}

function htmlTekstiksi(html: string): string {
  const ilman = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return tasaaValilyonnit(ilman);
}

function onPdf(muoto: string | null, tyyppi: string, url: string): boolean {
  if (muoto === "pdf") return true;
  if (tyyppi.includes("application/pdf")) return true;
  return url.toLowerCase().includes(".pdf");
}

function onHtml(muoto: string | null, tyyppi: string): boolean {
  if (muoto === "html") return true;
  return tyyppi.includes("text/html") || tyyppi.includes("application/xhtml");
}

async function pdfTekstiksi(puskuri: Uint8Array): Promise<string> {
  const tulos = await extractText(puskuri, { mergePages: true });
  return tasaaValilyonnit(typeof tulos.text === "string" ? tulos.text : tulos.text.join(" "));
}

async function nouda(url: string): Promise<{
  tila: number;
  tyyppi: string;
  tavuja: Uint8Array;
  ms: number;
}> {
  const alku = Date.now();
  const vastaus = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,text/html,*/*" },
    signal: AbortSignal.timeout(60_000),
  });
  const pituus = Number(vastaus.headers.get("content-length") ?? "0");
  if (pituus > MAX_BAITIT) {
    throw new Error(`Tiedosto on liian suuri (${pituus} tavua).`);
  }
  const puskuri = new Uint8Array(await vastaus.arrayBuffer());
  if (puskuri.byteLength > MAX_BAITIT) {
    throw new Error(`Tiedosto on liian suuri (${puskuri.byteLength} tavua).`);
  }
  return {
    tila: vastaus.status,
    tyyppi: (vastaus.headers.get("content-type") ?? "").toLowerCase(),
    tavuja: puskuri,
    ms: Date.now() - alku,
  };
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
  const kuiva = process.env.DOKUMENTIT_KUIVA === "1";
  const katto = Number(process.env.DOKUMENTIT_KATTO ?? "0");
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: dokumentit, error: dokVirhe } = await supabase
    .from("dokumentit")
    .select("id, url, otsikko, muoto, hanke_id")
    .eq("julkaistu", true);
  if (dokVirhe) throw new Error(dokVirhe.message);

  const rivit = (dokumentit ?? []) as DokumenttiRivi[];
  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "dokumentti_muuttunut")
    .eq("tila", "odottaa");
  const jonossa = new Set(
    (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
  );

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  let httpTila: number | null = null;
  let tarkistettu = 0;
  let muuttunut = 0;
  let kirjattu = 0;
  let ohitettu = 0;

  try {
    for (const dok of rivit) {
      if (katto > 0 && tarkistettu >= katto) break;
      if (dok.muoto === "wfs") {
        ohitettu += 1;
        continue;
      }
      let osoite: URL;
      try {
        osoite = new URL(dok.url);
      } catch {
        ohitettu += 1;
        continue;
      }
      if (osoite.protocol !== "http:" && osoite.protocol !== "https:") {
        ohitettu += 1;
        continue;
      }
      if (!(await robotsSallii(osoite, USER_AGENT))) {
        console.log(`robots.txt estää: ${dok.url}`);
        ohitettu += 1;
        await odota(viiveMs());
        continue;
      }

      let nouto;
      try {
        nouto = await nouda(dok.url);
      } catch (syy) {
        const viesti = syy instanceof Error ? syy.message : "Nouto epäonnistui.";
        console.error(`${dok.url}: ${viesti}`);
        await odota(viiveMs());
        continue;
      }
      httpTila = nouto.tila;
      tarkistettu += 1;
      if (nouto.tila >= 400) {
        console.log(`${nouto.tila} ${nouto.ms}ms ${dok.url}`);
        await odota(viiveMs());
        continue;
      }

      let teksti: string | null = null;
      try {
        if (onPdf(dok.muoto, nouto.tyyppi, dok.url)) {
          teksti = await pdfTekstiksi(nouto.tavuja);
        } else if (onHtml(dok.muoto, nouto.tyyppi) || dok.muoto == null) {
          const raaka = new TextDecoder("utf-8", { fatal: false }).decode(nouto.tavuja);
          teksti = onHtml(dok.muoto, nouto.tyyppi) || raaka.trimStart().startsWith("<")
            ? htmlTekstiksi(raaka)
            : tasaaValilyonnit(raaka);
        }
      } catch (syy) {
        const viesti = syy instanceof Error ? syy.message : "Tekstin uutto epäonnistui.";
        console.error(`${dok.url}: ${viesti}`);
        await odota(viiveMs());
        continue;
      }

      if (teksti == null) {
        console.log(`ohitettu muoto ${dok.muoto ?? nouto.tyyppi} ${dok.url}`);
        ohitettu += 1;
        await odota(viiveMs());
        continue;
      }

      const tiivisteArvo = tiiviste(teksti);
      const merkkimaara = teksti.length;
      console.log(`${nouto.tila} ${nouto.ms}ms ${merkkimaara} merkkiä ${dok.url}`);

      const { data: vanhaRivi } = await supabase
        .from("dokumentti_tiivisteet")
        .select("tiiviste")
        .eq("dokumentti_id", dok.id)
        .order("tarkistettu_pvm", { ascending: false })
        .limit(1)
        .maybeSingle();
      const vanha = vanhaRivi?.tiiviste ?? null;
      const muuttui = vanha != null && vanha !== tiivisteArvo;
      if (muuttui) muuttunut += 1;

      if (!kuiva) {
        const { error: tiivisteVirhe } = await supabase.from("dokumentti_tiivisteet").insert({
          dokumentti_id: dok.id,
          tiiviste: tiivisteArvo,
          merkkimaara,
        });
        if (tiivisteVirhe) throw new Error(tiivisteVirhe.message);
      }

      if (muuttui && !jonossa.has(dok.url)) {
        const huomautus =
          merkkimaara === 0
            ? "Dokumentin uutettu teksti on tyhjä. Kuvamuotoinen PDF ei näy tiivisteessä."
            : `Lähdedokumentin uutettu teksti muuttui. Merkkimäärä nyt ${merkkimaara}.`;
        if (!kuiva) {
          const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
            tyyppi: "dokumentti_muuttunut",
            hanke_id: dok.hanke_id,
            ehdottaja_tyyppi: "agentti",
            ehdottaja_tunniste: EHDOTTAJA,
            lahde_url: dok.url,
            huomautus,
            tila: "odottaa",
            sisalto: {
              kentat: {},
              dokumentti: {
                dokumentti_id: dok.id,
                otsikko: dok.otsikko,
                vanha_tiiviste: vanha,
                uusi_tiiviste: tiivisteArvo,
                merkkimaara,
                muoto: dok.muoto,
              },
            },
          });
          if (lisaysVirhe) throw new Error(lisaysVirhe.message);
          jonossa.add(dok.url);
        } else {
          console.log(`kuiva: ${huomautus}`);
        }
        kirjattu += 1;
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
          osumia: muuttunut,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }
    console.log(
      `Valmis. Tarkistettu ${tarkistettu}, muuttuneita ${muuttunut}, kirjattavia ${kirjattu}, ohitettu ${ohitettu}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Dokumenttiajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia: muuttunut,
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
