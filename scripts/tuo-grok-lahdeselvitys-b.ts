/**
 * Grok-lähdeselvitys 10.10.2026 — osa B: yksiselitteiset rivit → lahde_tyyppi_havainto-jonoon.
 *
 * Odotettu tiedosto (JSON):
 *   agents/data/grok-lahdeselvitys-2026-10-10-b.json
 *
 * Muoto:
 * {
 *   "epavarmat_urlit": ["https://..."],
 *   "rivit": [
 *     {
 *       "url": "https://...",
 *       "lahde_tyyppi": "viranomaisasiakirja",
 *       "julkaisija": "...",
 *       "otsikko": "...",
 *       "julkaistu_pvm": "2026-05-11"
 *     }
 *   ]
 * }
 *
 * Aja: npx tsx scripts/tuo-grok-lahdeselvitys-b.ts [--kuiva] [--tiedosto polku]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { LAHDE_TYYPIT, oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";

const OLETUSTIEDOSTO = resolve(
  process.cwd(),
  "agents/data/grok-lahdeselvitys-2026-10-10-b.json",
);

type GrokRivi = {
  url: string;
  lahde_tyyppi: string;
  julkaisija: string;
  otsikko: string;
  julkaistu_pvm: string;
};

type GrokAineisto = {
  epavarmat_urlit?: string[];
  rivit: GrokRivi[];
};

function normalisoiUrl(u: string): string {
  return u.trim();
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const salliKasitelty = process.argv.includes("--salli-kasitelty");
  const korvaaOdottava = process.argv.includes("--korvaa-odottava");
  const polkuArg = process.argv.find((a) => a.startsWith("--tiedosto="));
  const polku = polkuArg ? polkuArg.slice("--tiedosto=".length) : OLETUSTIEDOSTO;
  const ehdottajaArg = process.argv.find((a) => a.startsWith("--ehdottaja="));
  const ehdottaja = ehdottajaArg?.slice("--ehdottaja=".length) ?? "grok_lahdeselvitys_2026-10-10";
  const selvitysArg = process.argv.find((a) => a.startsWith("--lahde_selvitys="));
  const lahdeSelvitys = selvitysArg?.slice("--lahde_selvitys=".length) ?? "grok_2026-10-10";

  if (!existsSync(polku)) {
    console.log(
      JSON.stringify(
        {
          virhe: "Aineistotiedosto puuttuu",
          odotettu: polku,
          tuotu: 0,
          jätetty_epavarma: 0,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const aineisto = JSON.parse(readFileSync(polku, "utf8")) as GrokAineisto;
  const epavarmat = new Set(
    (aineisto.epavarmat_urlit ?? []).map(normalisoiUrl).filter(Boolean),
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  let tuotu = 0;
  let paivitetty = 0;
  let jätettyEpavarma = 0;
  let ohitettuPuute = 0;
  let ohitettuEiDok = 0;

  for (const rivi of aineisto.rivit ?? []) {
    const docUrl = normalisoiUrl(rivi.url);
    if (!docUrl || epavarmat.has(docUrl)) {
      jätettyEpavarma += 1;
      continue;
    }
    const pakolliset = [rivi.lahde_tyyppi, rivi.julkaisija, rivi.otsikko, rivi.julkaistu_pvm];
    if (pakolliset.some((x) => !String(x ?? "").trim())) {
      ohitettuPuute += 1;
      continue;
    }
    if (!(LAHDE_TYYPIT as readonly string[]).includes(rivi.lahde_tyyppi)) {
      ohitettuPuute += 1;
      continue;
    }
    const tyyppi = rivi.lahde_tyyppi as LahdeTyyppi;
    const sitovuus = oletusSitovuustaso(tyyppi);

    const { data: dok } = await sb
      .from("dokumentit")
      .select("id, url, lahde_tyyppi, sitovuustaso, otsikko_automaattinen, lahde_metatiedot_kasitelty_pvm")
      .eq("url", docUrl)
      .maybeSingle();
    if (!dok) {
      ohitettuEiDok += 1;
      continue;
    }
    if (dok.lahde_metatiedot_kasitelty_pvm && !salliKasitelty) {
      ohitettuPuute += 1;
      continue;
    }

    const { data: odottaa } = await sb
      .from("muutosehdotukset")
      .select("id")
      .eq("tyyppi", "lahde_tyyppi_havainto")
      .eq("tila", "odottaa")
      .contains("sisalto", { lahde_metatiedot: { dokumentti_id: dok.id } })
      .limit(1);

    const huomautus = `Grok-lähdeselvitys (${ehdottaja}). Julkaisija: ${rivi.julkaisija.trim()}. Päiväys: ${rivi.julkaistu_pvm.trim()}.`;

    const metaSisalto = {
      kentat: {},
      lahde_metatiedot: {
        dokumentti_id: dok.id,
        url: docUrl,
        esiintymia: 0,
        ehdotettu_lahde_tyyppi: tyyppi,
        ehdotettu_sitovuustaso: sitovuus,
        nykyinen_lahde_tyyppi: dok.lahde_tyyppi,
        nykyinen_sitovuustaso: dok.sitovuustaso,
        otsikko_automaattinen: dok.otsikko_automaattinen,
        ehdotettu_otsikko: rivi.otsikko.trim(),
        ehdotettu_julkaisija: rivi.julkaisija.trim(),
        ehdotettu_julkaistu_pvm: rivi.julkaistu_pvm.trim(),
        lahde_selvitys: lahdeSelvitys,
      },
    };

    if (odottaa?.length && korvaaOdottava) {
      if (!kuiva) {
        const { error } = await sb
          .from("muutosehdotukset")
          .update({
            ehdottaja_tunniste: ehdottaja,
            lahde_url: docUrl,
            huomautus,
            sisalto: metaSisalto,
          })
          .eq("id", odottaa[0]!.id);
        if (error) throw new Error(error.message);
      }
      paivitetty += 1;
      continue;
    }

    if (odottaa?.length) {
      ohitettuPuute += 1;
      continue;
    }

    if (!kuiva) {
      const { error } = await sb.from("muutosehdotukset").insert({
        tyyppi: "lahde_tyyppi_havainto",
        hanke_id: null,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: ehdottaja,
        lahde_url: docUrl,
        huomautus,
        tila: "odottaa",
        sisalto: metaSisalto,
      });
      if (error) throw new Error(error.message);
    }
    tuotu += 1;
  }

  console.log(
    JSON.stringify(
      {
        kuiva,
        tiedosto: polku,
        tuotu,
        paivitetty_odottavaa: paivitetty,
        jätetty_epavarma: jätettyEpavarma,
        ohitettu_puute_tai_kasitelty: ohitettuPuute,
        ohitettu_ei_dokumenttia: ohitettuEiDok,
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
