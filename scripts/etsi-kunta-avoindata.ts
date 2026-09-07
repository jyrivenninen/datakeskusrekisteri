/**
 * Kartoittaa avoindata.fi-aineistoja hankekunnille (7A.5.8 / 7A.6 kohta 2).
 * Etsii CKAN-package_search -rajapinnasta JSON/API-resursseja päätösdataan.
 *
 * KUNTA_AVOINDATA_KIRJOITA=1 kirjoittaa löydetyt lähteet tietokantaan.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const CKAN_HAKU = "https://avoindata.fi/data/api/3/action/package_search";
const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; avoindata-etsi)";

const HAKUSANAT = [
  "päätökset kokoukset",
  "päätöksenteon asiakirjat",
  "kokoukset ja päätökset",
  "esityslista",
];

type CkanResurssi = {
  format?: string;
  url?: string;
  name?: string;
  mimetype?: string;
};

type CkanPaketti = {
  name?: string;
  title?: string;
  organization?: { title?: string; name?: string };
  resources?: CkanResurssi[];
};

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

function onJsonResurssi(r: CkanResurssi): boolean {
  const formaatti = (r.format ?? "").toUpperCase();
  const mime = (r.mimetype ?? "").toLowerCase();
  const url = (r.url ?? "").toLowerCase();
  if (formaatti === "JSON" || formaatti === "API") return Boolean(r.url);
  if (mime.includes("json")) return Boolean(r.url);
  if (url.includes("/api/") && url.startsWith("http")) return true;
  return false;
}

function sopiiKunnalle(paketti: CkanPaketti, kuntaNimi: string): boolean {
  const org = paketti.organization?.title ?? paketti.organization?.name ?? "";
  const otsikko = paketti.title ?? "";
  const yhdistelma = `${org} ${otsikko}`.toLowerCase();
  const slug = normalisoi(kuntaNimi);
  if (normalisoi(org) === slug) return true;
  if (yhdistelma.includes(slug)) return true;
  const ilmanKaupunki = slug.replace(/ kaupunki$/, "").replace(/ kunta$/, "");
  return yhdistelma.includes(ilmanKaupunki);
}

async function haePaketit(kysely: string): Promise<CkanPaketti[]> {
  const u = new URL(CKAN_HAKU);
  u.searchParams.set("q", kysely);
  u.searchParams.set("rows", "20");
  const vastaus = await fetch(u, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) return [];
  const runko = (await vastaus.json()) as {
    success?: boolean;
    result?: { results?: CkanPaketti[] };
  };
  return runko.result?.results ?? [];
}

async function testaaJson(url: string): Promise<boolean> {
  try {
    const vastaus = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    });
    if (!vastaus.ok) return false;
    const teksti = (await vastaus.text()).trim();
    if (!teksti.startsWith("[") && !teksti.startsWith("{")) return false;
    JSON.parse(teksti);
    return true;
  } catch {
    return false;
  }
}

async function etsiKunnalle(nimi: string): Promise<string | null> {
  const naytetty = new Set<string>();
  for (const sana of HAKUSANAT) {
    const kysely = `${nimi} ${sana}`;
    const paketit = await haePaketit(kysely);
    for (const paketti of paketit) {
      if (!sopiiKunnalle(paketti, nimi)) continue;
      for (const resurssi of paketti.resources ?? []) {
        if (!onJsonResurssi(resurssi) || !resurssi.url) continue;
        if (naytetty.has(resurssi.url)) continue;
        naytetty.add(resurssi.url);
        if (await testaaJson(resurssi.url)) {
          return resurssi.url;
        }
      }
    }
  }
  return null;
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error("Supabase-ympäristömuuttujat puuttuvat.");
  }
  const kirjoita = process.env.KUNTA_AVOINDATA_KIRJOITA === "1";
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: h } = await sb
    .from("hankkeet")
    .select("kunta")
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null);
  const { data: lahteet } = await sb
    .from("kunta_esityslista_lahteet")
    .select("kunnat(nimi)")
    .eq("seurannassa", true);
  const konfig = new Set(
    (lahteet ?? [])
      .map((l) => {
        const kunta = Array.isArray(l.kunnat) ? l.kunnat[0] : l.kunnat;
        return kunta?.nimi;
      })
      .filter((n): n is string => Boolean(n)),
  );

  const puuttuvat = [
    ...new Set(
      (h ?? [])
        .map((r) => r.kunta?.trim())
        .filter((k): k is string => Boolean(k && !konfig.has(k))),
    ),
  ].sort();

  const loytyi: { nimi: string; url: string }[] = [];
  const eiLoydy: string[] = [];

  for (const nimi of puuttuvat) {
    const apiUrl = await etsiKunnalle(nimi);
    if (apiUrl) {
      loytyi.push({ nimi, url: apiUrl });
      console.log(`OK ${nimi}: ${apiUrl}`);
    } else {
      eiLoydy.push(nimi);
      console.log(`-- ${nimi}`);
    }
  }

  console.log(`\nYhteensä ${loytyi.length}/${puuttuvat.length}`);
  if (eiLoydy.length > 0) {
    console.log("Ei API:a:", eiLoydy.join(", "));
  }

  if (kirjoita && loytyi.length > 0) {
    const nimet = loytyi.map((r) => r.nimi);
    const { data: kunnat } = await sb.from("kunnat").select("id, nimi").in("nimi", nimet);
    const idNimella = new Map((kunnat ?? []).map((k) => [k.nimi, k.id as string]));
    for (const r of loytyi) {
      const kuntaId = idNimella.get(r.nimi);
      if (!kuntaId) {
        console.warn(`Ohitettu ${r.nimi}: ei kunnat-riviä.`);
        continue;
      }
      const { error } = await sb.from("kunta_esityslista_lahteet").upsert(
        {
          kunta_id: kuntaId,
          jarjestelma: "avoindata",
          perus_url: r.url,
          seurannassa: true,
          huomautus: "avoindata.fi CKAN, etsi-kunta-avoindata.ts",
        },
        { onConflict: "kunta_id,jarjestelma" },
      );
      if (error) throw new Error(`${r.nimi}: ${error.message}`);
      console.log(`Kirjoitettu ${r.nimi}`);
    }
  }
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
