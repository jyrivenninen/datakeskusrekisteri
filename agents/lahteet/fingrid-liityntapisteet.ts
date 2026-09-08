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

/** Manner-Suomi + Ahvenanmaa — pienet, päällekkäisetön ruudut (Overpass 504 -riski). */
const RUUDUT = {
  minLat: 59.5,
  maxLat: 70.5,
  minLon: 19.0,
  maxLon: 31.5,
  rivit: 6,
  sarakkeet: 5,
} as const;

const UUDELLEENYRITYKSET = 3;
const UUDELLEEN_VIIVE_MS = [5_000, 15_000, 30_000] as const;
const JAKO_SYVYYS_MAX = 2;
const RATE_LIMIT_VIIVE_MS = 60_000;

type Laatta = { nimi: string; bbox: [number, number, number, number] };

function luoRuudut(): Laatta[] {
  const { minLat, maxLat, minLon, maxLon, rivit, sarakkeet } = RUUDUT;
  const latAskel = (maxLat - minLat) / rivit;
  const lonAskel = (maxLon - minLon) / sarakkeet;
  const laatat: Laatta[] = [];
  for (let r = 0; r < rivit; r += 1) {
    for (let c = 0; c < sarakkeet; c += 1) {
      laatat.push({
        nimi: `r${r}c${c}`,
        bbox: [
          minLat + r * latAskel,
          minLon + c * lonAskel,
          minLat + (r + 1) * latAskel,
          minLon + (c + 1) * lonAskel,
        ],
      });
    }
  }
  return laatat;
}

function jaaLaatta(laatta: Laatta): Laatta[] {
  const [minLat, minLon, maxLat, maxLon] = laatta.bbox;
  const keskiLat = (minLat + maxLat) / 2;
  const keskiLon = (minLon + maxLon) / 2;
  const osat: [number, number, number, number][] = [
    [minLat, minLon, keskiLat, keskiLon],
    [minLat, keskiLon, keskiLat, maxLon],
    [keskiLat, minLon, maxLat, keskiLon],
    [keskiLat, keskiLon, maxLat, maxLon],
  ];
  return osat.map((bbox, i) => ({ nimi: `${laatta.nimi}_${i}`, bbox }));
}

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
  return `[out:json][timeout:45];(node["power"="substation"]["name"](${minLat},${minLon},${maxLat},${maxLon});way["power"="substation"]["name"](${minLat},${minLon},${maxLat},${maxLon}););out center 500;`;
}

function onUudelleenYritysKelpaava(virhe: unknown): boolean {
  const viesti = virhe instanceof Error ? virhe.message : String(virhe);
  return /HTTP (429|502|503|504)|fetch failed|timeout|aborted|ETIMEDOUT|ECONNRESET/i.test(
    viesti,
  );
}

async function haeLaattaKerran(bbox: [number, number, number, number]): Promise<OsmElementti[]> {
  const vastaus = await fetch(OVERPASS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `data=${encodeURIComponent(overpassKysely(bbox))}`,
    signal: AbortSignal.timeout(90_000),
  });
  if (!vastaus.ok) {
    throw new Error(`Overpass HTTP ${vastaus.status}`);
  }
  const runko = (await vastaus.json()) as { elements?: OsmElementti[] };
  return runko.elements ?? [];
}

async function haeLaattaUudelleen(
  laatta: Laatta,
): Promise<{ elementit: OsmElementti[]; rateLimit: boolean }> {
  let rateLimit = false;
  for (let yritys = 0; yritys < UUDELLEENYRITYKSET; yritys += 1) {
    try {
      const elementit = await haeLaattaKerran(laatta.bbox);
      return { elementit, rateLimit };
    } catch (virhe) {
      const viesti = virhe instanceof Error ? virhe.message : "Overpass epäonnistui";
      if (/HTTP 429/.test(viesti)) rateLimit = true;
      if (!onUudelleenYritysKelpaava(virhe) || yritys === UUDELLEENYRITYKSET - 1) {
        throw virhe;
      }
      const odotus = UUDELLEEN_VIIVE_MS[yritys] ?? 30_000;
      console.warn(
        `${laatta.nimi}: ${viesti}, uudelleen ${yritys + 2}/${UUDELLEENYRITYKSET} (${odotus} ms)...`,
      );
      await odota(odotus);
    }
  }
  return { elementit: [], rateLimit };
}

