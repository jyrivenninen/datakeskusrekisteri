/**
 * Selkeät odottavat ehdotukset ja kaksi vanhentunutta Visulahti-lähdettä.
 * Aja: npx tsx scripts/kasittele-selkeat-pending-2026-10-26.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import {
  hyvaksyMuutosehdotus,
  hylkaaMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";

type Ytj = {
  organisaatio_id?: string;
  y_tunnus?: string;
  muuttunut?: boolean;
  ei_loydy?: boolean;
  ehdota_tunnus?: boolean;
  ehdota_verkkotunnus?: boolean;
  verkkotunnus_ehdotus?: string | null;
  website_ytj?: string | null;
};

type Rivi = {
  id: string;
  tyyppi: string;
  huomautus: string | null;
  lahde_url: string | null;
  sisalto: EhdotusSisalto & { ytj?: Ytj };
};

function laske(yhteenveto: Record<string, number>, avain: string) {
  yhteenveto[avain] = (yhteenveto[avain] ?? 0) + 1;
}

async function httpTila(url: string): Promise<number | null> {
  const otsikot = {
    "user-agent": "Datakeskusrekisteri/0.1 (+https://www.datakeskusrekisteri.fi/; jono)",
  };
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: otsikot,
      signal: AbortSignal.timeout(20000),
    });
    if (head.status !== 405 && head.status !== 403) return head.status;
  } catch {
    /* GET alla */
  }
  try {
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: otsikot,
      signal: AbortSignal.timeout(20000),
    });
    return get.status;
  } catch {
    return null;
  }
}

async function kasitteleLinkit(
  rivit: Rivi[],
  yhteenveto: Record<string, number>,
) {
  for (const rivi of rivit.filter((r) => r.tyyppi === "linkki_rikki")) {
    const url = rivi.lahde_url;
    if (!url) {
      laske(yhteenveto, "linkki_ohitettu");
      continue;
    }
    const tila = await httpTila(url);
    if (tila != null && tila >= 200 && tila < 400) {
      await hylkaaMuutosehdotus(
        rivi.id,
        KASITTELIJA,
        `Uudelleentarkistus: HTTP ${tila}, linkki vastaa.`,
      );
      console.log(`✗ linkki toimii ${tila} ${url}`);
      laske(yhteenveto, "linkki_toimii");
      continue;
    }
    if (tila === 404 || tila === 410) {
      await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
      console.log(`✓ linkki rikki ${tila} ${url}`);
      laske(yhteenveto, "linkki_rikki_kuittaus");
      continue;
    }
    console.log(`· linkki epäselvä ${tila ?? "ei vastausta"} ${url}`);
    laske(yhteenveto, "linkki_epa_selva");
  }
}

async function kasitteleYtj(
  sb: SupabaseClient,
  rivit: Rivi[],
  yhteenveto: Record<string, number>,
) {
  for (const rivi of rivit.filter((r) => r.tyyppi === "ytj_havainto")) {
    const ytj = rivi.sisalto.ytj;
    if (!ytj) {
      laske(yhteenveto, "ytj_ohitettu");
      continue;
    }
    if (ytj.ehdota_tunnus) {
      console.log(`· ytj Y-tunnusehdotus jää jonoon ${ytj.y_tunnus ?? ""}`);
      laske(yhteenveto, "ytj_tunnus_jonoon");
      continue;
    }
    if (ytj.ei_loydy) {
      await hylkaaMuutosehdotus(
        rivi.id,
        KASITTELIJA,
        "PRH:n avoin YTJ-aineisto ei palauttanut tietuetta. Tunnusta ei poisteta.",
      );
      console.log(`✗ ytj ei löydy ${ytj.y_tunnus ?? ""}`);
      laske(yhteenveto, "ytj_ei_loydy");
      continue;
    }
    if (ytj.ehdota_verkkotunnus && ytj.verkkotunnus_ehdotus && ytj.organisaatio_id) {
      const tunnus = ytj.verkkotunnus_ehdotus.toLowerCase();
      const { data: org, error: lukuVirhe } = await sb
        .from("organisaatiot")
        .select("id, nimi, verkkotunnus")
        .eq("id", ytj.organisaatio_id)
        .maybeSingle();
      if (lukuVirhe) throw new Error(lukuVirhe.message);
      if (!org) {
        laske(yhteenveto, "ytj_org_puuttuu");
        continue;
      }
      if (org.verkkotunnus?.trim()) {
        console.log(`· ytj verkkotunnus jo asetettu ${org.nimi}: ${org.verkkotunnus}`);
        laske(yhteenveto, "ytj_verkkotunnus_jo");
        continue;
      }
      const { error: updVirhe } = await sb
        .from("organisaatiot")
        .update({ verkkotunnus: tunnus })
        .eq("id", ytj.organisaatio_id)
        .is("verkkotunnus", null);
      if (updVirhe) {
        console.log(`· ytj verkkotunnus ei tallentunut ${org.nimi}: ${updVirhe.message}`);
        laske(yhteenveto, "ytj_verkkotunnus_estetty");
        continue;
      }
      const { data: jalkeen } = await sb
        .from("organisaatiot")
        .select("verkkotunnus")
        .eq("id", ytj.organisaatio_id)
        .maybeSingle();
      if (jalkeen?.verkkotunnus !== tunnus) {
        console.log(`· ytj verkkotunnus ei muuttunut ${org.nimi} → ${tunnus}`);
        laske(yhteenveto, "ytj_verkkotunnus_estetty");
        continue;
      }
      const lahdeUrl =
        rivi.lahde_url ??
        `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${ytj.y_tunnus}`;
      const { error: lahdeVirhe } = await sb.rpc("tallenna_kentta_lahde", {
        p_taulu: "organisaatiot",
        p_rivi_id: ytj.organisaatio_id,
        p_kentta: "verkkotunnus",
        p_lahde_url: lahdeUrl,
        p_lahde_sivu: null,
        p_vahvistettu_pvm: new Date().toISOString().slice(0, 10),
        p_luottamus: "epavarma",
        p_lainaus: ytj.website_ytj ?? tunnus,
        p_merkitty: "koneen_ehdottama",
        p_lahde_laji: "rajapinta",
      });
      if (lahdeVirhe) throw new Error(lahdeVirhe.message);
      await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
      console.log(`✓ ytj verkkotunnus ${org.nimi} → ${tunnus}`);
      laske(yhteenveto, "ytj_verkkotunnus");
      continue;
    }
    if (ytj.muuttunut) {
      await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
      console.log(`✓ ytj muuttunut ${ytj.y_tunnus ?? rivi.id}`);
      laske(yhteenveto, "ytj_muuttunut");
      continue;
    }
    console.log(`· ytj ohitettu ${rivi.huomautus?.slice(0, 80) ?? rivi.id}`);
    laske(yhteenveto, "ytj_ohitettu");
  }
}

