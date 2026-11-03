/**
 * Päivittää 35 etusivu→Nominatim-lähderivän lainauksen sisältämään
 * OSM-kohteen tyypin, tunnisteen ja palautetut koordinaatit.
 *
 * Aja: npx tsx scripts/paivita-osm-tunniste-lainaukset.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://www.datakeskusrekisteri.fi/; geokoodaus-varmistus)";
const VIIVE_MS = 1100;

type Rivi = {
  lahde_id: string;
  nimi: string;
  lahde_url: string;
  lainaus: string;
  lat: number;
  lon: number;
};

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function osmTyyppi(osmType: string): "node" | "way" | "relation" {
  const t = osmType.toLowerCase();
  if (t === "n" || t === "node") return "node";
  if (t === "w" || t === "way") return "way";
  if (t === "r" || t === "relation") return "relation";
  throw new Error(`Tuntematon osm_type: ${osmType}`);
}

async function haeNominatim(hakuUrl: string): Promise<{
  osm_type: string;
  osm_id: number;
  lat: number;
  lon: number;
  display: string;
} | null> {
  const u = new URL(hakuUrl);
  u.searchParams.set("format", "json");
  if (!u.searchParams.has("limit")) u.searchParams.set("limit", "1");
  const vastaus = await fetch(u.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) throw new Error(`Nominatim HTTP ${vastaus.status}`);
  const data = (await vastaus.json()) as Array<{
    osm_type?: string;
    osm_id?: number;
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;
  const eka = data[0];
  if (!eka?.osm_type || eka.osm_id == null || !eka.lat || !eka.lon) return null;
  return {
    osm_type: osmTyyppi(eka.osm_type),
    osm_id: Number(eka.osm_id),
    lat: Number(eka.lat),
    lon: Number(eka.lon),
    display: eka.display_name ?? "",
  };
}

function rakennaLainaus(
  vanha: string,
  hit: { osm_type: string; osm_id: number; lat: number; lon: number; display: string },
): string {
  const tunniste = `OSM ${hit.osm_type}/${hit.osm_id} @ ${hit.lat.toFixed(6)}, ${hit.lon.toFixed(6)}`;
  // Poista aiempi tunniste-lohko jos uudelleenajetaan
  const pohja = vanha
    .replace(/\s*\[OSM (?:node|way|relation)\/\d+ @ [0-9.,\-\s]+\]\s*$/i, "")
    .trim();
  return `${pohja} [${tunniste}]`;
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: lahteet, error } = await sb
    .from("kentta_lahteet")
    .select("id, lahde_url, lainaus, rivi_id")
    .eq("taulu", "hankkeet")
    .eq("kentta", "sijainti")
    .eq("vahvistettu_pvm", "2026-10-12")
    .is("dokumentti_id", null)
    .like("lahde_url", "%nominatim.openstreetmap.org/search%");
  if (error) throw new Error(error.message);

  const riviIdt = [...new Set((lahteet ?? []).map((r) => r.rivi_id as string))];
  const { data: hankkeet, error: hVirhe } = await sb
    .from("hankkeet")
    .select("id, nimi, sijainti_lat, sijainti_lon")
    .in("id", riviIdt);
  if (hVirhe) throw new Error(hVirhe.message);
  const hankeKartta = new Map(
    (hankkeet ?? []).map((h) => [h.id as string, h]),
  );

  const rivit: Rivi[] = [];
  for (const r of lahteet ?? []) {
    const h = hankeKartta.get(r.rivi_id as string);
    if (!h) continue;
    rivit.push({
      lahde_id: r.id as string,
      nimi: h.nimi as string,
      lahde_url: r.lahde_url as string,
      lainaus: String(r.lainaus ?? ""),
      lat: Number(h.sijainti_lat),
      lon: Number(h.sijainti_lon),
    });
  }

  console.log(`Päivitettäviä lähderiväjä: ${rivit.length}`);
  let ok = 0;
  let ei = 0;
  for (let i = 0; i < rivit.length; i++) {
    const r = rivit[i]!;
    process.stdout.write(`[${i + 1}/${rivit.length}] ${r.nimi} … `);
    try {
      const hit = await haeNominatim(r.lahde_url);
      if (!hit) {
        console.log("ei osumaa");
        ei += 1;
      } else {
        const uusiLainaus = rakennaLainaus(r.lainaus, hit);
        const { error: pVirhe } = await sb.rpc("paivita_kentta_lahde_sisalto", {
          p_lahde_id: r.lahde_id,
          p_lainaus: uusiLainaus,
          p_tarkistettu: true,
        });
        if (pVirhe) {
          console.log(`virhe: ${pVirhe.message}`);
          ei += 1;
        } else {
          console.log(`${hit.osm_type}/${hit.osm_id} ${hit.lat.toFixed(5)},${hit.lon.toFixed(5)}`);
          ok += 1;
        }
      }
    } catch (err) {
      console.log(err instanceof Error ? err.message : String(err));
      ei += 1;
    }
    if (i < rivit.length - 1) await odota(VIIVE_MS);
  }
  console.log(`Valmis: ok ${ok}, ei ${ei}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