async function haeLaatta(
  laatta: Laatta,
  syvyys = 0,
): Promise<{ elementit: OsmElementti[]; epaonnistui: boolean; rateLimit: boolean }> {
  try {
    const { elementit, rateLimit } = await haeLaattaUudelleen(laatta);
    return { elementit, epaonnistui: false, rateLimit };
  } catch (virhe) {
    if (syvyys >= JAKO_SYVYYS_MAX) {
      const viesti = virhe instanceof Error ? virhe.message : "Overpass epäonnistui";
      console.error(`${laatta.nimi}: ${viesti} (jaon syvyys ${syvyys} täynnä)`);
      return {
        elementit: [],
        epaonnistui: true,
        rateLimit: /HTTP 429|fetch failed/i.test(viesti),
      };
    }
    const viesti = virhe instanceof Error ? virhe.message : "Overpass epäonnistui";
    console.warn(`${laatta.nimi}: ${viesti} — jaetaan neljään osaan (syvyys ${syvyys + 1})`);
    const osat = jaaLaatta(laatta);
    const elementit: OsmElementti[] = [];
    let epaonnistui = false;
    let rateLimit = false;
    for (const osa of osat) {
      await odota(viiveMs());
      const tulos = await haeLaatta(osa, syvyys + 1);
      elementit.push(...tulos.elementit);
      epaonnistui = epaonnistui || tulos.epaonnistui;
      rateLimit = rateLimit || tulos.rateLimit;
    }
    return { elementit, epaonnistui, rateLimit };
  }
}

async function kasitteleLaatta(
  laatta: Laatta,
  nahdyt: Set<string>,
  kuiva: boolean,
  supabase: TietokantaAsiakas,
): Promise<{ osumia: number; kirjattu: number; epaonnistui: boolean; rateLimit: boolean }> {
  const { elementit, epaonnistui, rateLimit } = await haeLaatta(laatta);
  console.log(`${laatta.nimi}: ${elementit.length} OSM-kohdetta`);
  let osumia = 0;
  let kirjattu = 0;
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
  return { osumia, kirjattu, epaonnistui, rateLimit };
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
  const epaonnistuneetLaatat: Laatta[] = [];
  const laatat = luoRuudut();

  try {
    for (const laatta of laatat) {
      const tulos = await kasitteleLaatta(laatta, nahdyt, kuiva, supabase);
      osumia += tulos.osumia;
      kirjattu += tulos.kirjattu;
      if (tulos.epaonnistui) {
        epaonnistuneetLaatat.push(laatta);
        httpTila = 504;
      }
      if (tulos.rateLimit) {
        console.warn(`${laatta.nimi}: rate limit — odotetaan ${RATE_LIMIT_VIIVE_MS} ms`);
        await odota(RATE_LIMIT_VIIVE_MS);
      } else {
        await odota(viiveMs());
      }
    }

    if (epaonnistuneetLaatat.length > 0) {
      console.warn(
        `\nToinen yritys ${epaonnistuneetLaatat.length} epäonnistuneelle ruudulle...\n`,
      );
      await odota(RATE_LIMIT_VIIVE_MS);
      const uudelleen = [...epaonnistuneetLaatat];
      epaonnistuneetLaatat.length = 0;
      for (const laatta of uudelleen) {
        const tulos = await kasitteleLaatta(laatta, nahdyt, kuiva, supabase);
        osumia += tulos.osumia;
        kirjattu += tulos.kirjattu;
        if (tulos.epaonnistui) {
          epaonnistuneetLaatat.push(laatta);
          httpTila = 504;
        }
        await odota(viiveMs() + (tulos.rateLimit ? RATE_LIMIT_VIIVE_MS : 0));
      }
    }

    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: epaonnistuneetLaatat.length > 0 ? "epaonnistui" : "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia: kirjattu,
          virhe:
            epaonnistuneetLaatat.length > 0
              ? `Osittainen: ${epaonnistuneetLaatat.length} ruutua epäonnistui (${epaonnistuneetLaatat.map((l) => l.nimi).join(", ")}).`.slice(
                  0,
                  500,
                )
              : null,
        })
        .eq("id", ajoId);
    }
    console.log(
      `Valmis. ${osumia} kantaverkkoasemaa, ${kirjattu} tallennettu${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
    if (epaonnistuneetLaatat.length > 0) {
      console.error(
        `Varoitus: ${epaonnistuneetLaatat.length}/${laatat.length} ruutua epäonnistui: ${epaonnistuneetLaatat.map((l) => l.nimi).join(", ")}`,
      );
      process.exitCode = 1;
    }
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
