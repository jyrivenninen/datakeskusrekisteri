/**
 * Uuden hankkeen tuonnin tuplatarkistus ennen luontia.
 * Varoitus, ei esto. Vahva osuma → ohjaa täydentämään, ei yhdistämään.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UusiHankeTuonti } from "@/lib/uusi-hanke-tuonti";

export type TuplaOsuma = {
  hanke_id: string;
  nimi: string;
  kunta: string;
  syyt: string[];
  /** Vahva: ohjaa täydentämään olemassa olevaa. */
  vahva: boolean;
  etaisyys_m?: number | null;
  kaavatunnus?: string | null;
  toimija_nimi?: string | null;
};

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function luku(arvo: string | undefined): number | null {
  if (!arvo?.trim()) return null;
  const n = Number(arvo.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function nimisanat(nimi: string): string[] {
  return [
    ...new Set(
      nimi
        .toLowerCase()
        .split(/[^a-z0-9äöå]+/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 3),
    ),
  ];
}

export async function haeUusiHankeTuplat(
  supabase: SupabaseClient,
  tuonti: UusiHankeTuonti,
): Promise<TuplaOsuma[]> {
  const osumat = new Map<string, TuplaOsuma>();

  const lisaa = (
    id: string,
    nimi: string,
    kunta: string,
    syy: string,
    vahva: boolean,
    ekstra?: Partial<TuplaOsuma>,
  ) => {
    const vanha = osumat.get(id);
    if (vanha) {
      if (!vanha.syyt.includes(syy)) vanha.syyt.push(syy);
      vanha.vahva = vanha.vahva || vahva;
      Object.assign(vanha, ekstra);
      return;
    }
    osumat.set(id, {
      hanke_id: id,
      nimi,
      kunta,
      syyt: [syy],
      vahva,
      ...ekstra,
    });
  };

  const kunta = tuonti.kunta.trim();
  const nimi = tuonti.nimi.trim();
  const kaavatunnus = tuonti.kentat.find((k) => k.kentta === "kaavatunnus")?.arvo?.trim();
  const kiinteistotunnus = tuonti.kentat
    .find((k) => k.kentta === "kiinteistotunnus")
    ?.arvo?.trim();
  const lat = luku(tuonti.kentat.find((k) => k.kentta === "sijainti_lat")?.arvo);
  const lon = luku(tuonti.kentat.find((k) => k.kentta === "sijainti_lon")?.arvo);
  const toimijaNimi =
    tuonti.toimija?.nimi?.trim() ||
    tuonti.kentat.find((k) => k.kentta === "toimija_nimi")?.arvo?.trim();

  // Nimi + kunta
  if (kunta && nimi) {
    const sanat = nimisanat(nimi);
    const { data, error } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, kaavatunnus, sijainti_lat, sijainti_lon, toimija_organisaatio_id")
      .eq("julkaistu", true)
      .is("yhdistetty_kohde_id", null)
      .ilike("kunta", kunta)
      .limit(40);
    if (error) throw new Error(error.message);
    for (const h of data ?? []) {
      const hn = String(h.nimi ?? "").toLowerCase();
      const exact =
        hn === nimi.toLowerCase() ||
        hn.includes(nimi.toLowerCase()) ||
        nimi.toLowerCase().includes(hn);
      const sanaOsuma =
        sanat.length > 0 && sanat.some((s) => hn.includes(s));
      if (exact) {
        lisaa(h.id, h.nimi, h.kunta, "sama nimi ja kunta", true, {
          kaavatunnus: h.kaavatunnus,
        });
      } else if (sanaOsuma) {
        lisaa(h.id, h.nimi, h.kunta, "samankaltainen nimi samassa kunnassa", false, {
          kaavatunnus: h.kaavatunnus,
        });
      }
    }
  }

  // Kaavatunnus
  if (kaavatunnus) {
    const { data, error } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, kaavatunnus")
      .eq("julkaistu", true)
      .is("yhdistetty_kohde_id", null)
      .ilike("kaavatunnus", kaavatunnus)
      .limit(10);
    if (error) throw new Error(error.message);
    for (const h of data ?? []) {
      lisaa(h.id, h.nimi, h.kunta, `sama kaavatunnus (${kaavatunnus})`, true, {
        kaavatunnus: h.kaavatunnus,
      });
    }
  }

  // Toimija (organisaation nimi)
  if (toimijaNimi) {
    const { data: orgit, error: orgVirhe } = await supabase
      .from("organisaatiot")
      .select("id, nimi")
      .eq("julkaistu", true)
      .ilike("nimi", toimijaNimi)
      .limit(5);
    if (orgVirhe) throw new Error(orgVirhe.message);
    const orgIdt = (orgit ?? []).map((o) => o.id);
    if (orgIdt.length > 0) {
      const { data, error } = await supabase
        .from("hankkeet")
        .select("id, nimi, kunta, toimija_organisaatio_id")
        .eq("julkaistu", true)
        .is("yhdistetty_kohde_id", null)
        .in("toimija_organisaatio_id", orgIdt)
        .limit(20);
      if (error) throw new Error(error.message);
      for (const h of data ?? []) {
        const samaKunta =
          kunta &&
          String(h.kunta ?? "").toLowerCase() === kunta.toLowerCase();
        lisaa(
          h.id,
          h.nimi,
          h.kunta,
          `sama toimija (${toimijaNimi})`,
          Boolean(samaKunta),
          { toimija_nimi: toimijaNimi },
        );
      }
    }
  }

  // Sijainti alle 1 km
  if (lat != null && lon != null) {
    const { data, error } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, sijainti_lat, sijainti_lon")
      .eq("julkaistu", true)
      .is("yhdistetty_kohde_id", null)
      .not("sijainti_lat", "is", null)
      .not("sijainti_lon", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);
    for (const h of data ?? []) {
      const hLat = Number(h.sijainti_lat);
      const hLon = Number(h.sijainti_lon);
      if (!Number.isFinite(hLat) || !Number.isFinite(hLon)) continue;
      const m = haversineM(lat, lon, hLat, hLon);
      if (m < 1000) {
        lisaa(
          h.id,
          h.nimi,
          h.kunta,
          `sijainti alle 1 km (${Math.round(m)} m)`,
          false,
          { etaisyys_m: Math.round(m) },
        );
      }
    }
  }

  // Kiinteistötunnus: etsi kentta_lahteet / huomautus / dokumentit — praktisesti
  // haetaan hankkeista joiden huomautus tai mml-ehdotukset mainitsevat tunnuksen.
  // Jos taulussa ei ole saraketta, haetaan huomautuksesta.
  if (kiinteistotunnus) {
    const { data, error } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, huomautus")
      .eq("julkaistu", true)
      .is("yhdistetty_kohde_id", null)
      .ilike("huomautus", `%${kiinteistotunnus}%`)
      .limit(10);
    if (error) throw new Error(error.message);
    for (const h of data ?? []) {
      lisaa(
        h.id,
        h.nimi,
        h.kunta,
        `kiinteistötunnus mainittu huomautuksessa (${kiinteistotunnus})`,
        true,
      );
    }
  }

  return [...osumat.values()].sort((a, b) => {
    if (a.vahva !== b.vahva) return a.vahva ? -1 : 1;
    return a.nimi.localeCompare(b.nimi, "fi");
  });
}
