/**
 * Fingrid-liityntäpisteet kartalle — OSM Overpass (≥110 kV). Ei Fingrid API -sijaintidataa.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: FINGRID_LIITYNTPISTEET_KUIVA=1, FINGRID_LIITYNTPISTEET_VIIVE_MS (2000)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; fingrid-liityntapisteet)";
const SOVITIN = "fingrid-liityntapisteet";
const OVERPASS = "https://overpass-api.de/api/interpreter";

/** Manner-Suomi ja Ahvenanmaa — alueet Overpass-kyselyille. */
const ALUEET: { nimi: string; bbox: [number, number, number, number] }[] = [
  { nimi: "etela", bbox: [59.5, 19.0, 61.5, 26.5] },
  { nimi: "lansi", bbox: [60.5, 21.0, 63.5, 24.5] },
  { nimi: "keski", bbox: [61.0, 24.0, 64.5, 28.5] },
  { nimi: "ita", bbox: [61.5, 27.0, 65.0, 31.0] },
  { nimi: "pohjoinen", bbox: [64.0, 19.0, 70.5, 29.0] },
  { nimi: "ahvenanmaa", bbox: [59.7, 19.0, 60.8, 21.5] },
];

type TietokantaAsiakas = SupabaseClient;

type OsmElementti = {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function viiveMs(): number {
  const n = Number(process.env.FINGRID_LIITYNTPISTEET_VIIVE_MS ?? "2000");
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function onKantaverkko(jannite: string | undefined): boolean {
  if (!jannite) return false;
  for (const osa of jannite.split(";")) {
    const n = Number(osa.trim());
    if (Number.isFinite(n) && n >= 110_000) return true;
  }
  return false;
}

function overpassKysely(bbox: [number, number, number, number]): string {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  return `[out:json][timeout:90];(node["power"="substation"]["name"](${minLat},${minLon},${maxLat},${maxLon});way["power"="substation"]["name"](${minLat},${minLon},${maxLat},${maxLon}););out center 500;`;
}

async function haeAlue(bbox: [number, number, number, number]): Promise<OsmElementti[]> {
  const vastaus = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `data=${encodeURIComponent(overpassKysely(bbox))}`,
    signal: AbortSignal.timeout(120_000),
  });
  if (!vastaus.ok) {
    throw new Error(`Overpass HTTP ${vastaus.status}`);
  }
  const runko = (await vastaus.json()) as { elements?: OsmElementti[] };
  return runko.elements ?? [];
}

function elementtiRiviksi(el: OsmElementti): {
  osm_id: number;
  osm_tyyppi: "node" | "way";
  nimi: string;
  lat: number;
  lon: number;
  jannite: string | null;
  lahde_url: string;
} | null {
  const nimi = el.tags?.name?.trim();
  if (!nimi || !onKantaverkko(el.tags?.voltage)) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    osm_id: el.id,
    osm_tyyppi: el.type,
    nimi,
    lat,
    lon,
    jannite: el.tags?.voltage ?? null,
    lahde_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan.");
  }
  const kuiva = process.env.FINGRID_LIITYNTPISTEET_KUIVA === "1";
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
        kysely_url: OVERPASS,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const nahdyt = new Set<string>();
  let osumia = 0;
  let kirjattu = 0;
  let httpTila: number | null = 200;

  try {
    for (const alue of ALUEET) {
      let elementit: OsmElementti[];
      try {
        elementit = await haeAlue(alue.bbox);
      } catch (syy) {
        const viesti = syy instanceof Error ? syy.message : "Overpass epäonnistui";
        console.error(`${alue.nimi}: ${viesti}`);
        continue;
      }
      console.log(`${alue.nimi}: ${elementit.length} OSM-kohdetta`);
      await odota(viiveMs());

      for (const el of elementit) {
        const rivi = elementtiRiviksi(el);
        if (!rivi) continue;
        const avainAvain = `${rivi.osm_tyyppi}:${rivi.osm_id}`;
        if (nahdyt.has(avainAvain)) continue;
        nahdyt.add(avainAvain);
        osumia += 1;

        if (kuiva) {
          console.log(`kuiva: ${rivi.nimi} (${rivi.jannite})`);
          kirjattu += 1;
          continue;
        }

        const { error } = await supabase.from("fingrid_liityntapisteet").upsert(
          {
            osm_id: rivi.osm_id,
            osm_tyyppi: rivi.osm_tyyppi,
            nimi: rivi.nimi,
            lat: rivi.lat,
            lon: rivi.lon,
            jannite: rivi.jannite,
            lahde_url: rivi.lahde_url,
            luottamus: "epavarma",
            vahvistettu_pvm: new Date().toISOString().slice(0, 10),
            paivitetty_pvm: new Date().toISOString(),
          },
          { onConflict: "osm_id,osm_tyyppi" },
        );
        if (error) throw new Error(error.message);
        kirjattu += 1;
      }
    }

    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia: kirjattu,
        })
        .eq("id", ajoId);
    }
    console.log(
      `Valmis. ${osumia} kantaverkkoasemaa, ${kirjattu} tallennettu${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Fingrid-liityntäpisteet epäonnistui.";
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
