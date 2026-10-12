/**
 * Arvio-pisteet, joiden sijaintilähde on kunnan etusivu mutta lainaus
 * viittaa OSM/MML-hakuun.
 *
 * 1) Parsii hakusanan lainauksesta (paikkataso, ei pelkkä kunta)
 * 2) Hakee Nominatim/MML:llä (1 req/s, User-Agent) ja vertaa tallennettuun
 * 3) Alle 1 km: päivittää lähderivin menetelmä-URL:ksi (ei poista etusivu-dok)
 *
 * Aja:
 *   npx tsx scripts/kuiva-arvio-etusivu-menetelma.ts           # vain raportti
 *   npx tsx scripts/kuiva-arvio-etusivu-menetelma.ts --kirjoita  # päivitä täsmäävät
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; geokoodaus-varmistus)";
const VIIVE_MS = 1100;
const MAX_KM = 1;

type Rivi = {
  hanke_id: string;
  nimi: string;
  kunta: string;
  lat: number;
  lon: number;
  kentta: string;
  lahde_id: string;
  lahde_url: string;
  lainaus: string;
  dokumentti_id: string | null;
};

function mmlHakuUrl(teksti: string): string {
  const u = new URL(
    "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search",
  );
  u.searchParams.set("text", teksti);
  u.searchParams.set("lang", "fi");
  u.searchParams.set("size", "5");
  return u.toString();
}

function nominatimHakuUrl(q: string): string {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", q);
  return u.toString();
}

function normalisoi(s: string): string {
  return s.trim().toLocaleLowerCase("fi");
}

/**
 * Hakusana lainauksesta. Paikkatasolla esim. «Hallamäki, Joroinen»,
 * ei pelkkä kunta.
 */
