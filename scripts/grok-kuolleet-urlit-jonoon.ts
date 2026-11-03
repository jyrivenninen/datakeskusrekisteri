/**
 * Grok-lähdeselvitys 10.10.2026 — tehtävä 3: vahvistetut kuolleet URL:t → linkki_rikki-jonoon.
 * Aja: npx tsx scripts/grok-kuolleet-urlit-jonoon.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const EHDOTTAJA = "grok_lahdeselvitys_2026-10-10";

const KUOLLEET: Array<{ url: string; http_tila: number; huomautus: string }> = [
  {
    url: "https://kartta.tuusula.fi/kaava_pdf/asemakaavat/kaavamaaraykset/3662.pdf",
    http_tila: 404,
    huomautus:
      "Grok 10.10.2026: 404. Kaava 3662 Vallunlenkki löytyy karttana (tuusula.oncloudos.com), ei määräys-PDF:nä.",
  },
  {
    url: "http://kevo.fi/2024/06/27/kemijarvea-lammitetaan-datakeskusten-hukkalammolla-syksystaalkaen/",
    http_tila: 404,
    huomautus: "Grok 10.10.2026: vahvistettu kuollut.",
  },
  {
    url: "http://www.bess-solutions-finland.fi/wp-content/uploads/2025/04/2026-02-18-Press-release.pdf",
    http_tila: 404,
    huomautus: "Grok 10.10.2026: vahvistettu kuollut.",
  },
];

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  let kirjattu = 0;
  let ohitettu = 0;

  for (const kohde of KUOLLEET) {
    const { data: odottaa } = await sb
      .from("muutosehdotukset")
      .select("id")
      .eq("tyyppi", "linkki_rikki")
      .eq("lahde_url", kohde.url)
      .eq("tila", "odottaa")
      .limit(1);
    if (odottaa?.length) {
      ohitettu += 1;
      continue;
    }

    const { data: lahteet } = await sb
      .from("kentta_lahteet")
      .select("taulu, rivi_id, kentta")
      .eq("lahde_url", kohde.url)
      .limit(1);

    const { data: dok } = await sb
      .from("dokumentit")
      .select("id, hanke_id")
      .eq("url", kohde.url)
      .maybeSingle();

    let hankeId: string | null = dok?.hanke_id ?? null;
    let taulu = "dokumentit";
    let riviId = dok?.id ?? "";
    let kentta = "url";

    if (lahteet?.[0]) {
      const l = lahteet[0];
      taulu = l.taulu;
      riviId = l.rivi_id;
      kentta = l.kentta;
      if (l.taulu === "hankkeet") hankeId = l.rivi_id;
      else if (!hankeId && l.taulu === "dokumentit") {
        const { data: d2 } = await sb
          .from("dokumentit")
          .select("hanke_id")
          .eq("id", l.rivi_id)
          .maybeSingle();
        hankeId = d2?.hanke_id ?? null;
      }
    }

    if (!riviId) {
      console.warn(`Ei riviä URL:lle: ${kohde.url}`);
      ohitettu += 1;
      continue;
    }

    if (!kuiva) {
      const { error } = await sb.from("muutosehdotukset").insert({
        tyyppi: "linkki_rikki",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: EHDOTTAJA,
        lahde_url: kohde.url,
        huomautus: kohde.huomautus,
        tila: "odottaa",
        sisalto: {
          kentat: {},
          linkki: {
            url: kohde.url,
            http_tila: kohde.http_tila,
            vaste_ms: 0,
            virhe: null,
            taulu,
            rivi_id: riviId,
            kentta,
          },
        },
      });
      if (error) throw new Error(error.message);
    }
    kirjattu += 1;
    console.log(`${kuiva ? "[kuiva] " : ""}jonoon: ${kohde.url} (hanke ${hankeId ?? "—"})`);
  }

  console.log(JSON.stringify({ kuiva, kirjattu, ohitettu }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
