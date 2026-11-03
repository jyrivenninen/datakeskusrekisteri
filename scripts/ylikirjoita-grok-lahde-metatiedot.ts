/**
 * Grok JSON -rivien tarkemmat metatiedot dokumentteihin (ylikirjoitus sallittu).
 * Aja: npx tsx scripts/ylikirjoita-grok-lahde-metatiedot.ts [--kuiva] [--tiedosto=agents/grok-lahdeselvitys-2026-10-10-b.json]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { noudaDokumenttiTeksti } from "../agents/dokumentti-teksti";
import { LAHDE_TYYPIT, oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";

const KASITTELIJA = "agentti:grok-ylikirjoitus";
const OLETUSTIEDOSTO = resolve(process.cwd(), "agents/grok-lahdeselvitys-2026-10-10-b.json");

type GrokRivi = {
  url: string;
  lahde_tyyppi: string;
  julkaisija: string;
  otsikko: string;
  julkaistu_pvm: string;
};

function korjaaTyyppi(url: string, tyyppi: LahdeTyyppi): LahdeTyyppi {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "alajarvi.fi" || host.endsWith(".alajarvi.fi")) return "muu";
    if (host.endsWith(".fi") && url.includes("/ajankohtaiset/") && !host.includes("oncloudos")) {
      const kuntaUutis = ["tuusula.fi", "akaa.fi", "sievi.fi", "mikseimikkeli.fi"];
      if (kuntaUutis.some((h) => host === h || host.endsWith(`.${h}`))) return "muu";
    }
  } catch {
    /* */
  }
  return tyyppi;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const polkuArg = process.argv.find((a) => a.startsWith("--tiedosto="));
  const polku = polkuArg ? polkuArg.slice("--tiedosto=".length) : OLETUSTIEDOSTO;
  if (!existsSync(polku)) throw new Error(`Puuttuu: ${polku}`);

  const aineisto = JSON.parse(readFileSync(polku, "utf8")) as {
    epavarmat_urlit?: string[];
    rivit: GrokRivi[];
  };
  const epavarmat = new Set((aineisto.epavarmat_urlit ?? []).map((u) => u.trim()));

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let kasitelty = 0;
  let ohitettu = 0;
  const manuaalinen: string[] = [];
  const virheet: string[] = [];

  for (const rivi of aineisto.rivit ?? []) {
    const url = rivi.url.trim();
    if (!url || epavarmat.has(url)) {
      ohitettu += 1;
      continue;
    }
    if (
      !rivi.lahde_tyyppi?.trim() ||
      !rivi.julkaisija?.trim() ||
      !rivi.otsikko?.trim() ||
      !rivi.julkaistu_pvm?.trim()
    ) {
      ohitettu += 1;
      continue;
    }
    if (!(LAHDE_TYYPIT as readonly string[]).includes(rivi.lahde_tyyppi)) {
      ohitettu += 1;
      continue;
    }

    const { data: dok } = await sb
      .from("dokumentit")
      .select("id, lahde_tyyppi, sitovuustaso, otsikko, julkaisija, julkaistu_pvm")
      .eq("url", url)
      .maybeSingle();
    if (!dok) {
      virheet.push(`${url}: ei dokumenttia`);
      ohitettu += 1;
      continue;
    }

    try {
      const nouto = await noudaDokumenttiTeksti(url);
      if (nouto.tila >= 400) {
        virheet.push(`${url}: HTTP ${nouto.tila}`);
        ohitettu += 1;
        continue;
      }
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : String(syy);
      if (/liian suuri/i.test(viesti)) {
        manuaalinen.push(`${url} (${viesti})`);
        ohitettu += 1;
        continue;
      }
      virheet.push(`${url}: ${viesti}`);
      ohitettu += 1;
      continue;
    }

    const lahdeTyyppi = korjaaTyyppi(url, rivi.lahde_tyyppi as LahdeTyyppi);
    const sitovuus =
      lahdeTyyppi === "muu" ? "epavirallinen" : oletusSitovuustaso(lahdeTyyppi);

    if (!kuiva) {
      const { data: ehd, error: insVirhe } = await sb
        .from("muutosehdotukset")
        .insert({
          tyyppi: "lahde_tyyppi_havainto",
          hanke_id: null,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: "grok_ylikirjoitus",
          lahde_url: url,
          huomautus: "Grok-ylikirjoitus: tarkemmat bibliografiset metatiedot.",
          tila: "odottaa",
          sisalto: {
            kentat: {},
            lahde_metatiedot: {
              dokumentti_id: dok.id,
              url,
              esiintymia: 0,
              ehdotettu_lahde_tyyppi: lahdeTyyppi,
              ehdotettu_sitovuustaso: sitovuus,
              nykyinen_lahde_tyyppi: dok.lahde_tyyppi,
              nykyinen_sitovuustaso: dok.sitovuustaso,
              otsikko_automaattinen: false,
              ehdotettu_otsikko: rivi.otsikko.trim(),
              ehdotettu_julkaisija: rivi.julkaisija.trim(),
              ehdotettu_julkaistu_pvm: rivi.julkaistu_pvm.trim(),
              lahde_selvitys: "grok_2026-10-10",
            },
          },
        })
        .select("id")
        .single();
      if (insVirhe || !ehd) {
        virheet.push(`${url}: ${insVirhe?.message ?? "ehdotus"}`);
        ohitettu += 1;
        continue;
      }
      const { error: rpcVirhe } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
        p_dokumentti_id: dok.id,
        p_lahde_tyyppi: lahdeTyyppi,
        p_sitovuustaso: sitovuus,
        p_otsikko: rivi.otsikko.trim(),
        p_ehdotus_id: ehd.id,
        p_kasittelija: KASITTELIJA,
      });
      if (rpcVirhe) {
        virheet.push(`${url}: ${rpcVirhe.message}`);
        ohitettu += 1;
        continue;
      }
    }

    kasitelty += 1;
    console.log(`OK ${lahdeTyyppi} ${rivi.otsikko.slice(0, 55)}…`);
  }

  console.log(JSON.stringify({ kuiva, kasitelty, ohitettu, manuaalinen, virheet }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
