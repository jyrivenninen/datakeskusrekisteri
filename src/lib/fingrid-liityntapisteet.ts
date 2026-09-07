/**
 * Fingrid-liityntäpisteet kartalle (Postgres / OSM Overpass). Ei Fingrid API -koordinaatteja.
 */

import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";

export type FingridLiityntapiste = {
  id: string;
  nimi: string;
  lat: number;
  lon: number;
  jannite: string | null;
  lahde_url: string;
};

export async function haeFingridLiityntapisteet(): Promise<FingridLiityntapiste[]> {
  if (!supabaseYmparistoAsetettu()) return [];
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("fingrid_liityntapisteet")
      .select("id, nimi, lat, lon, jannite, lahde_url")
      .order("nimi");
    if (error) return [];
    return (data ?? []).map((rivi) => ({
      id: rivi.id as string,
      nimi: rivi.nimi as string,
      lat: Number(rivi.lat),
      lon: Number(rivi.lon),
      jannite: (rivi.jannite as string | null) ?? null,
      lahde_url: rivi.lahde_url as string,
    }));
  } catch {
    return [];
  }
}
