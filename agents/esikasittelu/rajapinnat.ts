/**
 * Rakenteiset taustahaut esikäsittelijälle (7A.5). Ei kielimallia.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const RYHTI_JUURI =
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1";
const SYKE_USERID_OLETUS = "datakeskusrekisteri";

export type KuntaTiedot = {
  koodi: string;
  nimi: string;
  maakunta: string | null;
  lahde_url: string | null;
};

export type RyhtiOsuma = {
  kokoelma: string;
  kohde_id: string;
  nimi: string | null;
  kaavatunnus: string | null;
  lahde_url: string;
};

export type DuplikaattiHanke = {
  id: string;
  nimi: string;
  kunta: string;
};

function sykeUserid(): string {
  return process.env.SYKE_RAJAPINTA_TUNNISTE?.trim() || SYKE_USERID_OLETUS;
}

function userAgent(): string {
  return `Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; esikasittelu) sykeuserid/${sykeUserid()}`;
}

function osoiteSykeTunnisteella(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("sykeuserid")) {
    u.searchParams.set("sykeuserid", sykeUserid());
  }
  return u.toString();
}

function cqlMerkkijono(arvo: string): string {
  return arvo.replaceAll("'", "''");
}

function nimisanat(nimi: string): string[] {
  return [
    ...new Set(
      nimi
        .toLowerCase()
        .split(/[^a-z0-9äöå]+/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4),
    ),
  ];
}

function kuntaSuodatin(koodi: string): string | null {
  const pad = koodi.trim();
  if (!/^\d+$/.test(pad)) return null;
  const ilman = pad.replace(/^0+/, "") || "0";
  const osat = new Set([`%"${cqlMerkkijono(pad)}"%`]);
  if (ilman !== pad) osat.add(`%"${cqlMerkkijono(ilman)}"%`);
  return [...osat]
    .map((m) => `administrative_area_identifiers like '${m}'`)
    .join(" or ");
}

function hakusanaSuodatin(sanat: string[]): string | null {
  const osat: string[] = [];
  for (const sana of sanat) {
    const s = cqlMerkkijono(sana.toLowerCase());
    osat.push(`strToLowerCase(name_fin) like '%${s}%'`);
    osat.push(`strToLowerCase(description_fin) like '%${s}%'`);
  }
  if (osat.length === 0) return null;
  return `(${osat.join(" or ")})`;
}

export async function haeKuntaTiedot(
  supabase: SupabaseClient,
  kuntaNimi: string,
): Promise<KuntaTiedot | null> {
  const { data, error } = await supabase
    .from("kunnat")
    .select("koodi, nimi, maakunta, lahde_url")
    .ilike("nimi", kuntaNimi.trim())
    .eq("voimassa", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    koodi: data.koodi as string,
    nimi: data.nimi as string,
    maakunta: (data.maakunta as string | null) ?? null,
    lahde_url: (data.lahde_url as string | null) ?? null,
  };
}

export async function haeRyhtiNimella(
  nimi: string,
  kuntaKoodi: string | null,
): Promise<RyhtiOsuma | null> {
  const sanat = nimisanat(nimi);
  if (sanat.length === 0) return null;

  const osat = [hakusanaSuodatin(sanat)];
  if (kuntaKoodi) {
    const kuntaFiltteri = kuntaSuodatin(kuntaKoodi);
    if (kuntaFiltteri) osat.push(`(${kuntaFiltteri})`);
  }
  const suodatin = osat.filter(Boolean).join(" and ");
  if (!suodatin) return null;

  const kokoelma = "pub_valid_ld_plan_ix_gs";
  const url = new URL(`${RYHTI_JUURI}/collections/${kokoelma}/items`);
  url.searchParams.set("limit", "5");
  url.searchParams.set("filter-lang", "cql2-text");
  url.searchParams.set("filter", suodatin);

  const vastaus = await fetch(osoiteSykeTunnisteella(url.toString()), {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/geo+json, application/json",
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!vastaus.ok) return null;
  const runko = (await vastaus.json()) as {
    features?: {
      id?: string;
      properties?: Record<string, unknown>;
    }[];
  };
  const kohde = runko.features?.[0];
  if (!kohde?.id) return null;
  const p = kohde.properties ?? {};
  const kaavatunnus =
    (typeof p.permanent_plan_identifier === "string" && p.permanent_plan_identifier.trim()) ||
    (typeof p.producer_plan_identifier === "string" && p.producer_plan_identifier.trim()) ||
    null;
  const nimiFin =
    (typeof p.name_fin === "string" && p.name_fin.trim()) ||
    (typeof p.name_swe === "string" && p.name_swe.trim()) ||
    null;
  return {
    kokoelma,
    kohde_id: String(kohde.id),
    nimi: nimiFin,
    kaavatunnus,
    lahde_url: `${RYHTI_JUURI}/collections/${kokoelma}/items/${encodeURIComponent(String(kohde.id))}`,
  };
}

export async function etsiDuplikaatit(
  supabase: SupabaseClient,
  nimi: string,
  kunta: string,
): Promise<DuplikaattiHanke[]> {
  const { data, error } = await supabase
    .from("hankkeet")
    .select("id, nimi, kunta")
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null)
    .ilike("kunta", kunta.trim())
    .ilike("nimi", `%${nimi.trim().slice(0, 40)}%`)
    .limit(5);
  if (error) throw new Error(error.message);
  return (data ?? []) as DuplikaattiHanke[];
}
