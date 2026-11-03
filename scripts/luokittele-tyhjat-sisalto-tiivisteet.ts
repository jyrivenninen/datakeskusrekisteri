/**
 * Luokittelee nollatut tyhjät sisalto_tiivisteet uudelleennoudolla.
 * Aja: npx tsx scripts/luokittele-tyhjat-sisalto-tiivisteet.ts [--kuiva] [--katto=N]
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { extractText } from "unpdf";
import { robotsSallii } from "../agents/tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://www.datakeskusrekisteri.fi/; dokumentit)";
const VIIVE_MS = Number(process.env.DOKUMENTIT_VIIVE_MS ?? "400");

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tasaa(teksti: string): string {
  return teksti.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

async function pdfTeksti(puskuri: Uint8Array): Promise<string> {
  const tulos = await extractText(puskuri, { mergePages: true });
  return tasaa(tulos.text);
}

function onPdf(muoto: string | null, tyyppi: string, url: string): boolean {
  if (muoto === "pdf") return true;
  if (tyyppi.includes("application/pdf")) return true;
  return url.toLowerCase().includes(".pdf");
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const kattoArg = process.argv.find((a) => a.startsWith("--katto="));
  const katto = kattoArg ? Number(kattoArg.slice("--katto=".length)) : 0;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  // Edellinen ajo epäonnistui unpdf:n irrottaessa puskurin ennen tiivistettä.
  const { data, error } = await sb
    .from("dokumentit")
    .select("id, url, otsikko, muoto")
    .eq("sisalto_nouto_syy", "tyhja_sisalto_nollattu")
    .is("sisalto_tiiviste", null)
    .order("id");
  if (error) throw new Error(error.message);

  const rivit = data ?? [];
  console.log(`Luokiteltavia: ${rivit.length}${kuiva ? " (kuiva)" : ""}`);

  const laskuri: Record<string, number> = {};
  const esimerkit: Record<string, string[]> = {};
  let i = 0;

  for (const dok of rivit) {
    if (katto > 0 && i >= katto) break;
    i += 1;
    let syy = "muu";
    try {
      let osoite: URL;
      try {
        osoite = new URL(dok.url);
      } catch {
        syy = "muu";
        throw new Error("virheellinen url");
      }
      if (!(await robotsSallii(osoite, USER_AGENT))) {
        syy = "robots";
      } else {
        const vastaus = await fetch(dok.url, {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,text/html,*/*" },
          signal: AbortSignal.timeout(45_000),
        });
        if (vastaus.status === 403) syy = "http_403";
        else if (vastaus.status === 429) syy = "http_429";
        else if (vastaus.status >= 400 && vastaus.status < 500) syy = "http_4xx";
        else if (vastaus.status >= 500) syy = "http_5xx";
        else {
          const puskuri = new Uint8Array(await vastaus.arrayBuffer());
          const tyyppi = (vastaus.headers.get("content-type") ?? "").toLowerCase();
          if (puskuri.byteLength === 0) {
            syy = "tyhja_sisalto";
          } else {
            // unpdf voi irrottaa ArrayBufferin — tavutiiviste ennen tekstiuuttoa.
            const tavutiiviste = createHash("sha256").update(puskuri).digest("hex");
            if (onPdf(dok.muoto, tyyppi, dok.url)) {
              const teksti = await pdfTeksti(puskuri);
              syy = teksti.length === 0 ? "skannattu_pdf" : "sisalto_loytyi";
            } else {
              syy = "sisalto_loytyi";
            }
            if (!kuiva) {
              const { error: e1 } = await sb.rpc("aseta_dokumentti_sisalto_tiiviste", {
                p_dokumentti_id: dok.id,
                p_sisalto_tiiviste: tavutiiviste,
              });
              if (e1) throw new Error(e1.message);
            }
          }
        }
      }
    } catch (e) {
      if (syy === "muu") syy = "nouto_virhe";
      console.error(dok.url, e instanceof Error ? e.message : e);
    }

    laskuri[syy] = (laskuri[syy] ?? 0) + 1;
    if (!esimerkit[syy]) esimerkit[syy] = [];
    if (esimerkit[syy]!.length < 3) {
      esimerkit[syy]!.push(`${dok.otsikko?.slice(0, 60) ?? "?"} | ${dok.url}`);
    }

    if (!kuiva && syy !== "sisalto_loytyi" && syy !== "skannattu_pdf") {
      const { error: e2 } = await sb.rpc("merkitse_dokumentti_sisalto_nouto_epaonnistui", {
        p_dokumentti_id: dok.id,
        p_syy: syy,
      });
      if (e2) throw new Error(e2.message);
    } else if (!kuiva && syy === "skannattu_pdf") {
      // Tavutiiviste asetettu; syy kirjataan huomautuksena erillisellä kentällä
      // vain jos tiivistettä ei ole. Skannatuille jätetään syy skannattu_pdf
      // ilman tiivisteen nollausta — merkitse nollaisi. Päivitä syy SQL:llä ei onnistu
      // service_rolella. Jätä skannattu_pdf ilman nouto_syy: tavutiiviste riittää;
      // raportissa syy näkyy laskurista.
    }

    if (i % 25 === 0) console.log(`… ${i}/${rivit.length}`, laskuri);
    await odota(VIIVE_MS);
  }

  console.log("\n=== Luokittelu ===");
  for (const [syy, n] of Object.entries(laskuri).sort((a, b) => b[1] - a[1])) {
    console.log(`${n}\t${syy}`);
    for (const e of esimerkit[syy] ?? []) console.log(`  · ${e}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
