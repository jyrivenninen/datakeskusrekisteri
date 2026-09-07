/**
 * 7A.6 Kuntien esityslistat — RSS, iCal, CaseM/CloudNC, HTML ja KTweb. Ei kielimallia.
 *
 * Lukee kunta_esityslista_lahteet-taulusta seurattavat syötteet, suodattaa
 * hakusanat ja kirjaa osumat muutosehdotukset-tauluun (kunta_havainto).
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: KUNTA_ESITYSLISTA_KUIVA=1, KUNTA_ESITYSLISTA_KARTOITUS=1,
 *   KUNTA_ESITYSLISTA_PAIVAA (oletus 60), KUNTA_ESITYSLISTA_VIIVE_MS (500)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "../../tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../../ymparisto";
import { hakusanat, osuuHakusanaan } from "./hakusanat";
import {
  haeHankekunnat,
  haeSeuratutLahteet,
  puuttuvatLahteet,
} from "./kuntakartoitus";
import { haeKuntaDokumentit } from "./sovittimet/dynasty";
import { casemSovitin } from "./sovittimet/casem";
import { htmlSovitin } from "./sovittimet/html";
import { icalSovitin } from "./sovittimet/ical";
import { rssSovitin } from "./sovittimet/rss";
import { twebSovitin } from "./sovittimet/tweb";
import type { HankeKunnassa, KuntaDokumentti, KuntaLahde, KuntaSovitin } from "./tyypit";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; kuntakokoukset)";
const SOVITIN = "kunta-esityslista";
const EHDOTTAJA = "agents/lahteet/kunnat/esityslistat";

type TietokantaAsiakas = SupabaseClient;

function viiveMs(): number {
  const n = Number(process.env.KUNTA_ESITYSLISTA_VIIVE_MS ?? "500");
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function paivaaTaaksepain(): number {
  const n = Number(process.env.KUNTA_ESITYSLISTA_PAIVAA ?? "60");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
}

function sovitinJarjestelmalle(jarjestelma: string): KuntaSovitin | null {
  if (jarjestelma === "rss") return rssSovitin;
  if (jarjestelma === "ical") return icalSovitin;
  if (jarjestelma === "casem") return casemSovitin;
  if (jarjestelma === "html") return htmlSovitin;
  if (jarjestelma === "tweb") return twebSovitin;
  return null;
}

function hankkeetKunnassa(
  hankkeet: HankeKunnassa[],
  lahde: KuntaLahde,
): HankeKunnassa[] {
  return hankkeet.filter(
    (h) =>
      h.kunta_id === lahde.kuntaId ||
      h.kunta.trim().toLowerCase() === lahde.kuntaNimi.trim().toLowerCase(),
  );
}

function valitseHanke(
  hankkeet: HankeKunnassa[],
  otsikko: string,
  kuvaus: string | undefined,
): HankeKunnassa | null {
  if (hankkeet.length === 0) return null;
  if (hankkeet.length === 1) return hankkeet[0] ?? null;
  const teksti = `${otsikko} ${kuvaus ?? ""}`.toLowerCase();
  const osuma = hankkeet.find((h) => teksti.includes(h.nimi.trim().toLowerCase()));
  return osuma ?? hankkeet[0] ?? null;
}

async function haeAsiaDokumentit(
  adapteri: KuntaSovitin,
  asiaUrl: string,
): Promise<KuntaDokumentti[]> {
  try {
    const dynasty = await haeKuntaDokumentit(asiaUrl);
    if (dynasty.length > 0) return dynasty;
    const asiat = await adapteri.haeAsiat(asiaUrl);
    return asiat.map((asia) => ({
      url: asia.url,
      otsikko: asia.otsikko,
      muoto: /\.pdf($|\?)/i.test(asia.url) ? "pdf" : "muu",
      laji: asia.kuvaus === "muu" ? "muu" : "kuulutus",
    }));
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "asiakirjat epäonnistui";
    console.warn(`asiakirjat ${asiaUrl}: ${viesti}`);
    return [];
  }
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

  const kuiva = process.env.KUNTA_ESITYSLISTA_KUIVA === "1";
  const kartoitus = process.env.KUNTA_ESITYSLISTA_KARTOITUS === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const hankkeet = await haeHankekunnat(supabase);
  const lahteet = await haeSeuratutLahteet(supabase);

  if (kartoitus) {
    const puuttuvat = puuttuvatLahteet(hankkeet, lahteet);
    console.log(
      `Kartoitus: ${lahteet.length} lähdettä, ${puuttuvat.length} hankekuntaa ilman lähdettä.`,
    );
    for (const k of puuttuvat.sort((a, b) => b.hankkeita - a.hankkeita).slice(0, 40)) {
      console.log(`  ${k.kunta}: ${k.hankkeita} hanketta, ei lähdettä`);
    }
    if (puuttuvat.length > 40) console.log(`  … ja ${puuttuvat.length - 40} muuta`);
    if (kuiva || lahteet.length === 0) return;
  }

  if (lahteet.length === 0) {
    console.log(
      `${EHDOTTAJA}: ei seurattavia lähteitä. Lisää kunta_esityslista_lahteet-tauluun tai aja KUNTA_ESITYSLISTA_KARTOITUS=1.`,
    );
    return;
  }

  const alkaen = new Date();
  alkaen.setDate(alkaen.getDate() - paivaaTaaksepain());
  const sanat = hakusanat();

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({ sovitin: SOVITIN, tila: "kaynnissa" })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "kunta_havainto")
    .eq("tila", "odottaa");
  const jonossa = new Set(
    (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
  );

  let osumia = 0;
  let kirjattu = 0;
  let httpTila: number | null = null;

  try {
    for (const lahde of lahteet) {
      const adapteri = sovitinJarjestelmalle(lahde.jarjestelma);
      if (!adapteri) continue;

      const juuri = new URL(lahde.perusUrl);
      if (!(await robotsSallii(juuri, USER_AGENT))) {
        console.warn(`robots.txt estää: ${lahde.kuntaNimi} ${lahde.perusUrl}`);
        continue;
      }

      let kokoukset;
      try {
        kokoukset = await adapteri.haeKokoukset(lahde.perusUrl, alkaen);
        httpTila = 200;
      } catch (syy) {
        const viesti = syy instanceof Error ? syy.message : "syöte epäonnistui";
        console.error(`${lahde.kuntaNimi} (${lahde.jarjestelma}): ${viesti}`);
        continue;
      }

      const paikallisetHankkeet = hankkeetKunnassa(hankkeet, lahde);

      for (const kohde of kokoukset) {
        const teksti = `${kohde.otsikko} ${kohde.kuvaus ?? ""}`;
        const sana = osuuHakusanaan(teksti, sanat);
        if (!sana) continue;
        osumia += 1;

        const lahdeUrl = kohde.url;
        if (jonossa.has(lahdeUrl)) continue;

        const hanke = valitseHanke(paikallisetHankkeet, kohde.otsikko, kohde.kuvaus);
        const huomautus = `${lahde.kuntaNimi}: «${kohde.otsikko}» (hakusana: ${sana}).`;

        const dokumentit = await haeAsiaDokumentit(adapteri, lahdeUrl);
        await odota(viiveMs());

        if (kuiva) {
          console.log(
            `kuiva: ${huomautus} → ${lahdeUrl}${dokumentit.length ? ` (${dokumentit.length} asiakirjaa)` : ""}`,
          );
          kirjattu += 1;
          continue;
        }

        const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
          tyyppi: "kunta_havainto",
          hanke_id: hanke?.id ?? null,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: lahdeUrl,
          huomautus,
          tila: "odottaa",
          sisalto: {
            kentat: {},
            kunta: {
              kunta_id: lahde.kuntaId,
              kunta_nimi: lahde.kuntaNimi,
              jarjestelma: lahde.jarjestelma,
              syote_url: lahde.perusUrl,
              otsikko: kohde.otsikko,
              kuvaus: kohde.kuvaus ?? null,
              alkoi: kohde.alkaa?.toISOString() ?? null,
              hakusana: sana,
              hankkeita_kunnassa: paikallisetHankkeet.length,
              dokumentit,
            },
          },
        });
        if (lisaysVirhe) throw new Error(lisaysVirhe.message);
        jonossa.add(lahdeUrl);
        kirjattu += 1;
        console.log(
          `kirjattu: ${lahde.kuntaNimi} · ${kohde.otsikko.slice(0, 60)}${dokumentit.length ? ` · ${dokumentit.length} asiakirjaa` : ""}`,
        );
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
      `${EHDOTTAJA}: ${lahteet.length} lähdettä, ${osumia} hakusanat osumaa, ${kirjattu} kirjattu${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Kuntakokousajo epäonnistui.";
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

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
