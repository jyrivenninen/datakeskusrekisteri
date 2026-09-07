/**
 * Lisää vahvistetut Dynasty-RSS-lähteet kunta_esityslista_lahteet-tauluun.
 * Ajetaan kerran tai uudelleen kun listaa päivitetään. Ei kielimallia.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

/** Vahvistettu HTTP 200 + RSS-kokousasiat. Nimi = kunnat.nimi (Syke). */
const LAHTEET: { nimi: string; url: string; huomautus?: string }[] = [
  {
    nimi: "Espoo",
    url: "https://espoo.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos, kokousasiat",
  },
  {
    nimi: "Vantaa",
    url: "https://vantaa.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kirkkonummi",
    url: "https://kirkkonummi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Tuusula",
    url: "https://tuusula.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Lahti",
    url: "https://lahti.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Salo",
    url: "https://salo10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty salo10",
  },
  {
    nimi: "Raisio",
    url: "https://raisio.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Eurajoki",
    url: "https://eurajoki.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Forssa",
    url: "https://forssa.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Harjavalta",
    url: "https://harjavalta10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty harjavalta10",
  },
  {
    nimi: "Hyrynsalmi",
    url: "https://hyrynsalmi10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty hyrynsalmi10",
  },
  {
    nimi: "Ii",
    url: "https://ii.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Joroinen",
    url: "https://joroinen.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kemi",
    url: "https://kemi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kemijärvi",
    url: "https://kemijarvi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Keuruu",
    url: "https://keuruu.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Kuhmo",
    url: "https://kuhmo10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty kuhmo10",
  },
  {
    nimi: "Kuopio",
    url: "https://kuopio.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Mäntsälä",
    url: "https://mantsala.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Mänttä-Vilppula",
    url: "https://mantta-vilppulad10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty mantta-vilppulad10",
  },
  {
    nimi: "Nurmijärvi",
    url: "https://nurmijarvi10.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty nurmijarvi10",
  },
  {
    nimi: "Utajärvi",
    url: "https://utajarvi.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Vaala",
    url: "https://vaala.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
  },
  {
    nimi: "Vihti",
    url: "https://vihti.oncloudos.com/cgi/DREQUEST.PHP?page=rss/meetingitems&show=30",
    huomautus: "Dynasty oncloudos",
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
        jarjestelma: "rss",
        perus_url: lahde.url,
        seurannassa: true,
        huomautus: lahde.huomautus ?? null,
      },
      { onConflict: "kunta_id,jarjestelma" },
    );
    if (error) throw new Error(`${lahde.nimi}: ${error.message}`);
    console.log(`OK ${lahde.nimi} → ${lahde.url}`);
    lisatty += 1;
  }

  const { count } = await supabase
    .from("kunta_esityslista_lahteet")
    .select("*", { count: "exact", head: true })
    .eq("seurannassa", true)
    .in("jarjestelma", ["rss", "ical"]);
  console.log(`Valmis. ${lisatty} lähdettä upsertattu, ${ohitettu} ohitettu. Seurannassa yhteensä ${count ?? "?"} RSS/iCal-lähdettä.`);
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
