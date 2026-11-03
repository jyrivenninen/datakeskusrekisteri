/**
 * Raportoi julkaistut organisaatiot ilman Y-tunnusta (luokittelu) ja
 * organisaatiot ilman hankeliitosta. Ei korjaa mitään.
 * Aja: npx tsx scripts/selvita-organisaatiot-ilman-ytunnusta.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

type Luokka =
  | "suomalainen_yritys_ehdokas"
  | "julkisyhteiso"
  | "ulkomainen"
  | "vain_nimi";

const JULKIS = [
  /\bkunta\b/i,
  /\bkaupunki\b/i,
  /kaupunginvaltuusto/i,
  /kaupunginhallitus/i,
  /kunnanvaltuusto/i,
  /kunnanhallitus/i,
  /lautakunta/i,
  /lupajaosto/i,
  /rakennusvalvonta/i,
  /\bely[- ]?keskus\b/i,
  /elinkeino-, liikenne/i,
  /ministeriö/i,
  /lupa- ja valvontavirasto/i,
  /^csc$/i,
];

const ULKOMAINEN = [
  /\bLtd\.?\b/i,
  /\bLimited\b/i,
  /\bInc\.?\b/i,
  /\bCorp\.?\b/i,
  /\bCorporation\b/i,
  /\bAS\b/,
  /\bAB\b/,
  /\bGmbH\b/i,
  /\bLLC\b/i,
  /\bHoldings?\b/i,
  /\bGroup Limited\b/i,
];

const SUOMI_YRITYS = [
  /\bOy\b/i,
  /\bOyj\b/i,
  /\bAy\b/i,
  /\bKy\b/i,
  /\bOsakeyhtiö\b/i,
];

function luokittele(nimi: string, tyyppi: string): Luokka {
  if (tyyppi === "kunta" || tyyppi === "lvv" || tyyppi === "ely" || JULKIS.some((r) => r.test(nimi))) {
    return "julkisyhteiso";
  }
  if (ULKOMAINEN.some((r) => r.test(nimi)) && !SUOMI_YRITYS.some((r) => r.test(nimi))) {
    return "ulkomainen";
  }
  // Oy Creanova Hosting Solutions Ltd. — suomalainen muoto + Ltd
  if (SUOMI_YRITYS.some((r) => r.test(nimi))) {
    return "suomalainen_yritys_ehdokas";
  }
  // Brändinimi / lyhyt nimi
  if (!/\s/.test(nimi.trim()) || nimi.split(/\s+/).length <= 2) {
    // Tunnetut ulkomaiset brändit ilman oikeudellista muotoa
    const ulkoBrandit = [
      "Equinix",
      "atNorth",
      "Nebius",
      "Neoen",
      "Glesys",
      "GlobalConnect",
      "DataCrunch",
      "DayOne",
      "Capnova",
      "AmpTank",
      "Arcem",
      "Verne",
      "Solano",
      "Sesterce",
      "Scale42",
      "Valorem",
      "Hyperco",
      "NordVire",
      "Prime Data Centers",
      "Borealis Data Center",
      "Asia Pacific Land (APL)",
      "ASP Datacenter",
      "Bilt Technology",
      "Eddu Energy",
      "Greensky Energy",
      "KS-Geoenergi",
      "Nova Complex",
      "OnZero Finland",
      "Pohjan Voima",
      "T1 Energy",
      "Transistor DC",
      "Trevian Asset Management",
      "Tuulikolmio",
      "BESS Solutions Finland",
      "Borealis Finland",
      "Helios Nordic Energy Finland",
      "Glesys / Trevian",
      "Hyperco Fin HoldCo 1",
      "Elisa",
      "Telia",
      "Fortum",
      "YIT",
      "UPM-Kymmene",
      "JNT",
      "Ramboll",
    ];
    if (ulkoBrandit.some((b) => b.toLowerCase() === nimi.toLowerCase())) {
      // Elisa/Telia/Fortum/YIT/UPM ovat suomalaisia konserneja — YTJ-ehdokkaita brändinimellä
      const suomiBrandit = ["Elisa", "Telia", "Fortum", "YIT", "UPM-Kymmene", "JNT"];
      if (suomiBrandit.some((b) => b.toLowerCase() === nimi.toLowerCase())) {
        return "suomalainen_yritys_ehdokas";
      }
      // Ramboll = asiakirjan lyhyt nimi, ei tunnistettavaa yhtiötä
      if (nimi === "Ramboll") return "vain_nimi";
      return "ulkomainen";
    }
  }
  if (ULKOMAINEN.some((r) => r.test(nimi))) return "ulkomainen";
  return "vain_nimi";
}

async function ytjNimihaku(nimi: string): Promise<{ y_tunnus: string; nimi: string } | null> {
  const q = encodeURIComponent(nimi.replace(/\s*\([^)]*\)\s*/g, " ").trim());
  const url = `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?name=${q}&page=1`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      companies?: Array<{ businessId?: string; name?: string }>;
    };
    const eka = json.companies?.[0];
    if (!eka?.businessId) return null;
    return { y_tunnus: eka.businessId, nimi: eka.name ?? "" };
  } catch {
    return null;
  }
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-ympäristö puuttuu");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: ilman, error } = await sb
    .from("organisaatiot")
    .select("id, nimi, tyyppi, luotu_pvm")
    .eq("julkaistu", true)
    .is("y_tunnus", null)
    .order("nimi");
  if (error) throw new Error(error.message);

  const luokat: Record<Luokka, { nimi: string; tyyppi: string }[]> = {
    suomalainen_yritys_ehdokas: [],
    julkisyhteiso: [],
    ulkomainen: [],
    vain_nimi: [],
  };
  for (const o of ilman ?? []) {
    const l = luokittele(o.nimi as string, o.tyyppi as string);
    luokat[l].push({ nimi: o.nimi as string, tyyppi: o.tyyppi as string });
  }

  console.log("=== Ilman Y-tunnusta: luokittelu (heuristiikka) ===");
  for (const [k, lista] of Object.entries(luokat)) {
    console.log(`\n## ${k} (${lista.length})`);
    for (const r of lista) console.log(`- ${r.nimi}`);
  }

  // YTJ-tarkistus vain suomalaisille ehdokkaille (koodipohjainen, ei mallia)
  console.log("\n=== YTJ-nimihaku suomalaisille ehdokkaille ===");
  const ytjLoytyi: { nimi: string; ytj: string; ytj_nimi: string }[] = [];
  const ytjEi: string[] = [];
  for (const r of luokat.suomalainen_yritys_ehdokas) {
    // Haku täydellä nimellä; sulkeet pois
    const haku = r.nimi.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const osuma = await ytjNimihaku(haku);
    await new Promise((x) => setTimeout(x, 200));
    if (osuma) {
      ytjLoytyi.push({ nimi: r.nimi, ytj: osuma.y_tunnus, ytj_nimi: osuma.nimi });
      console.log(`LOYTYI ${r.nimi} → ${osuma.y_tunnus} (${osuma.nimi})`);
    } else {
      ytjEi.push(r.nimi);
      console.log(`EI ${r.nimi}`);
    }
  }
  console.log(
    JSON.stringify(
      {
        yhteensa: (ilman ?? []).length,
        luokat: Object.fromEntries(Object.entries(luokat).map(([k, v]) => [k, v.length])),
        ytj_loytyi: ytjLoytyi.length,
        ytj_ei: ytjEi.length,
        ytj_loydetyt: ytjLoytyi,
      },
      null,
      2,
    ),
  );

  // Ilman hankeliitosta
  const { data: kaikki } = await sb.from("organisaatiot").select("id, nimi, luotu_pvm").eq("julkaistu", true);
  const { data: roolit } = await sb.from("hanke_organisaatiot").select("organisaatio_id").eq("julkaistu", true);
  const { data: toimijat } = await sb
    .from("hankkeet")
    .select("toimija_organisaatio_id")
    .eq("julkaistu", true)
    .not("toimija_organisaatio_id", "is", null);
  const { data: paatokset } = await sb
    .from("paatokset")
    .select("paattava_organisaatio_id")
    .eq("julkaistu", true)
    .not("paattava_organisaatio_id", "is", null);

  const liitetyt = new Set<string>();
  for (const r of roolit ?? []) liitetyt.add(r.organisaatio_id as string);
  for (const r of toimijat ?? []) {
    if (r.toimija_organisaatio_id) liitetyt.add(r.toimija_organisaatio_id as string);
  }
  for (const r of paatokset ?? []) {
    if (r.paattava_organisaatio_id) liitetyt.add(r.paattava_organisaatio_id as string);
  }

  const orvot = (kaikki ?? []).filter((o) => !liitetyt.has(o.id as string));
  const orvoIdt = orvot.map((o) => o.id as string);

  const { data: lahteet } = await sb
    .from("kentta_lahteet")
    .select("rivi_id, kentta, lahde_url, lainaus, vahvistettu_pvm, luotu_pvm")
    .eq("taulu", "organisaatiot")
    .in("rivi_id", orvoIdt)
    .order("luotu_pvm");

  console.log("\n=== Ilman hankeliitosta ===");
  for (const o of orvot.sort((a, b) => (a.nimi as string).localeCompare(b.nimi as string, "fi"))) {
    const omat = (lahteet ?? []).filter((l) => l.rivi_id === o.id);
    const nimiLahde = omat.find((l) => l.kentta === "nimi") ?? omat[0];
    console.log(
      JSON.stringify({
        nimi: o.nimi,
        lisatty: (o.luotu_pvm as string).slice(0, 10),
        lahde_url: nimiLahde?.lahde_url ?? null,
        lainaus: nimiLahde?.lainaus ?? null,
        lahdeita: omat.length,
      }),
    );
  }
  console.log("Yhteensä orpoja:", orvot.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
