/**
 * Siirtää faktalähteet pois rikkinäisistä URL:istä, korjaa otsikot ja poistaa turhat dokumenttirivit.
 *
 * Aja: npx tsx scripts/siivoa-virhe-asiakirja-urlit.ts [--kuiva]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { onHelsinkiAvoinWfsUrl } from "../src/lib/lahde-geokoodaus-url";

const KASITTELIJA = "yllapito:siivoa-virhe-asiakirja-urlit";

/** Vanha lähde-URL → toimiva korvaava URL (sama fakta). */
const LAHDE_SIIRROT: Record<string, string> = {
  "https://forssa.oncloudos.com/kuulutus/202638664.PDF":
    "https://www.forssa.fi/kaupunki-ja-hallinto/hankkeet/datakeskushanke/",
  "https://forssa.oncloudos.com/kuulutus/202638664.38665.PDF":
    "https://www.forssa.fi/kaupunki-ja-hallinto/hankkeet/datakeskushanke/",
  "https://www.kerava.fi/asuminen-ja-rakentaminen/kaupunkisuunnittelu/yleiskaavoitus-ja-suunnittelu/etelaisen-jokilaakson-osayleiskaava/":
    "https://kerava.production.geniem.io/uploads/sites/2/2026/03/asemakaavaselostus.pdf",
  "https://www.kerava.fi/hankkeet/etelaisen-jokilaakson-asemakaava-2400/":
    "https://kerava.production.geniem.io/uploads/sites/2/2026/03/asemakaavaselostus.pdf",
  "https://www.kerava.fi/kaavoitus/datakeskushankkeen-kaavaluonnokset-nahtaville-asukastilaisuus-6-5/":
    "https://www.keski-uusimaa.fi/paikalliset/9531886",
  "https://www.valkeakoski.fi/":
    "https://www.valkeakoski.fi/asuminen-ja-ymparisto/kaupunkisuunnittelu/asemakaavoitus/",
  "https://www.ymparisto.fi/sites/default/files/documents/Perusteltu%20p%C3%A4%C3%A4telm%C3%A4%20LVV%20J%C3%A4rvenp%C3%A4%C3%A4%20datakeskus%20%282%29.pdf":
    "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/jarvenpaan-palvelinkeskus",
  "https://www.ocolo.io/colocation/atnorth/":
    "https://www.peeringdb.com/fac/16663",
  "https://www.ocolo.io/colocation/atnorth/helsinki-fin03/":
    "https://www.peeringdb.com/fac/16663",
};

const OTSIKKO_KORJAUKSET: Record<string, string> = {
  "https://www.jarviseudunsanomat.fi/arkisto/2024/11/23/alajarvi-haluaa-datakeskuksen/":
    "Alajärvi haluaa datakeskuksen | Järviseudun sanomat",
  "https://www.jarviseudunsanomat.fi/arkisto/2026/06/09/datakeskustontit-kiinnostavat-toimijoita-ensimmaiset-hintalaput-hyvaksyttiin-alajarven-valtuustossa/":
    "Datakeskustontit kiinnostavat toimijoita – ensimmäiset hintalaput hyväksyttiin | Järviseudun sanomat",
  "https://www.valkeakoski.fi/asuminen-ja-ymparisto/kaupunkisuunnittelu/asemakaavoitus/":
    "Asemakaavoitus | Valkeakoski",
};

const POISTETTAVAT_URLIT = new Set(Object.keys(LAHDE_SIIRROT));

type KenttaRivi = { taulu: string; rivi_id: string; kentta: string };

async function korvaaLahdeUrlit(
  sb: SupabaseClient,
  vanha: string,
  uusi: string,
  kuiva: boolean,
): Promise<number> {
  const { data: rivit, error } = await sb
    .from("kentta_lahteet")
    .select("taulu, rivi_id, kentta")
    .eq("lahde_url", vanha)
    .neq("taulu", "dokumentit");
  if (error) throw error;
  let n = 0;
  for (const r of (rivit ?? []) as KenttaRivi[]) {
    if (kuiva) {
      console.log(`  [kuiva] ${r.taulu}.${r.kentta} ${vanha} → ${uusi}`);
      n += 1;
      continue;
    }
    const { error: rpcVirhe } = await sb.rpc("korjaa_kentta_lahde_url", {
      p_taulu: r.taulu,
      p_rivi_id: r.rivi_id,
      p_kentta: r.kentta,
      p_vanha_url: vanha,
      p_uusi_url: uusi,
    });
    if (rpcVirhe) throw new Error(`${vanha}: ${rpcVirhe.message}`);
    n += 1;
  }
  return n;
}

