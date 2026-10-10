/**
 * Domain-sääntöjen lahde_tyyppi-ehdotukset muutosehdotukset-jonoon.
 * Aja: npm run agentti:lahde-tyypit [-- --kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";
import { oletusSitovuustaso } from "../../src/lib/lahde-metatiedot";
import { ehdotaLahdeTyyppiUrlille } from "../../src/lib/lahde-tyyppi-domain";

const EHDOTTAJA = "lahde_tyyppi_domain";

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const supabase = createClient(url, avain, { auth: { persistSession: false } });

  const urlMaara = new Map<string, number>();
  const sivuKoko = 1000;
  for (let alku = 0; ; alku += sivuKoko) {
    const { data, error } = await supabase
      .from("kentta_lahteet")
      .select("lahde_url")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const rivi of data) {
      if (!rivi.lahde_url) continue;
      urlMaara.set(rivi.lahde_url, (urlMaara.get(rivi.lahde_url) ?? 0) + 1);
    }
    if (data.length < sivuKoko) break;
  }

  const odottavatIdt = new Set<string>();
  for (let alku = 0; ; alku += sivuKoko) {
    const { data, error } = await supabase
      .from("muutosehdotukset")
      .select("sisalto")
      .eq("tyyppi", "lahde_tyyppi_havainto")
      .eq("tila", "odottaa")
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const rivi of data) {
      const meta = (rivi.sisalto as { lahde_metatiedot?: { dokumentti_id?: string } })
        ?.lahde_metatiedot;
      if (meta?.dokumentti_id) odottavatIdt.add(meta.dokumentti_id);
    }
    if (data.length < sivuKoko) break;
  }

  let kirjattu = 0;
  let ohitettu = 0;

  for (let alku = 0; ; alku += sivuKoko) {
    const { data: dokumentit, error } = await supabase
      .from("dokumentit")
      .select(
        "id, url, lahde_tyyppi, sitovuustaso, otsikko_automaattinen, lahde_metatiedot_kasitelty_pvm",
      )
      .range(alku, alku + sivuKoko - 1);
    if (error) throw new Error(error.message);
    if (!dokumentit?.length) break;

    for (const d of dokumentit) {
      if (d.lahde_metatiedot_kasitelty_pvm) {
        ohitettu += 1;
        continue;
      }
      if (odottavatIdt.has(d.id)) {
        ohitettu += 1;
        continue;
      }

      const ehdotus = ehdotaLahdeTyyppiUrlille(d.url);
      if (!ehdotus) {
        ohitettu += 1;
        continue;
      }

      const ehdotettuSitovuus = oletusSitovuustaso(ehdotus);
      if (
        d.lahde_tyyppi === ehdotus &&
        d.sitovuustaso === ehdotettuSitovuus
      ) {
        ohitettu += 1;
        continue;
      }

      const esiintymia = urlMaara.get(d.url) ?? 0;
      const huomautus = `Domain-sääntö ehdottaa lahde_tyyppi=${ehdotus}, sitovuustaso=${ehdotettuSitovuus}. Esiintymiä lähteissä: ${esiintymia}.`;

      if (!kuiva) {
        const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
          tyyppi: "lahde_tyyppi_havainto",
          hanke_id: null,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: d.url,
          huomautus,
          tila: "odottaa",
          sisalto: {
            kentat: {},
            lahde_metatiedot: {
              dokumentti_id: d.id,
              url: d.url,
              esiintymia,
              ehdotettu_lahde_tyyppi: ehdotus,
              ehdotettu_sitovuustaso: ehdotettuSitovuus,
              nykyinen_lahde_tyyppi: d.lahde_tyyppi,
              nykyinen_sitovuustaso: d.sitovuustaso,
              otsikko_automaattinen: d.otsikko_automaattinen,
            },
          },
        });
        if (lisaysVirhe) throw new Error(lisaysVirhe.message);
        odottavatIdt.add(d.id);
      }
      kirjattu += 1;
    }

    if (dokumentit.length < sivuKoko) break;
  }

  console.log(
    JSON.stringify(
      {
        kuiva,
        kirjattu_jonoon: kirjattu,
        ohitettu,
        odottavia_yhteensa: odottavatIdt.size,
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
