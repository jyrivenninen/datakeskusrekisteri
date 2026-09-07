/**
 * Kartoittaa Dynasty-RSS-syötteitä hankekunnille. Vain löytö, ei kirjoita tietokantaan.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const RSS_POLKU = "/cgi/DREQUEST.PHP?page=rss/meetingitems&show=5";

function slug(nimi: string): string {
  return nimi
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(.+)(ainen|inen)$/, "$1"); // optional, skip
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

function ehdokasUrlit(nimi: string): string[] {
  const s = slug(nimi);
  const h = slugHyphen(nimi);
  const pohjat = [
    `https://${s}.oncloudos.com${RSS_POLKU}`,
    `https://${s}10.oncloudos.com${RSS_POLKU}`,
    `https://${h}.oncloudos.com${RSS_POLKU}`,
    `https://${h}10.oncloudos.com${RSS_POLKU}`,
    `https://julkaisu.${s}.fi${RSS_POLKU}`,
    `https://julkaisu.${h}.fi${RSS_POLKU}`,
    `https://dynasty.${s}.fi${RSS_POLKU}`,
    `https://dynastyjulkaisu.${s}.fi${RSS_POLKU}`,
    `https://julkaisu22.${s}.fi/fin${RSS_POLKU}`,
    `https://julkaisu22.${s}.fi${RSS_POLKU}`,
    `https://${s}.fi${RSS_POLKU}`,
    `https://${s}.fi/dynasty/cgi${RSS_POLKU.replace("/cgi", "")}`,
    `https://${s}.fi/djulkaisu/cgi${RSS_POLKU.replace("/cgi", "")}`,
    `https://${s}.fi/dynasty10/cgi${RSS_POLKU.replace("/cgi", "")}`,
  ];
  // Erityistapaukset
  const erikoiset: Record<string, string[]> = {
    "Mänttä-Vilppula": [
      `https://mantta-vilppulad10.oncloudos.com${RSS_POLKU}`,
      `https://manttavilppula10.oncloudos.com${RSS_POLKU}`,
    ],
    Loviisa: [`https://julkaisu22.loviisa.fi/fin${RSS_POLKU}`],
    Pietarsaari: [`https://pietarsaari.oncloudos.com${RSS_POLKU}`, `https://jakobstad.oncloudos.com${RSS_POLKU}`],
    Kemi: [`https://kemi.oncloudos.com${RSS_POLKU}`, `https://kemi10.oncloudos.com${RSS_POLKU}`],
    Keminmaa: [`https://keminmaa.oncloudos.com${RSS_POLKU}`],
    Kristiinankaupunki: [`https://kristiinankaupunki.oncloudos.com${RSS_POLKU}`],
    "Närpiö": [`https://narpio.oncloudos.com${RSS_POLKU}`, `https://narpes.oncloudos.com${RSS_POLKU}`],
    Kruunupyy: [`https://kruunupyy.oncloudos.com${RSS_POLKU}`, `https://kronoby.oncloudos.com${RSS_POLKU}`],
    Janakkala: [`https://janakkala.oncloudos.com${RSS_POLKU}`],
    Forssa: [`https://forssa.oncloudos.com${RSS_POLKU}`],
    Hamina: [`https://hamina.oncloudos.com${RSS_POLKU}`],
    Heinola: [`https://heinola.oncloudos.com${RSS_POLKU}`],
    Hämeenlinna: [`https://hameenlinna.oncloudos.com${RSS_POLKU}`],
    Iisalmi: [`https://iisalmi.oncloudos.com${RSS_POLKU}`],
    Imatra: [`https://imatra.oncloudos.com${RSS_POLKU}`],
    Järvenpää: [`https://jarvenpaa.oncloudos.com${RSS_POLKU}`],
    Kerava: [`https://kerava.oncloudos.com${RSS_POLKU}`],
    Kouvola: [`https://ep10.kouvola.fi/cgi/DREQUEST.PHP?page=rss/meetingitems&show=5`],
    Kokkola: [`https://kokkola.oncloudos.com${RSS_POLKU}`],
    Kuopio: [`https://kuopio.oncloudos.com${RSS_POLKU}`],
    Lappeenranta: [`https://lappeenranta.oncloudos.com${RSS_POLKU}`],
    Lohja: [`https://lohja.oncloudos.com${RSS_POLKU}`],
    Nurmijärvi: [`https://nurmijarvi.oncloudos.com${RSS_POLKU}`],
    Orimattila: [`https://orimattila.oncloudos.com${RSS_POLKU}`],
    Rovaniemi: [`https://rovaniemi.oncloudos.com${RSS_POLKU}`],
    Seinäjoki: [`https://seinajoki.oncloudos.com${RSS_POLKU}`],
    Sipoo: [`https://sipoo.oncloudos.com${RSS_POLKU}`],
    Turku: [`https://turku.oncloudos.com${RSS_POLKU}`],
    Valkeakoski: [`https://valkeakoski.oncloudos.com${RSS_POLKU}`],
    Varkaus: [`https://varkaus.oncloudos.com${RSS_POLKU}`],
    Vihti: [`https://vihti.oncloudos.com${RSS_POLKU}`],
    Rauma: [`https://rauma.oncloudos.com${RSS_POLKU}`],
    Kangasala: [`https://kangasala.oncloudos.com${RSS_POLKU}`, `https://kangasala10.oncloudos.com${RSS_POLKU}`],
    Nokia: [`https://nokia.oncloudos.com${RSS_POLKU}`, `https://nokia10.oncloudos.com${RSS_POLKU}`],
    Akaa: [`https://akaa.oncloudos.com${RSS_POLKU}`],
    Parkano: [`https://parkano.oncloudos.com${RSS_POLKU}`],
    Keuruu: [`https://keuruu.oncloudos.com${RSS_POLKU}`],
    Eurajoki: [`https://eurajoki.oncloudos.com${RSS_POLKU}`],
    Harjavalta: [`https://harjavalta.oncloudos.com${RSS_POLKU}`],
    Ulvila: [`https://ulvila.oncloudos.com${RSS_POLKU}`],
    Pornainen: [`https://pornainen.oncloudos.com${RSS_POLKU}`],
    Mäntsälä: [`https://mantsala.oncloudos.com${RSS_POLKU}`],
    Hyrynsalmi: [`https://hyrynsalmi.oncloudos.com${RSS_POLKU}`],
    Kuhmo: [`https://kuhmo.oncloudos.com${RSS_POLKU}`],
    Kitee: [`https://kitee.oncloudos.com${RSS_POLKU}`],
    Liperi: [`https://liperi.oncloudos.com${RSS_POLKU}`],
    Kontiolahti: [`https://kontiolahti.oncloudos.com${RSS_POLKU}`],
    Kajaani: [`https://kajaani.oncloudos.com${RSS_POLKU}`],
    Ii: [`https://ii.oncloudos.com${RSS_POLKU}`],
    Tervola: [`https://tervola.oncloudos.com${RSS_POLKU}`],
    Utajärvi: [`https://utajarvi.oncloudos.com${RSS_POLKU}`],
    Kemijärvi: [`https://kemijarvi.oncloudos.com${RSS_POLKU}`],
    Alajärvi: [`https://alajarvi.oncloudos.com${RSS_POLKU}`],
    Kauhajoki: [`https://kauhajoki.oncloudos.com${RSS_POLKU}`],
    Isojoki: [`https://isojoki.oncloudos.com${RSS_POLKU}`],
    Kokemäki: [`https://kokemaki.oncloudos.com${RSS_POLKU}`],
    Merikarvia: [`https://merikarvia.oncloudos.com${RSS_POLKU}`],
    Pyhäjoki: [`https://pyhajoki.oncloudos.com${RSS_POLKU}`],
    Haapavesi: [`https://haapavesi.oncloudos.com${RSS_POLKU}`],
    Halsua: [`https://halsua.oncloudos.com${RSS_POLKU}`],
    Sievi: [`https://sievi.oncloudos.com${RSS_POLKU}`],
    Karstula: [`https://karstula.oncloudos.com${RSS_POLKU}`],
    Saarijärvi: [`https://saarijarvi.oncloudos.com${RSS_POLKU}`],
    Rautalampi: [`https://rautalampi.oncloudos.com${RSS_POLKU}`],
    Pieksämäki: [`https://pieksamaki.oncloudos.com${RSS_POLKU}`],
    Joroinen: [`https://joroinen.oncloudos.com${RSS_POLKU}`],
    Petäjävesi: [`https://petajavesi.oncloudos.com${RSS_POLKU}`],
    Muhos: [`https://muhos.oncloudos.com${RSS_POLKU}`],
    Toholampi: [`https://toholampi.oncloudos.com${RSS_POLKU}`],
    Lapinlahti: [`https://lapinlahti.oncloudos.com${RSS_POLKU}`],
    Vaala: [`https://vaala.oncloudos.com${RSS_POLKU}`],
    Pyhäjärvi: [`https://pyhajarvi.oncloudos.com${RSS_POLKU}`, `https://pyhajarvi10.oncloudos.com${RSS_POLKU}`],
    Merijärvi: [`https://merijarvi.oncloudos.com${RSS_POLKU}`],
    Kankaanpää: [`https://kankaanpaa.oncloudos.com${RSS_POLKU}`],
    Huittinen: [`https://huittinen.oncloudos.com${RSS_POLKU}`],
  };
  const kaikki = [...(erikoiset[nimi] ?? []), ...pohjat];
  return [...new Set(kaikki)];
}

async function onRss(url: string): Promise<boolean> {
  try {
    const vastaus = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/xml, */*" },
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

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
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
    let urlOk: string | null = null;
    for (const e of ehdokasUrlit(nimi)) {
      if (await onRss(e)) {
        urlOk = e.replace("show=5", "show=30");
        break;
      }
    }
    if (urlOk) {
      loytyi.push({ nimi, url: urlOk });
      console.log(`OK ${nimi}`);
    } else {
      eiLoydy.push(nimi);
      console.log(`-- ${nimi}`);
    }
  }

  console.log("\n=== LOYTYI ===");
  for (const r of loytyi) console.log(JSON.stringify(r));
  console.log(`\nYhteensä ${loytyi.length}/${puuttuvat.length}`);
  console.log("\n=== EI RSS ===");
  console.log(eiLoydy.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
