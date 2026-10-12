/**
 * Kuiva-ajo: arvio-pisteet, joiden sijaintilähde on kunnan etusivu mutta
 * lainaus viittaa OSM/MML-hakuun → ehdota menetelma-URL (Nominatim / MML).
 *
 * Aja: npx tsx scripts/kuiva-arvio-etusivu-menetelma.ts
 * Ei kirjoita tietokantaan.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

type Rivi = {
  hanke_id: string;
  nimi: string;
  kunta: string;
  kentta: string;
  lahde_id: string;
  lahde_url: string;
  lainaus: string;
  dokumentti_id: string | null;
  lahde_tyyppi: string | null;
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

/** Palauttaa haun URL:n lainauksesta, tai null jos ei tulkita. */
export function ehdotaHakuUrl(lainaus: string): {
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

  const osmIlman = lainaus.match(
    /→\s*OSM:\s*([^.\n]+?)(?:\s*\(|\s*\d+\.\d+|$)/i,
  );
  if (osmIlman?.[1]) {
    const hakusana = osmIlman[1].trim().replace(/,\s*$/, "");
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

  return null;
}

function onKunnanEtusivu(url: string): boolean {
  return (
    /^https?:\/\/(www\.)?[^/]+\.fi\/?$/i.test(url) &&
    !/geocoding|\/pelias\/|nominatim/i.test(url)
  );
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: hankkeet, error: hVirhe } = await sb
    .from("hankkeet")
    .select("id, nimi, kunta")
    .eq("julkaistu", true)
    .eq("sijainti_alue_tyyppi", "arvio")
    .not("sijainti_lat", "is", null);
  if (hVirhe) throw new Error(hVirhe.message);

  const hankeKartta = new Map(
    (hankkeet ?? []).map((h) => [h.id as string, h]),
  );
  const idt = [...hankeKartta.keys()];
  if (idt.length === 0) {
    console.log("Ei arvio-hankkeita.");
    return;
  }

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
      ehdokkaat.push({
        hanke_id: h.id,
        nimi: h.nimi,
        kunta: h.kunta,
        kentta: r.kentta,
        lahde_id: r.id,
        lahde_url: url,
        lainaus: String(r.lainaus ?? ""),
        dokumentti_id: r.dokumentti_id,
        lahde_tyyppi: null,
      });
    }
  }

  const dokIdt = [
    ...new Set(ehdokkaat.map((e) => e.dokumentti_id).filter(Boolean)),
  ] as string[];
  const tyyppiKartta = new Map<string, string>();
  for (let i = 0; i < dokIdt.length; i += erakoko) {
    const era = dokIdt.slice(i, i + erakoko);
    const { data: doks } = await sb
      .from("dokumentit")
      .select("id, lahde_tyyppi")
      .in("id", era);
    for (const d of doks ?? []) {
      tyyppiKartta.set(d.id, d.lahde_tyyppi);
    }
  }
  for (const e of ehdokkaat) {
    if (e.dokumentti_id) {
      e.lahde_tyyppi = tyyppiKartta.get(e.dokumentti_id) ?? null;
    }
  }

  const hakuun = ehdokkaat.filter((e) =>
    /→\s*OSM|Nominatim|→\s*MML/i.test(e.lainaus),
  );
  const eiHakuun = ehdokkaat.filter(
    (e) => !/→\s*OSM|Nominatim|→\s*MML/i.test(e.lainaus),
  );

  const perHanke = new Map<string, Rivi>();
  for (const e of hakuun) {
    const aiempi = perHanke.get(e.hanke_id);
    if (!aiempi) {
      perHanke.set(e.hanke_id, e);
      continue;
    }
    const prio = (k: string) =>
      k === "sijainti_lat" || k === "sijainti_lon" ? 0 : 1;
    if (prio(e.kentta) < prio(aiempi.kentta)) perHanke.set(e.hanke_id, e);
  }

  const muutokset: Array<{
    hanke: string;
    kunta: string;
    vanha_url: string;
    uusi_url: string;
    palvelu: string;
    hakusana: string;
    vanha_tyyppi: string | null;
  }> = [];
  const eiParsittu: Rivi[] = [];

  for (const e of perHanke.values()) {
    const ehdotus = ehdotaHakuUrl(e.lainaus);
    if (!ehdotus) {
      eiParsittu.push(e);
      continue;
    }
    muutokset.push({
      hanke: e.nimi,
      kunta: e.kunta,
      vanha_url: e.lahde_url,
      uusi_url: ehdotus.uusi_url,
      palvelu: ehdotus.palvelu,
      hakusana: ehdotus.hakusana,
      vanha_tyyppi: e.lahde_tyyppi,
    });
  }

  console.log("=== KUIVA-AJO: arvio-etusivu → menetelma ===");
  console.log(`Lähderivit kunnan etusivu -URL:lla: ${ehdokkaat.length}`);
  console.log(`Hankkeita, joiden lainaus viittaa hakuun: ${perHanke.size}`);
  console.log(`Parsittavia URL-muutoksia: ${muutokset.length}`);
  console.log(`Hakuviittaus ilman parsittavaa hakusanaa: ${eiParsittu.length}`);
  console.log(
    `Ilman hakuviittausta (raportoi erikseen): ${
      new Set(eiHakuun.map((e) => e.hanke_id)).size
    }`,
  );
  console.log("");
  console.log("--- Kolme esimerkkiä ---");
  for (const m of muutokset.slice(0, 3)) {
    console.log(`• ${m.hanke} (${m.kunta})`);
    console.log(`  vanha: ${m.vanha_url} [${m.vanha_tyyppi ?? "?"}]`);
    console.log(
      `  uusi:  ${m.uusi_url} [menetelma / ${m.palvelu}: «${m.hakusana}»]`,
    );
  }
  if (eiHakuun.length > 0) {
    console.log("");
    console.log("--- Ilman hakuviittausta ---");
    const nahi = new Map<string, Rivi>();
    for (const e of eiHakuun) nahi.set(e.hanke_id, e);
    for (const e of nahi.values()) {
      console.log(`• ${e.nimi} (${e.kunta})`);
      console.log(`  url: ${e.lahde_url}`);
      console.log(`  lainaus: ${e.lainaus.slice(0, 220)}`);
    }
  }
  if (eiParsittu.length > 0) {
    console.log("");
    console.log("--- Hakuviittaus, mutta hakusanaa ei saatu ---");
    for (const e of eiParsittu) {
      console.log(`• ${e.nimi}: ${e.lainaus.slice(0, 160)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