function normalisoi(teksti: string): string {
  return teksti.replace(/\s+/g, " ").trim().toLowerCase();
}

async function kasitteleVanhentuneet(
  sb: SupabaseClient,
  yhteenveto: Record<string, number>,
) {
  const { data, error } = await sb.rpc("vanhentuneet_kentat", { p_kuukautta: 6 });
  if (error) throw new Error(error.message);
  const rivit = (data ?? []) as Array<{
    hanke_id: string;
    hanke_nimi: string;
    kentta: string;
    lahde_url: string | null;
  }>;
  for (const rivi of rivit) {
    if (!rivi.lahde_url) {
      console.log(`· vanhentunut ilman URLia ${rivi.hanke_nimi} ${rivi.kentta}`);
      laske(yhteenveto, "vanhentunut_ohitettu");
      continue;
    }
    const { data: lahde, error: lahdeVirhe } = await sb
      .from("kentta_lahteet")
      .select("id, lainaus, lahde_url")
      .eq("taulu", "hankkeet")
      .eq("rivi_id", rivi.hanke_id)
      .eq("kentta", rivi.kentta)
      .eq("lahde_url", rivi.lahde_url)
      .maybeSingle();
    if (lahdeVirhe) throw new Error(lahdeVirhe.message);
    if (!lahde?.lainaus?.trim()) {
      console.log(`· vanhentunut ilman lainausta ${rivi.hanke_nimi}`);
      laske(yhteenveto, "vanhentunut_ohitettu");
      continue;
    }
    let sivu = "";
    try {
      const vastaus = await fetch(rivi.lahde_url, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Datakeskusrekisteri/0.1 (+https://www.datakeskusrekisteri.fi/; vanhentuneet)",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!vastaus.ok) {
        console.log(`· vanhentunut HTTP ${vastaus.status} ${rivi.hanke_nimi}`);
        laske(yhteenveto, "vanhentunut_sivu_ei_vastaa");
        continue;
      }
      sivu = await vastaus.text();
    } catch {
      console.log(`· vanhentunut ei vastausta ${rivi.hanke_nimi}`);
      laske(yhteenveto, "vanhentunut_sivu_ei_vastaa");
      continue;
    }
    const lainaus = normalisoi(lahde.lainaus);
    if (!normalisoi(sivu).includes(lainaus)) {
      console.log(`· vanhentunut lainaus ei enää sivulla ${rivi.hanke_nimi}`);
      laske(yhteenveto, "vanhentunut_lainaus_puuttuu");
      continue;
    }
    const { error: rpcVirhe } = await sb.rpc("paivita_kentta_lahde_sisalto", {
      p_lahde_id: lahde.id,
      p_tarkistettu: true,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    console.log(`✓ vanhentunut tarkistettu ${rivi.hanke_nimi} · ${rivi.kentta}`);
    laske(yhteenveto, "vanhentunut_tarkistettu");
  }
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, tyyppi, huomautus, lahde_url, sisalto")
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
  const rivit = (data ?? []) as Rivi[];
  const yhteenveto: Record<string, number> = {};

  await kasitteleVanhentuneet(sb, yhteenveto);

  for (const rivi of rivit.filter((r) => r.tyyppi === "dokumentti_muuttunut")) {
    await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
    console.log(`✓ dokumentti muuttunut ${(rivi.lahde_url ?? "").slice(0, 80)}`);
    laske(yhteenveto, "dokumentti_muuttunut");
  }

  await kasitteleYtj(sb, rivit, yhteenveto);
  await kasitteleLinkit(rivit, yhteenveto);

  const { count } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .eq("tila", "odottaa");
  console.log(JSON.stringify({ yhteenveto, odottaa_jaljella: count }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
