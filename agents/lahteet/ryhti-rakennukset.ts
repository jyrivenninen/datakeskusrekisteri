/**
 * 7A.5.1b Ryhti rakennus/osoite — pakettien valvonta ja OGC-rakennustunnistus.
 * Ei kielimallia. Ei koko maan pakettien latausta.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  RYHTI_AINEISTOPAKETIT,
  haeRyhtiOsoiteLahella,
  haeRyhtiOsoitteetTekstilla,
} from "../../src/lib/ryhti-rakennus";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; ryhti-rakennukset)";
const SOVITIN = "ryhti-rakennus";
const EHDOTTAJA = "agents/lahteet/ryhti-rakennukset";

type TietokantaAsiakas = SupabaseClient;

function tiiviste(teksti: string): string {
  return createHash("sha256").update(teksti, "utf8").digest("hex");
}

function viiveMs(): number {
  const n = Number(process.env.RYHTI_RAKENNUS_VIIVE_MS ?? "1000");
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tarkistaPaketti(url: string): Promise<{ tila: number; lastModified: string | null }> {
  const vastaus = await fetch(url, {
    method: "HEAD",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  return {
    tila: vastaus.status,
    lastModified: vastaus.headers.get("last-modified"),
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan.");
  }
  const kuiva = process.env.RYHTI_RAKENNUS_KUIVA === "1";
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
        kysely_url: RYHTI_AINEISTOPAKETIT.osoitteet.json,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  let httpTila: number | null = null;
  let osumia = 0;

  try {
    for (const [nimi, pakettiUrl] of Object.entries(RYHTI_AINEISTOPAKETIT.osoitteet)) {
      const tulos = await tarkistaPaketti(pakettiUrl);
      httpTila = tulos.tila;
      console.log(`Paketti ${nimi}: HTTP ${tulos.tila}${tulos.lastModified ? `, ${tulos.lastModified}` : ""}`);
      if (tulos.tila >= 400) continue;
      const tietueUrl = pakettiUrl;
      const tiiv = tiiviste(`${tulos.lastModified ?? ""}:${tulos.tila}`);
      if (!kuiva) {
        await supabase.from("rajapinta_tiivisteet").upsert(
          {
            sovitin: `${SOVITIN}-paketti-${nimi}`,
            tietue_url: tietueUrl,
            tiiviste: tiiv,
            tarkistettu_pvm: new Date().toISOString(),
          },
          { onConflict: "sovitin,tietue_url" },
        );
      }
      osumia += 1;
      await odota(viiveMs());
    }

    const { data: hankkeet, error: hankeVirhe } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, kunta_id, sijainti_lat, sijainti_lon")
      .eq("julkaistu", true)
      .is("yhdistetty_kohde_id", null);
    if (hankeVirhe) throw new Error(hankeVirhe.message);

    const { data: kunnat } = await supabase.from("kunnat").select("id, koodi, nimi").eq("voimassa", true);
    const kuntaKoodi = new Map((kunnat ?? []).map((k) => [k.id as string, k.koodi as string]));

    const { data: odottavat } = await supabase
      .from("muutosehdotukset")
      .select("lahde_url")
      .eq("tyyppi", "ryhti_havainto")
      .eq("tila", "odottaa");
    const jonossa = new Set(
      (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
    );

    for (const hanke of hankkeet ?? []) {
      const koodi =
        (hanke.kunta_id ? kuntaKoodi.get(hanke.kunta_id as string) : null) ?? null;
      const lat = hanke.sijainti_lat != null ? Number(hanke.sijainti_lat) : null;
      const lon = hanke.sijainti_lon != null ? Number(hanke.sijainti_lon) : null;

      let osuma = null;
      if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
        osuma = await haeRyhtiOsoiteLahella(lat, lon, koodi);
      }
      if (!osuma && hanke.nimi) {
        const teksti = String(hanke.nimi).slice(0, 40);
        const lista = await haeRyhtiOsoitteetTekstilla(teksti, koodi, 1);
        osuma = lista[0] ?? null;
      }
      if (!osuma) continue;

      if (jonossa.has(osuma.lahde_url)) continue;

      const huomautus = `Ryhti-osoite löytyi hankkeelle «${hanke.nimi}»: ${osuma.address_fin}. Rakennustunnistus OGC-haulla, ei vuorokausipaketin latausta.`;

      if (kuiva) {
        console.log(`kuiva: ${huomautus}`);
        osumia += 1;
        continue;
      }

      const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
        tyyppi: "ryhti_havainto",
        hanke_id: hanke.id as string,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: EHDOTTAJA,
        lahde_url: osuma.lahde_url,
        huomautus,
        tila: "odottaa",
        sisalto: {
          kentat: {},
          ryhti: {
            kokoelma: "open_address",
            kokoelma_nimi: "Rakennusten osoitteet",
            nimi: osuma.address_fin,
            building_key: osuma.building_key,
            municipality_number: osuma.municipality_number,
            rakennustunnistus: true,
          },
        },
      });
      if (lisaysVirhe) throw new Error(lisaysVirhe.message);
      jonossa.add(osuma.lahde_url);
      osumia += 1;
      console.log(`kirjattu: ${hanke.nimi} → ${osuma.address_fin}`);
      await odota(viiveMs());
    }

    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia,
        })
        .eq("id", ajoId);
    }
    console.log(`Valmis. ${osumia} osumaa/pakettia${kuiva ? " (kuiva-ajo)" : ""}.`);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Ryhti-rakennusajo epäonnistui.";
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

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
