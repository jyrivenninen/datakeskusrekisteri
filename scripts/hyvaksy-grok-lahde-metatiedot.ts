/**
 * Hyväksyy Grok-lähdeselvityksen lahde_tyyppi_havainnot dokumenttien metatiedoiksi.
 * Alajarvi.fi ajankohtaista → muu (projektisääntö).
 *
 * Aja: npx tsx scripts/hyvaksy-grok-lahde-metatiedot.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { noudaDokumenttiTeksti } from "../agents/dokumentti-teksti";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";

const KASITTELIJA = "agentti:grok-lahde-metatiedot-hyvaksynta";
const EHDOTTAJA = "grok_lahdeselvitys_2026-10-10";

function korjaaTyyppi(url: string, ehdotettu: LahdeTyyppi): LahdeTyyppi {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "alajarvi.fi" || host.endsWith(".alajarvi.fi")) return "muu";
  } catch {
    /* jatka */
  }
  return ehdotettu;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: rivit, error } = await sb
    .from("muutosehdotukset")
    .select("id, lahde_url, sisalto")
    .eq("tyyppi", "lahde_tyyppi_havainto")
    .eq("tila", "odottaa")
    .eq("ehdottaja_tunniste", EHDOTTAJA);
  if (error) throw new Error(error.message);

  let hyvaksytty = 0;
  let ohitettu = 0;
  const ongelmat: string[] = [];

  for (const rivi of rivit ?? []) {
    const meta = (rivi.sisalto as EhdotusSisalto).lahde_metatiedot;
    if (!meta?.dokumentti_id) {
      ohitettu += 1;
      continue;
    }

    const nouto = await noudaDokumenttiTeksti(rivi.lahde_url);
    if (nouto.tila >= 400) {
      ongelmat.push(`${rivi.lahde_url}: HTTP ${nouto.tila}`);
      ohitettu += 1;
      continue;
    }
    if (nouto.merkkimaara < 80) {
      ongelmat.push(`${rivi.lahde_url}: liian vähän tekstiä (${nouto.merkkimaara})`);
      ohitettu += 1;
      continue;
    }

    const lahdeTyyppi = korjaaTyyppi(rivi.lahde_url, meta.ehdotettu_lahde_tyyppi as LahdeTyyppi);
    const sitovuus =
      lahdeTyyppi === "muu"
        ? "epavirallinen"
        : (meta.ehdotettu_sitovuustaso as string) || oletusSitovuustaso(lahdeTyyppi);
    const otsikko = meta.ehdotettu_otsikko?.trim() ?? "";

    if (!kuiva) {
      const { error: rpcVirhe } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
        p_dokumentti_id: meta.dokumentti_id,
        p_lahde_tyyppi: lahdeTyyppi,
        p_sitovuustaso: sitovuus,
        p_otsikko: otsikko,
        p_ehdotus_id: rivi.id,
        p_kasittelija: KASITTELIJA,
      });
      if (rpcVirhe) {
        ongelmat.push(`${rivi.lahde_url}: ${rpcVirhe.message}`);
        ohitettu += 1;
        continue;
      }
    }
    hyvaksytty += 1;
    console.log(`OK ${lahdeTyyppi} ${otsikko.slice(0, 60)}…`);
  }

  console.log(JSON.stringify({ kuiva, hyvaksytty, ohitettu, ongelmat }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
