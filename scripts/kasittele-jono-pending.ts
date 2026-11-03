/**
 * Käsittelee odottavan jonon selkeät tapaukset.
 * Aja: npx tsx scripts/kasittele-jono-pending.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import {
  hyvaksyMuutosehdotus,
  hylkaaMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "yllapito:jonon-kasittely";

const HYLATYT_IDS = [
  "683a4b36-e3c8-4667-8ded-d840f2f73777", // YTJ ei löydy 3367058-8
  "33178f9d-ab1d-45ff-9d08-728fabff2548", // vaihe/lehtitulkinta, ei automaattia
  "7ed4a0dd-bc32-4648-a6d7-e6cd2649feca", // vaihe/lehtitulkinta
  "25f7bd54-bd33-4204-ba43-a3087016141a", // uusisuomi blogi, ei viranomaisasiakirja
  "344c4168-5e09-482c-baa6-56fcac2d5e04", // seinajoki markkinointisivu
];

const REGANT_TOIMIJA = "49b12d6e-c955-4c8f-9635-134728c6b4a5";

async function kasitteleYtj(
  sb: ReturnType<typeof createClient>,
  id: string,
  sisalto: EhdotusSisalto,
  huomautus: string,
) {
  const ytj = sisalto.ytj;
  if (!ytj) return "ohita";

  if (ytj.ei_loydy) {
    await hylkaaMuutosehdotus(id, KASITTELIJA, "PRH ei palauttanut tietuetta.");
    return "hylatty";
  }

  if (ytj.ehdota_tunnus && ytj.y_tunnus && ytj.organisaatio_id) {
    await hyvaksyMuutosehdotus(id, KASITTELIJA);
    return "y_tunnus";
  }

  if (ytj.ehdota_verkkotunnus && ytj.verkkotunnus_ehdotus && ytj.organisaatio_id) {
    const tunnus = ytj.verkkotunnus_ehdotus.toLowerCase();
    const { data: org } = await sb
      .from("organisaatiot")
      .select("id, verkkotunnus")
      .eq("id", ytj.organisaatio_id)
      .maybeSingle();
    if (org && !org.verkkotunnus?.trim()) {
      const { error: updVirhe } = await sb
        .from("organisaatiot")
        .update({ verkkotunnus: tunnus })
        .eq("id", ytj.organisaatio_id);
      if (updVirhe) throw new Error(updVirhe.message);
      const { error: lahdeVirhe } = await sb.rpc("tallenna_kentta_lahde", {
        p_taulu: "organisaatiot",
        p_rivi_id: ytj.organisaatio_id,
        p_kentta: "verkkotunnus",
        p_lahde_url: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${ytj.y_tunnus}`,
        p_lahde_sivu: null,
        p_vahvistettu_pvm: new Date().toISOString().slice(0, 10),
        p_luottamus: "vahvistettu",
        p_lainaus: ytj.website_ytj ?? tunnus,
        p_merkitty: "koneen_ehdottama",
        p_lahde_laji: "rajapinta",
      });
      if (lahdeVirhe) throw new Error(lahdeVirhe.message);
    }
    await hyvaksyMuutosehdotus(id, KASITTELIJA);
    return "verkkotunnus";
  }

  if (ytj.muuttunut && !ytj.ehdota_tunnus && !ytj.ehdota_verkkotunnus) {
    await hyvaksyMuutosehdotus(id, KASITTELIJA);
    return "kuittaus_muutos";
  }

  if (huomautus.includes("ei löytynyt tietuetta")) {
    await hylkaaMuutosehdotus(id, KASITTELIJA, huomautus);
    return "hylatty";
  }

  return "ohita";
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const yhteenveto: Record<string, number> = {};

  for (const id of HYLATYT_IDS) {
    try {
      await hylkaaMuutosehdotus(id, KASITTELIJA, "Ei automaattihyväksyntää.");
      yhteenveto.hylatty = (yhteenveto.hylatty ?? 0) + 1;
    } catch (e) {
      console.warn("Hylkäys ohitettu", id, e);
    }
  }

  try {
    await hyvaksyMuutosehdotus(REGANT_TOIMIJA, KASITTELIJA);
    yhteenveto.regant_toimija = 1;
  } catch (e) {
    console.warn("Regant toimija", e);
  }

  const { data: ytjJonossa } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus, sisalto")
    .eq("tyyppi", "ytj_havainto")
    .eq("tila", "odottaa");

  for (const rivi of ytjJonossa ?? []) {
    try {
      const tulos = await kasitteleYtj(
        sb,
        rivi.id,
        rivi.sisalto as EhdotusSisalto,
        rivi.huomautus ?? "",
      );
      yhteenveto[`ytj_${tulos}`] = (yhteenveto[`ytj_${tulos}`] ?? 0) + 1;
    } catch (e) {
      console.warn("YTJ", rivi.id, e);
      yhteenveto.ytj_virhe = (yhteenveto.ytj_virhe ?? 0) + 1;
    }
  }

  const { data: linkit } = await sb
    .from("muutosehdotukset")
    .select("id, lahde_url")
    .eq("tyyppi", "linkki_rikki")
    .eq("tila", "odottaa");

  for (const rivi of linkit ?? []) {
    try {
      const vastaus = await fetch(rivi.lahde_url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (vastaus.ok) {
        await hylkaaMuutosehdotus(
          rivi.id,
          KASITTELIJA,
          `Uudelleentarkistus: HTTP ${vastaus.status}, linkki toimii.`,
        );
        yhteenveto.linkki_toimii = (yhteenveto.linkki_toimii ?? 0) + 1;
      } else {
        await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
        yhteenveto.linkki_kuittaus = (yhteenveto.linkki_kuittaus ?? 0) + 1;
      }
    } catch {
      await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
      yhteenveto.linkki_kuittaus = (yhteenveto.linkki_kuittaus ?? 0) + 1;
    }
  }

  const { count: jaljella } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .eq("tila", "odottaa");

  console.log(JSON.stringify({ yhteenveto, odottaa_jaljella: jaljella }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
