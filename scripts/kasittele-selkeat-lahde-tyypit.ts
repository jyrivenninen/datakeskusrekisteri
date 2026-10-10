/**
 * Hyväksyy odottavat lahde_tyyppi_havainto -ehdotukset, joissa domain-sääntö on yhä sama
 * ja tyyppi on selkeä luokka (rekisteri, media, menetelma tai ymparisto.fi-viranomaisasiakirja).
 *
 * Aja: npx tsx scripts/kasittele-selkeat-lahde-tyypit.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import { ehdotaLahdeTyyppiUrlille, puraDomain } from "../src/lib/lahde-tyyppi-domain";

const KASITTELIJA = "yllapito:selkeat-domain-ehdotukset";

/** Automaattihyväksyntä vain näille; muu ja hankkeen_oma jäävät ihmiselle. */
const VARMA_TYYPIT = new Set<LahdeTyyppi>(["rekisteri", "media", "menetelma"]);

function varmaViranomaisasiakirja(url: string): boolean {
  const host = puraDomain(url);
  if (!host) return false;
  return host === "ymparisto.fi" || host.endsWith(".ymparisto.fi");
}

function onVarmaEhdotus(url: string, ehdotettu: LahdeTyyppi): boolean {
  const nykyinen = ehdotaLahdeTyyppiUrlille(url);
  if (nykyinen !== ehdotettu) return false;
  if (VARMA_TYYPIT.has(ehdotettu)) return true;
  if (ehdotettu === "viranomaisasiakirja" && varmaViranomaisasiakirja(url)) return true;
  return false;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const sivuKoko = 1000;
  const odottavat: Array<{ id: string; sisalto: EhdotusSisalto }> = [];
  for (let alku = 0; ; alku += sivuKoko) {
    const { data, error } = await sb
      .from("muutosehdotukset")
      .select("id, sisalto")
      .eq("tyyppi", "lahde_tyyppi_havainto")
      .eq("tila", "odottaa")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const rivi of data) {
      odottavat.push({ id: rivi.id, sisalto: rivi.sisalto as EhdotusSisalto });
    }
    if (data.length < sivuKoko) break;
  }

  let hyvaksytty = 0;
  let ohitettu = 0;
  const tyypit: Record<string, number> = {};

  for (const rivi of odottavat) {
    const meta = rivi.sisalto.lahde_metatiedot;
    if (!meta?.dokumentti_id || !meta.url) {
      ohitettu += 1;
      continue;
    }

    const ehdotettu = meta.ehdotettu_lahde_tyyppi as LahdeTyyppi;
    if (!onVarmaEhdotus(meta.url, ehdotettu)) {
      ohitettu += 1;
      continue;
    }

    const sitovuus =
      (meta.ehdotettu_sitovuustaso as string) || oletusSitovuustaso(ehdotettu);

    if (!kuiva) {
      const { error: rpcVirhe } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
        p_dokumentti_id: meta.dokumentti_id,
        p_lahde_tyyppi: ehdotettu,
        p_sitovuustaso: sitovuus,
        p_otsikko: null,
        p_ehdotus_id: rivi.id,
        p_kasittelija: KASITTELIJA,
      });
      if (rpcVirhe) throw new Error(`${meta.url}: ${rpcVirhe.message}`);
    }

    hyvaksytty += 1;
    tyypit[ehdotettu] = (tyypit[ehdotettu] ?? 0) + 1;
  }

  const { count: jaljella } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .eq("tyyppi", "lahde_tyyppi_havainto")
    .eq("tila", "odottaa");

  const { count: kasiteltyDok } = await sb
    .from("dokumentit")
    .select("id", { count: "exact", head: true })
    .not("lahde_metatiedot_kasitelty_pvm", "is", null);

  console.log(
    JSON.stringify(
      {
        kuiva,
        odottavia_alussa: odottavat.length,
        hyvaksytty,
        ohitettu,
        tyypit,
        lahde_tyyppi_ehdotuksia_jaljella: jaljella ?? null,
        dokumentteja_kasitelty: kasiteltyDok ?? null,
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