async function paivitaDokumenttiOtsikko(
  sb: SupabaseClient,
  url: string,
  otsikko: string,
  kuiva: boolean,
) {
  const { data: dok } = await sb
    .from("dokumentit")
    .select("id, lahde_tyyppi, sitovuustaso")
    .eq("url", url)
    .maybeSingle();
  if (!dok) return;
  if (kuiva) {
    console.log(`  [kuiva] otsikko ${url} → ${otsikko}`);
    return;
  }
  const { error } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
    p_dokumentti_id: dok.id,
    p_lahde_tyyppi: dok.lahde_tyyppi,
    p_sitovuustaso: dok.sitovuustaso,
    p_otsikko: otsikko,
    p_ehdotus_id: null,
    p_kasittelija: KASITTELIJA,
  });
  if (error) throw error;
}

async function paivitaHelWfsOtsikot(sb: SupabaseClient, kuiva: boolean) {
  const { data, error } = await sb
    .from("dokumentit")
    .select("id, url, otsikko, lahde_tyyppi, sitovuustaso")
    .like("url", "https://kartta.hel.fi/ws/geoserver/%");
  if (error) throw error;
  for (const d of data ?? []) {
    if (!onHelsinkiAvoinWfsUrl(d.url)) continue;
    if (!d.otsikko.startsWith("https://kartta.hel.fi")) continue;
    const u = new URL(d.url);
    const tyyppi = u.searchParams.get("typeNames") ?? u.searchParams.get("typeName") ?? "WFS";
    const otsikko = `Helsingin avoin kartta-aineisto (${tyyppi})`;
    await paivitaDokumenttiOtsikko(sb, d.url, otsikko, kuiva);
  }
}

async function poistaDokumenttiJosOrpo(sb: SupabaseClient, url: string, kuiva: boolean) {
  const { data: dok } = await sb.from("dokumentit").select("id").eq("url", url).maybeSingle();
  if (!dok?.id) return;
  const { count: idRefs } = await sb
    .from("kentta_lahteet")
    .select("id", { count: "exact", head: true })
    .eq("dokumentti_id", dok.id)
    .neq("taulu", "dokumentit");
  const { count: urlRefs } = await sb
    .from("kentta_lahteet")
    .select("id", { count: "exact", head: true })
    .eq("lahde_url", url)
    .neq("taulu", "dokumentit");
  if ((idRefs ?? 0) > 0 || (urlRefs ?? 0) > 0) {
    console.warn("Ei poisteta, ulkoisia lähteitä:", url, idRefs, urlRefs);
    return;
  }
  if (kuiva) {
    console.log(`  [kuiva] DELETE dokumentti ${url}`);
    return;
  }
  const { error } = await sb.from("dokumentit").delete().eq("url", url);
  if (error) throw error;
  console.log("Poistettu dokumentti:", url);
}

async function asetaYvaAliasit(sb: SupabaseClient, kuiva: boolean) {
  const parit: Array<{ alias: string; kanoninen: string }> = [
    {
      alias: "https://www.ymparisto.fi/Sarvenmaan-datakeskus-YVA",
      kanoninen:
        "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/sarvenmaan-datakeskus-keminmaa",
    },
    {
      alias: "https://www.ymparisto.fi/Hyperco-datakeskus-Pyhajoki-YVA",
      kanoninen:
        "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/pyhajoen-datakeskus-pyhajoki",
    },
  ];
  for (const { alias, kanoninen } of parit) {
    const { data: kRow } = await sb.from("dokumentit").select("id").eq("url", kanoninen).maybeSingle();
    const { data: aRow } = await sb.from("dokumentit").select("id, kanoninen_dokumentti_id").eq("url", alias).maybeSingle();
    if (!kRow?.id || !aRow?.id) {
      console.warn("YVA-alias puuttuu:", alias);
      continue;
    }
    if (aRow.kanoninen_dokumentti_id === kRow.id) {
      console.log("YVA-alias jo kunnossa:", alias);
      continue;
    }
    if (kuiva) {
      console.log(`  [kuiva] kanoninen_dokumentti_id ${alias} → ${kRow.id}`);
      continue;
    }
    const { error } = await sb
      .from("dokumentit")
      .update({ kanoninen_dokumentti_id: kRow.id })
      .eq("id", aRow.id);
    if (error) throw error;
    console.log("YVA-alias:", alias);
  }
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  console.log("YVA-aliasit…");
  await asetaYvaAliasit(sb, kuiva);

  console.log("Lähteiden siirto…");
  let siirtoja = 0;
  for (const [vanha, uusi] of Object.entries(LAHDE_SIIRROT)) {
    siirtoja += await korvaaLahdeUrlit(sb, vanha, uusi, kuiva);
  }
  console.log(`Lähdesiirtoja: ${siirtoja}`);

  console.log("Otsikkokorjaukset…");
  for (const [url, otsikko] of Object.entries(OTSIKKO_KORJAUKSET)) {
    await paivitaDokumenttiOtsikko(sb, url, otsikko, kuiva);
  }
  await paivitaHelWfsOtsikot(sb, kuiva);

  console.log("Dokumenttien poisto…");
  for (const url of POISTETTAVAT_URLIT) {
    await poistaDokumenttiJosOrpo(sb, url, kuiva);
  }

  console.log(kuiva ? "Kuiva-ajo valmis." : "Valmis.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