export function ehdotaHakuUrl(
  lainaus: string,
  kunta?: string,
): {
  palvelu: "nominatim" | "mml";
  hakusana: string;
  uusi_url: string;
} | null {
  const mml =
    lainaus.match(/→\s*MML\s*\(([^)]+)\)/i) ||
    lainaus.match(/→\s*MML:\s*([^.(]+)/i);
  if (mml?.[1]) {
    const hakusana = mml[1].trim();
    return { palvelu: "mml", hakusana, uusi_url: mmlHakuUrl(hakusana) };
  }

  const osmSuluissa = lainaus.match(/→\s*OSM\s*\(([^)]+)\)/i);
  if (osmSuluissa?.[1]) {
    const hakusana = osmSuluissa[1].trim();
    return {
      palvelu: "nominatim",
      hakusana,
      uusi_url: nominatimHakuUrl(hakusana),
    };
  }

  // «Paikka, Kunta → OSM: …» — kysely on vasen puoli, ei kunnan nimi yksin.
  const vasen = lainaus.match(
    /^(.{2,80}?)\s*→\s*OSM\s*:/i,
  );
  if (vasen?.[1]) {
    let hakusana = vasen[1].trim();
    // Poista hankkeenimi-etuliite «Nimi: » jos tippuu «kunta →» -muotoon
    hakusana = hakusana.replace(/^.*?:\s*/, "").trim();
    hakusana = hakusana.replace(/\s*kunta\s*$/i, "").trim();
    if (hakusana.length >= 2) {
      return {
        palvelu: "nominatim",
        hakusana,
        uusi_url: nominatimHakuUrl(hakusana),
      };
    }
  }

  const osmIlman = lainaus.match(
    /→\s*OSM:\s*([^.\n(]+?)(?:\s*\(|\s*\d+\.\d+|$)/i,
  );
  if (osmIlman?.[1]) {
    const osat = osmIlman[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Enintään paikka + kunta (älä ota koko osoiteketjua)
    const hakusana =
      osat.length >= 2
        ? `${osat[0]}, ${osat[1]}`
        : (osat[0] ?? "").replace(/,\s*$/, "");
    if (hakusana.length >= 2) {
      return {
        palvelu: "nominatim",
        hakusana,
        uusi_url: nominatimHakuUrl(hakusana),
      };
    }
  }

  if (/Nominatim/i.test(lainaus)) {
    const m = lainaus.match(/Nominatim\s+([^:]+):\s*([\d.]+)/i);
    if (m?.[1]) {
      const hakusana = m[1].trim();
      return {
        palvelu: "nominatim",
        hakusana,
        uusi_url: nominatimHakuUrl(hakusana),
      };
    }
  }

  void kunta;
  return null;
}

/** Paikkataso = kyselyssä muu kuin kunta (+ mahdollinen «Suomi»). */
export function onPaikkataso(hakusana: string, kunta: string): boolean {
  const osat = hakusana.split(",").map((s) => s.trim()).filter(Boolean);
  const nk = normalisoi(kunta);
  if (osat.length === 0) return false;
  if (osat.length === 1) return normalisoi(osat[0]!) !== nk;
  const toinen = normalisoi(osat[1]!);
  if (toinen === "suomi" || toinen === "finland") {
    return normalisoi(osat[0]!) !== nk;
  }
  return normalisoi(osat[0]!) !== nk;
}

function onKunnanEtusivu(url: string): boolean {
  return (
    /^https?:\/\/(www\.)?[^/]+\.fi\/?$/i.test(url) &&
    !/geocoding|\/pelias\/|nominatim/i.test(url)
  );
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function haeNominatim(
  hakusana: string,
): Promise<{ lat: number; lon: number; display: string } | null> {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", hakusana);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "1");
  const vastaus = await fetch(u.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) {
    throw new Error(`Nominatim HTTP ${vastaus.status} «${hakusana}»`);
  }
  const data = (await vastaus.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;
  const eka = data[0];
  if (!eka?.lat || !eka?.lon) return null;
  return {
    lat: Number(eka.lat),
    lon: Number(eka.lon),
    display: eka.display_name ?? "",
  };
}

async function haeMml(
  hakusana: string,
): Promise<{ lat: number; lon: number; display: string } | null> {
  const avain =
    process.env.MML_API_AVAIN?.trim() ||
    process.env.NEXT_PUBLIC_MML_API_AVAIN?.trim() ||
    "";
  if (!avain) throw new Error("MML_API_AVAIN puuttuu MML-hakua varten.");
  const u = new URL(
    "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search",
  );
  u.searchParams.set("text", hakusana);
  u.searchParams.set("lang", "fi");
  u.searchParams.set("size", "1");
  const vastaus = await fetch(u.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${avain}:`, "utf8").toString("base64")}`,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) throw new Error(`MML HTTP ${vastaus.status}`);
  const sivu = (await vastaus.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: { label?: string };
    }>;
  };
  const f = sivu.features?.[0];
  const coords = f?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return {
    lon: Number(coords[0]),
    lat: Number(coords[1]),
    display: f?.properties?.label ?? "",
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const kirjoita = process.argv.includes("--kirjoita");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: hankkeet, error: hVirhe } = await sb
    .from("hankkeet")
    .select("id, nimi, kunta, sijainti_lat, sijainti_lon")
    .eq("julkaistu", true)
    .eq("sijainti_alue_tyyppi", "arvio")
    .not("sijainti_lat", "is", null);
  if (hVirhe) throw new Error(hVirhe.message);

  const hankeKartta = new Map(
    (hankkeet ?? []).map((h) => [
      h.id as string,
      {
        id: h.id as string,
        nimi: h.nimi as string,
        kunta: h.kunta as string,
        lat: Number(h.sijainti_lat),
        lon: Number(h.sijainti_lon),
      },
    ]),
  );
  const idt = [...hankeKartta.keys()];
  const ehdokkaat: Rivi[] = [];
  const erakoko = 100;
  for (let i = 0; i < idt.length; i += erakoko) {
    const era = idt.slice(i, i + erakoko);
    const { data: lahteet, error: lVirhe } = await sb
      .from("kentta_lahteet")
      .select("id, kentta, lahde_url, lainaus, dokumentti_id, rivi_id")
      .eq("taulu", "hankkeet")
      .in("rivi_id", era)
      .in("kentta", ["sijainti", "sijainti_lat", "sijainti_lon"]);
    if (lVirhe) throw new Error(lVirhe.message);
    for (const r of lahteet ?? []) {
      const h = hankeKartta.get(r.rivi_id as string);
      if (!h) continue;
      const url = String(r.lahde_url ?? "");
      if (!onKunnanEtusivu(url)) continue;
      if (!/→\s*OSM|Nominatim|→\s*MML/i.test(String(r.lainaus ?? ""))) continue;
      ehdokkaat.push({
        hanke_id: h.id,
        nimi: h.nimi,
        kunta: h.kunta,
        lat: h.lat,
        lon: h.lon,
        kentta: r.kentta,
        lahde_id: r.id,
        lahde_url: url,
        lainaus: String(r.lainaus ?? ""),
        dokumentti_id: r.dokumentti_id,
      });
    }
  }

  const perHanke = new Map<string, Rivi>();
  for (const e of ehdokkaat) {
    const aiempi = perHanke.get(e.hanke_id);
    if (!aiempi) {
      perHanke.set(e.hanke_id, e);
      continue;
    }
    const prio = (k: string) =>
      k === "sijainti_lat" || k === "sijainti_lon" ? 0 : 1;
    if (prio(e.kentta) < prio(aiempi.kentta)) perHanke.set(e.hanke_id, e);
  }

  type Ehdotus = {
    rivi: Rivi;
    hakusana: string;
    palvelu: "nominatim" | "mml";
    uusi_url: string;
    paikkataso: boolean;
  };

  const ehdotukset: Ehdotus[] = [];
  const eiParsittu: Rivi[] = [];
  for (const e of perHanke.values()) {
    const h = ehdotaHakuUrl(e.lainaus, e.kunta);
    if (!h) {
      eiParsittu.push(e);
      continue;
    }
    ehdotukset.push({
      rivi: e,
      hakusana: h.hakusana,
      palvelu: h.palvelu,
      uusi_url: h.uusi_url,
      paikkataso: onPaikkataso(h.hakusana, e.kunta),
    });
  }

  const paikka = ehdotukset.filter((e) => e.paikkataso);
  const kunta = ehdotukset.filter((e) => !e.paikkataso);

  console.log("=== Arvio-etusivu → menetelmä (varmistus) ===");
  console.log(`Hankkeita hakuviittauksella: ${perHanke.size}`);
  console.log(`Parsittavia: ${ehdotukset.length} (paikkataso ${paikka.length}, kuntataso ${kunta.length})`);
  console.log(`Ei parsittu: ${eiParsittu.length}`);
  console.log(`Tila: ${kirjoita ? "KIRJOITA täsmäävät" : "vain raportti (lisää --kirjoita)"}`);
  console.log("");
  console.log("--- Esimerkkejä paikkataso ---");
  for (const e of paikka.slice(0, 3)) {
    console.log(`• ${e.rivi.nimi} (${e.rivi.kunta})`);
    console.log(`  hakusana: «${e.hakusana}»`);
    console.log(`  vanha: ${e.rivi.lahde_url}`);
    console.log(`  uusi:  ${e.uusi_url}`);
  }
  console.log("");
  console.log("--- Esimerkkejä kuntataso ---");
  for (const e of kunta.slice(0, 3)) {
    console.log(`• ${e.rivi.nimi} (${e.rivi.kunta})`);
    console.log(`  hakusana: «${e.hakusana}»`);
    console.log(`  vanha: ${e.rivi.lahde_url}`);
    console.log(`  uusi:  ${e.uusi_url}`);
  }

  const tasmat: Array<Ehdotus & { km: number; haettu: string }> = [];
  const eiTasmat: Array<
    Ehdotus & { km: number | null; haettu: string | null; syy: string }
  > = [];

  console.log("");
  console.log(`--- Hakuvertailu (max ${MAX_KM} km, ${VIIVE_MS} ms välein) ---`);
  for (let i = 0; i < ehdotukset.length; i++) {
    const e = ehdotukset[i]!;
    process.stdout.write(`[${i + 1}/${ehdotukset.length}] ${e.hakusana} … `);
    try {
      const tulos =
        e.palvelu === "mml"
          ? await haeMml(e.hakusana)
          : await haeNominatim(e.hakusana);
      if (!tulos) {
        console.log("ei osumaa");
        eiTasmat.push({
          ...e,
          km: null,
          haettu: null,
          syy: "ei osumaa",
        });
      } else {
        const km = haversineKm(e.rivi.lat, e.rivi.lon, tulos.lat, tulos.lon);
        if (km < MAX_KM) {
          console.log(`OK ${km.toFixed(3)} km`);
          tasmat.push({ ...e, km, haettu: tulos.display });
        } else {
          console.log(`EI ${km.toFixed(3)} km → ${tulos.display.slice(0, 60)}`);
          eiTasmat.push({
            ...e,
            km,
            haettu: tulos.display,
            syy: `etäisyys ${km.toFixed(3)} km`,
          });
        }
      }
    } catch (err) {
      const syy = err instanceof Error ? err.message : String(err);
      console.log(`virhe: ${syy}`);
      eiTasmat.push({ ...e, km: null, haettu: null, syy });
    }
    if (i < ehdotukset.length - 1) await odota(VIIVE_MS);
  }

  console.log("");
  console.log(`Täsmäsi (< ${MAX_KM} km): ${tasmat.length}`);
  console.log(`Ei täsmännyt: ${eiTasmat.length}`);
  if (eiTasmat.length > 0) {
    console.log("--- Ei-täsmäävät (esimerkit) ---");
    for (const e of eiTasmat.slice(0, 8)) {
      console.log(
        `• ${e.rivi.nimi}: «${e.hakusana}» — ${e.syy}` +
          (e.km != null ? ` (tallennettu ${e.rivi.lat},${e.rivi.lon})` : ""),
      );
      if (e.haettu) console.log(`  haku palautti: ${e.haettu.slice(0, 100)}`);
    }
  }

  if (kirjoita && tasmat.length > 0) {
    console.log("");
    console.log(`--- Kirjoitus: ${tasmat.length} lähderivää ---`);
    let ok = 0;
    for (const e of tasmat) {
      const { error } = await sb.rpc("siirra_kentta_lahde_menetelma_hakuun", {
        p_lahde_id: e.rivi.lahde_id,
        p_uusi_url: e.uusi_url,
        p_otsikko: `Geokoodaushaku: ${e.hakusana}`,
      });
      if (error) {
        console.log(`✗ ${e.rivi.nimi}: ${error.message}`);
      } else {
        ok += 1;
        console.log(`✓ ${e.rivi.nimi} → ${e.uusi_url}`);
      }
    }
    console.log(`Päivitetty: ${ok}/${tasmat.length}`);
  } else if (!kirjoita) {
    console.log("");
    console.log(
      `Kuiva-ajo: ${tasmat.length} riviä olisi päivitetty. Aja --kirjoita kun hyväksyt.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
