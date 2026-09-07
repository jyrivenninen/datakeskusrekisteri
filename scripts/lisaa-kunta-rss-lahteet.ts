/**
 * Lisää vahvistetut esityslistalähteet kunta_esityslista_lahteet-tauluun.
 * Ajetaan kerran tai uudelleen kun listaa päivitetään. Ei kielimallia.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

type LahdeRivi = {
  nimi: string;
  jarjestelma: "rss" | "casem" | "html" | "tweb";
  url: string;
  huomautus?: string;
};

/** Vahvistettu HTTP 200. Nimi = kunnat.nimi (Syke). */
const LAHTEET: LahdeRivi[] = [
  {
    nimi: "Espoo",
    jarjestelma: "rss",
    url: "https://espoo.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos, kokousasiat",
  },
  {
    nimi: "Vantaa",
    jarjestelma: "rss",
    url: "https://vantaa.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kirkkonummi",
    jarjestelma: "rss",
    url: "https://kirkkonummi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Tuusula",
    jarjestelma: "rss",
    url: "https://tuusula.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Lahti",
    jarjestelma: "rss",
    url: "https://lahti.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Salo",
    jarjestelma: "rss",
    url: "https://salo10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty salo10",
  },
  {
    nimi: "Raisio",
    jarjestelma: "rss",
    url: "https://raisio.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Eurajoki",
    jarjestelma: "rss",
    url: "https://eurajoki.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Forssa",
    jarjestelma: "rss",
    url: "https://forssa.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Harjavalta",
    jarjestelma: "rss",
    url: "https://harjavalta10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty harjavalta10",
  },
  {
    nimi: "Hyrynsalmi",
    jarjestelma: "rss",
    url: "https://hyrynsalmi10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty hyrynsalmi10",
  },
  {
    nimi: "Ii",
    jarjestelma: "rss",
    url: "https://ii.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Joroinen",
    jarjestelma: "rss",
    url: "https://joroinen.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kemi",
    jarjestelma: "rss",
    url: "https://kemi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kemijärvi",
    jarjestelma: "rss",
    url: "https://kemijarvi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Keuruu",
    jarjestelma: "rss",
    url: "https://keuruu.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kuhmo",
    jarjestelma: "rss",
    url: "https://kuhmo10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty kuhmo10",
  },
  {
    nimi: "Kuopio",
    jarjestelma: "rss",
    url: "https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Mäntsälä",
    jarjestelma: "rss",
    url: "https://mantsala.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Mänttä-Vilppula",
    jarjestelma: "rss",
    url: "https://mantta-vilppulad10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty mantta-vilppulad10",
  },
  {
    nimi: "Nurmijärvi",
    jarjestelma: "rss",
    url: "https://nurmijarvi10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty nurmijarvi10",
  },
  {
    nimi: "Utajärvi",
    jarjestelma: "rss",
    url: "https://utajarvi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Vaala",
    jarjestelma: "rss",
    url: "https://vaala.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Vihti",
    jarjestelma: "rss",
    url: "https://vihti.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Tampere",
    jarjestelma: "casem",
    url: "https://tampere.cloudnc.fi/fi-FI",
    huomautus: "CloudNC CaseM",
  },
  {
    nimi: "Mikkeli",
    jarjestelma: "casem",
    url: "https://mikkeli.cloudnc.fi/fi-FI",
    huomautus: "CloudNC CaseM",
  },
  {
    nimi: "Pori",
    jarjestelma: "casem",
    url: "https://pori.cloudnc.fi/fi-FI",
    huomautus: "CloudNC CaseM",
  },
  {
    nimi: "Jyväskylä",
    jarjestelma: "casem",
    url: "https://jyvaskyla.cloudnc.fi/fi-FI",
    huomautus: "CloudNC CaseM",
  },
  {
    nimi: "Rovaniemi",
    jarjestelma: "casem",
    url: "https://rovaniemi.cloudnc.fi/fi-FI",
    huomautus: "CloudNC CaseM",
  },
  {
    nimi: "Kajaani",
    jarjestelma: "casem",
    url: "https://kajaani.cloudnc.fi/fi-FI",
    huomautus: "CloudNC CaseM",
  },
  {
    nimi: "Helsinki",
    jarjestelma: "html",
    url: "https://paatokset.hel.fi/fi",
    huomautus: "Drupal paatokset.hel.fi, HTML-parseri",
  },
  {
    nimi: "Kouvola",
    jarjestelma: "rss",
    url: "https://ep10.kouvola.fi/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty ep10.kouvola.fi",
  },
  {
    nimi: "Oulu",
    jarjestelma: "tweb",
    url: "https://asiakirjat.ouka.fi/ktwebscr/epj_rssfeed.htm?toimielin=",
    huomautus: "KTweb Triplan, RSS + esityslista HTML",
  },
];

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  const supabase = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nimet = LAHTEET.map((l) => l.nimi);
  const { data: kunnat, error: kuntaVirhe } = await supabase
    .from("kunnat")
    .select("id, nimi, koodi")
    .in("nimi", nimet);
  if (kuntaVirhe) throw new Error(kuntaVirhe.message);

  const idNimella = new Map((kunnat ?? []).map((k) => [k.nimi, k.id as string]));
  let lisatty = 0;
  let ohitettu = 0;

  for (const lahde of LAHTEET) {
    const kuntaId = idNimella.get(lahde.nimi);
    if (!kuntaId) {
      console.warn(`Ohitetaan ${lahde.nimi}: ei kunnat-riviä (aja agentti:hakemisto).`);
      ohitettu += 1;
      continue;
    }

    const { error } = await supabase.from("kunta_esityslista_lahteet").upsert(
      {
        kunta_id: kuntaId,
        jarjestelma: lahde.jarjestelma,
        perus_url: lahde.url,
        seurannassa: true,
        huomautus: lahde.huomautus ?? null,
      },
      { onConflict: "kunta_id,jarjestelma" },
    );
    if (error) throw new Error(`${lahde.nimi}: ${error.message}`);
    console.log(`OK ${lahde.nimi} (${lahde.jarjestelma}) → ${lahde.url}`);
    lisatty += 1;
  }

  const { count } = await supabase
    .from("kunta_esityslista_lahteet")
    .select("*", { count: "exact", head: true })
    .eq("seurannassa", true)
    .in("jarjestelma", ["rss", "ical", "casem", "html", "tweb"]);
  console.log(`Valmis. ${lisatty} lähdettä upsertattu, ${ohitettu} ohitettu. Seurannassa yhteensä ${count ?? "?"} lähdettä.`);
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
