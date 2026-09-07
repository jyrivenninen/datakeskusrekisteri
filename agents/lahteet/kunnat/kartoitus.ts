/**
 * 7A.6 — automaattinen kuntalähteiden kartoitus (RSS + avoindata.fi).
 * Ei kielimallia. Kirjoittaa kunta_esityslista_lahteet-tauluun.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { haeHankekunnat, puuttuvatLahteet, haeSeuratutLahteet } from "./kuntakartoitus";

const CKAN_HAKU = "https://avoindata.fi/data/api/3/action/package_search";
const RSS_POLKU = "/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30";
const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; kuntakartoitus)";

const HAKUSANAT_AVOINDATA = [
  "päätökset kokoukset",
  "päätöksenteon asiakirjat",
  "kokoukset ja päätökset",
  "esityslista",
];

function slug(nimi: string): string {
  return nimi
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "");
}

function slugHyphen(nimi: string): string {
  return nimi
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/å/g, "a")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function rssEhdokasUrlit(nimi: string): string[] {
  const s = slug(nimi);
  const h = slugHyphen(nimi);
  const pohjat = [
    `https://${s}.oncloudos.com${RSS_POLKU}`,
    `https://${s}10.oncloudos.com${RSS_POLKU}`,
    `https://${h}.oncloudos.com${RSS_POLKU}`,
    `https://julkaisu.${s}.fi${RSS_POLKU}`,
    `https://dynasty.${s}.fi${RSS_POLKU}`,
    `https://${s}.fi${RSS_POLKU}`,
  ];
  const erikoiset: Record<string, string[]> = {
    Kouvola: [`https://ep10.kouvola.fi/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30`],
    Pietarsaari: [`https://pietarsaari.oncloudos.com${RSS_POLKU}`, `https://jakobstad.oncloudos.com${RSS_POLKU}`],
    Tuusula: [`https://tuusula.oncloudos.com${RSS_POLKU}`],
    Helsinki: [`https://helsinki.oncloudos.com${RSS_POLKU}`],
    Oulu: [`https://oulu.oncloudos.com${RSS_POLKU}`],
  };
  return [...new Set([...(erikoiset[nimi] ?? []), ...pohjat])];
}

async function onRss(url: string): Promise<boolean> {
  try {
    const vastaus = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, */*", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!vastaus.ok) return false;
    const teksti = (await vastaus.text()).slice(0, 50_000);
    return /<item[\s>]/i.test(teksti) || /<entry[\s>]/i.test(teksti);
  } catch {
    return false;
  }
}

async function etsiRss(nimi: string): Promise<string | null> {
  for (const url of rssEhdokasUrlit(nimi)) {
    if (await onRss(url)) return url;
  }
  return null;
}

function normalisoi(nimi: string): string {
  return nimi
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/å/g, "a")
    .trim();
}

type CkanPaketti = {
  title?: string;
  organization?: { title?: string; name?: string };
  resources?: { format?: string; url?: string; mimetype?: string }[];
};

async function etsiAvoindata(nimi: string): Promise<string | null> {
  const naytetty = new Set<string>();
  for (const sana of HAKUSANAT_AVOINDATA) {
    const u = new URL(CKAN_HAKU);
    u.searchParams.set("q", `${nimi} ${sana}`);
    u.searchParams.set("rows", "15");
    const vastaus = await fetch(u, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!vastaus.ok) continue;
    const runko = (await vastaus.json()) as {
      result?: { results?: CkanPaketti[] };
    };
    for (const paketti of runko.result?.results ?? []) {
      const org = paketti.organization?.title ?? paketti.organization?.name ?? "";
      const slugNimi = normalisoi(nimi).replace(/ kaupunki$/, "").replace(/ kunta$/, "");
      if (!normalisoi(`${org} ${paketti.title ?? ""}`).includes(slugNimi)) continue;
      for (const res of paketti.resources ?? []) {
        if (!res.url || naytetty.has(res.url)) continue;
        naytetty.add(res.url);
        const fmt = (res.format ?? "").toUpperCase();
        if (fmt !== "JSON" && fmt !== "API" && !res.url.includes("/api/")) continue;
        try {
          const test = await fetch(res.url, {
            headers: { Accept: "application/json", "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(10_000),
          });
          if (!test.ok) continue;
          const teksti = (await test.text()).trim();
          if (teksti.startsWith("{") || teksti.startsWith("[")) return res.url;
        } catch {
          /* seuraava */
        }
      }
    }
  }
  return null;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type KartoitusTulos = {
  rss: number;
  avoindata: number;
  eiLoydy: string[];
};

/** Etsii ja valinnaisesti kirjoittaa puuttuvat kuntalähteet. */
export async function kartoitaPuuttuvatLahteet(
  supabase: SupabaseClient,
  opts: { kirjoita: boolean; kuiva?: boolean; viiveMs?: number },
): Promise<KartoitusTulos> {
  const viive = opts.viiveMs ?? 500;
  const hankkeet = await haeHankekunnat(supabase);
  const lahteet = await haeSeuratutLahteet(supabase);
  const puuttuvat = puuttuvatLahteet(hankkeet, lahteet);

  const { data: kunnat } = await supabase.from("kunnat").select("id, nimi").eq("voimassa", true);
  const idNimella = new Map((kunnat ?? []).map((k) => [k.nimi, k.id as string]));

  let rss = 0;
  let avoindata = 0;
  const eiLoydy: string[] = [];

  for (const k of puuttuvat.sort((a, b) => b.hankkeita - a.hankkeita)) {
    const kuntaId = k.kuntaId ?? idNimella.get(k.kunta);
    if (!kuntaId) {
      eiLoydy.push(k.kunta);
      continue;
    }

    const rssUrl = await etsiRss(k.kunta);
    await odota(viive);

    if (rssUrl) {
      rss += 1;
      console.log(`RSS ${k.kunta}: ${rssUrl}`);
      if (opts.kirjoita && !opts.kuiva) {
        await supabase.from("kunta_esityslista_lahteet").upsert(
          {
            kunta_id: kuntaId,
            jarjestelma: "rss",
            perus_url: rssUrl,
            seurannassa: true,
            huomautus: "Automaattikartoitus, kuntakartoitus.ts",
          },
          { onConflict: "kunta_id,jarjestelma" },
        );
      }
      continue;
    }

    const apiUrl = await etsiAvoindata(k.kunta);
    await odota(viive);

    if (apiUrl) {
      avoindata += 1;
      console.log(`Avoindata ${k.kunta}: ${apiUrl}`);
      if (opts.kirjoita && !opts.kuiva) {
        await supabase.from("kunta_esityslista_lahteet").upsert(
          {
            kunta_id: kuntaId,
            jarjestelma: "avoindata",
            perus_url: apiUrl,
            seurannassa: true,
            huomautus: "avoindata.fi CKAN, kuntakartoitus.ts",
          },
          { onConflict: "kunta_id,jarjestelma" },
        );
      }
      continue;
    }

    eiLoydy.push(k.kunta);
    console.log(`-- ${k.kunta}`);
  }

  console.log(`Kartoitus valmis: ${rss} RSS, ${avoindata} avoindata, ${eiLoydy.length} ei löydy.`);
  return { rss, avoindata, eiLoydy };
}
