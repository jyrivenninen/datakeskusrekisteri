/**
 * Mittaa MML-geokoodauslähteiden vaikutus kenttävarmistukseen ennen tyypin muutosta.
 * Aja: npx tsx scripts/mittaa-mml-geokoodaus-varmistus.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { lataaSitovuusHaku } from "../src/lib/faktakentta-sitovuus-lataus";
import type { LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import { onMmlGeokoodausUrl } from "../src/lib/lahde-geokoodaus-url";
import { tehokasLahdeTyyppi } from "../src/lib/lahde-tyyppi-domain";
import {
  onKenttaVarmistettu,
  VARMISTAVAT_LAHDE_TYYPIT,
  type KenttaLahdeTyyppiInfo,
} from "../src/lib/kentta-varmistus";

function nykyTyyppi(docTyypit: Map<string, LahdeTyyppi>, url: string): LahdeTyyppi {
  return tehokasLahdeTyyppi(docTyypit.get(url) ?? "muu", url);
}

function simuloituTyyppi(docTyypit: Map<string, LahdeTyyppi>, url: string): LahdeTyyppi {
  const nyky = docTyypit.get(url) ?? "muu";
  if (onMmlGeokoodausUrl(url) && nyky === "rekisteri") return "menetelma";
  return tehokasLahdeTyyppi(nyky, url);
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);

  const docTyypit = new Map<string, LahdeTyyppi>();
  for (let a = 0; ; a += 1000) {
    const { data } = await sb.from("dokumentit").select("url, lahde_tyyppi").range(a, a + 999);
    if (!data?.length) break;
    for (const d of data) docTyypit.set(d.url, d.lahde_tyyppi as LahdeTyyppi);
    if (data.length < 1000) break;
  }

  type Rivi = { url: string; tyyppiNyky: LahdeTyyppi; tyyppiSim: LahdeTyyppi };
  const kentat = new Map<string, Rivi[]>();

  for (let a = 0; ; a += 1000) {
    const { data } = await sb
      .from("kentta_lahteet")
      .select("taulu, rivi_id, kentta, lahde_url, tekninen_lahde")
      .range(a, a + 999);
    if (!data?.length) break;
    for (const r of data) {
      if (r.tekninen_lahde || !sitovuusMerkittaa(r.taulu, r.kentta)) continue;
      const avain = `${r.taulu}:${r.rivi_id}:${r.kentta}`;
      const lista = kentat.get(avain) ?? [];
      lista.push({
        url: r.lahde_url,
        tyyppiNyky: nykyTyyppi(docTyypit, r.lahde_url),
        tyyppiSim: simuloituTyyppi(docTyypit, r.lahde_url),
      });
      kentat.set(avain, lista);
    }
    if (data.length < 1000) break;
  }

  let nytVarmistettu = 0;
  let yksinMml = 0;
  let yksinMmlHankkeet = 0;
  let muuttuisi = 0;
  const hankkeetMuuttuisi = new Set<string>();

  for (const [avain, rivit] of kentat) {
    const nyky: KenttaLahdeTyyppiInfo[] = rivit.map((r) => ({
      lahde_tyyppi: r.tyyppiNyky,
      tekninen_lahde: false,
    }));
    const sim: KenttaLahdeTyyppiInfo[] = rivit.map((r) => ({
      lahde_tyyppi: r.tyyppiSim,
      tekninen_lahde: false,
    }));

    const varmistettuNyt = onKenttaVarmistettu(nyky);
    if (varmistettuNyt) nytVarmistettu += 1;

    const varmistavat = rivit.filter((r) =>
      (VARMISTAVAT_LAHDE_TYYPIT as readonly string[]).includes(r.tyyppiNyky),
    );
    const vainMml =
      varmistettuNyt &&
      varmistavat.length > 0 &&
      varmistavat.every((r) => onMmlGeokoodausUrl(r.url) && r.tyyppiNyky === "rekisteri");

    if (vainMml) {
      yksinMml += 1;
      if (avain.startsWith("hankkeet:")) yksinMmlHankkeet += 1;
    }

    if (varmistettuNyt && !onKenttaVarmistettu(sim)) {
      muuttuisi += 1;
      if (avain.startsWith("hankkeet:")) hankkeetMuuttuisi.add(avain.split(":")[1]!);
    }
  }

  const yhteensa = kentat.size;
  const prosenttiNyt = yhteensa > 0 ? Math.round((nytVarmistettu / yhteensa) * 1000) / 10 : 0;
  const prosenttiJalkeen =
    yhteensa > 0 ? Math.round(((nytVarmistettu - muuttuisi) / yhteensa) * 1000) / 10 : 0;

  console.log(
    JSON.stringify(
      {
        sitovuus_merkittaa_kenttia_yhteensa: yhteensa,
        varmistettu_nyt: nytVarmistettu,
        varmistettu_osuus_prosentti_nyt: prosenttiNyt,
        yksinomaisesti_mml_geokoodaus: yksinMml,
        yksinomaisesti_mml_geokoodaus_hankkeet_taulu: yksinMmlHankkeet,
        muuttuisi_varmistamattomaksi: muuttuisi,
        muuttuisi_hankkeita_lkm: hankkeetMuuttuisi.size,
        varmistettu_osuus_prosentti_simuloitu: prosenttiJalkeen,
        huomio:
          "MML-geokoodaus = maanmittauslaitos.fi + polku /geocoding/. WFS/taustakartta ei mukana.",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
