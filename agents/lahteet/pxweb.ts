/**
 * 7A.5.7 Tilastokeskus PxWeb — kuntien väkiluvut. Ei kielimallia.
 *
 * Todennus 7.9.2026: juuri https://pxdata.stat.fi/PxWeb/api/v1/ (ei pxweb2.stat.fi).
 * Taulukko 11re.px, muuttujakoodit haetaan metadatasta (kesäkuu 2026 -uudistus).
 *
 * Kirjoittaa kunnat.vaekiluku ja lahdeajot. Ei hankkeet-tauluun.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: PXWEB_KUIVA=1, PXWEB_VIIVE_MS (500)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; pxweb)";
const SOVITIN = "pxweb-vaesto";
const JUURI = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/vaerak";
const TAULUKKO = "11re.px";
const LAHDE_URL = `${JUURI}/${TAULUKKO}`;
const SISALTO_ARVO = "vaerak-vaesto";

type TietokantaAsiakas = SupabaseClient;

type PxMuuttuja = {
  code: string;
  text?: string;
  values?: string[];
};

type PxMetadata = {
  variables?: PxMuuttuja[];
};

type JsonStat2 = {
  value?: (number | null)[];
  dimension?: Record<
    string,
    {
      category?: {
        index?: Record<string, number>;
        label?: Record<string, string>;
      };
    }
  >;
};

function viiveMs(): number {
  const n = Number(process.env.PXWEB_VIIVE_MS ?? "500");
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pxKuntaKoodi(koodi: string): string {
  const numero = koodi.trim().padStart(3, "0");
  return `KU${numero}`;
}

function etsiMuuttuja(meta: PxMetadata, osa: string): string {
  const muuttuja = meta.variables?.find((v) => v.code.toLowerCase().includes(osa));
  if (!muuttuja?.code) {
    throw new Error(`PxWeb-metadatassa ei löydy muuttujaa (${osa}).`);
  }
  return muuttuja.code;
}

async function haeMetadata(): Promise<PxMetadata> {
  const vastaus = await fetch(LAHDE_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) {
    throw new Error(`PxWeb metadata ${vastaus.status}: ${LAHDE_URL}`);
  }
  return (await vastaus.json()) as PxMetadata;
}

async function haeVaestot(meta: PxMetadata): Promise<{ vuosi: string; arvot: Map<string, number> }> {
  const alueKoodi = etsiMuuttuja(meta, "alue");
  const ikaKoodi = etsiMuuttuja(meta, "ik");
  const sukupuoliKoodi = etsiMuuttuja(meta, "sukupuoli");
  const aikaKoodi = meta.variables?.find((v) => v.code === "timeperiod_y")?.code ?? "timeperiod_y";
  const tietoKoodi = meta.variables?.find((v) => v.code === "contentscode")?.code ?? "contentscode";

  const runko = {
    query: [
      { code: alueKoodi, selection: { filter: "all", values: ["*"] } },
      { code: ikaKoodi, selection: { filter: "item", values: ["SSS"] } },
      { code: sukupuoliKoodi, selection: { filter: "item", values: ["SSS"] } },
      { code: aikaKoodi, selection: { filter: "top", values: ["1"] } },
      { code: tietoKoodi, selection: { filter: "item", values: [SISALTO_ARVO] } },
    ],
    response: { format: "json-stat2" },
  };

  const vastaus = await fetch(LAHDE_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(runko),
    signal: AbortSignal.timeout(60_000),
  });
  if (!vastaus.ok) {
    throw new Error(`PxWeb POST ${vastaus.status}: ${LAHDE_URL}`);
  }

  const data = (await vastaus.json()) as JsonStat2;
  const alueDim = data.dimension?.[alueKoodi]?.category;
  const aikaDim = data.dimension?.[aikaKoodi]?.category;
  if (!alueDim?.index || !data.value) {
    throw new Error("PxWeb-vastaus puuttuu alue- tai arvoaineisto.");
  }

  const vuosiAvain = Object.keys(aikaDim?.label ?? {})[0] ?? "";
  const arvot = new Map<string, number>();
  for (const [alue, indeksi] of Object.entries(alueDim.index)) {
    if (!alue.startsWith("KU")) continue;
    const luku = data.value[indeksi];
    if (luku == null || !Number.isFinite(luku)) continue;
    arvot.set(alue.slice(2), Math.round(luku));
  }
  return { vuosi: vuosiAvain, arvot };
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
  const kuiva = process.env.PXWEB_KUIVA === "1";
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
        kysely_url: LAHDE_URL,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  try {
    const meta = await haeMetadata();
    await odota(viiveMs());
    const { vuosi, arvot } = await haeVaestot(meta);

    const { data: kunnat, error: kuntaVirhe } = await supabase
      .from("kunnat")
      .select("id, koodi")
      .eq("voimassa", true);
    if (kuntaVirhe) throw new Error(kuntaVirhe.message);

    let paivitetty = 0;
    for (const kunta of kunnat ?? []) {
      const koodi = kunta.koodi as string;
      const vaekiluku = arvot.get(koodi.padStart(3, "0"));
      if (vaekiluku == null) continue;
      if (kuiva) {
        console.log(`${koodi}: ${vaekiluku} (${vuosi})`);
        paivitetty += 1;
        continue;
      }
      const { error } = await supabase
        .from("kunnat")
        .update({
          vaekiluku,
          vaekiluku_vuosi: vuosi,
          vaekiluku_lahde_url: `${LAHDE_URL}#${pxKuntaKoodi(koodi)}`,
        })
        .eq("id", kunta.id);
      if (error) throw new Error(`${koodi}: ${error.message}`);
      paivitetty += 1;
    }

    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: 200,
          osumia: paivitetty,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }

    console.log(
      `PxWeb: ${paivitetty} kuntaa, vuosi ${vuosi}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "PxWeb-ajo epäonnistui.";
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
