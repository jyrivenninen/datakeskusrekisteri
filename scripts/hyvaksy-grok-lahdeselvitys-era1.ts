/**
 * Hyväksyy erän 1 jonot: laatijat + asiakirjat.
 * Epävarmat (grok_lahdeselvitys_era1_epavarma) jätetään odottamaan.
 *
 * Aja: npx tsx scripts/hyvaksy-grok-lahdeselvitys-era1.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const TUN_LAATIJA = "grok_lahdeselvitys_era1_laatijat";
const TUN_ASIAKIRJA = "grok_lahdeselvitys_era1_asiakirjat";

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: laatijat, error: lVirhe } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus")
    .eq("tyyppi", "hanke_organisaatio")
    .eq("tila", "odottaa")
    .eq("ehdottaja_tunniste", TUN_LAATIJA)
    .order("luotu_pvm");
  if (lVirhe) throw new Error(lVirhe.message);

  const { data: asiakirjat, error: aVirhe } = await sb
    .from("muutosehdotukset")
    .select("id, hanke_id, lahde_url, sisalto, huomautus")
    .eq("tyyppi", "kunta_havainto")
    .eq("tila", "odottaa")
    .eq("ehdottaja_tunniste", TUN_ASIAKIRJA)
    .order("luotu_pvm");
  if (aVirhe) throw new Error(aVirhe.message);

  console.log(`Laatijoita: ${(laatijat ?? []).length}, asiakirjoja: ${(asiakirjat ?? []).length}`);

  let laatijatOk = 0;
  for (const rivi of laatijat ?? []) {
    if (kuiva) {
      console.log("[kuiva] laatija", rivi.huomautus);
      continue;
    }
    await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA);
    laatijatOk += 1;
    console.log("ok laatija", rivi.huomautus);
  }

  let asiakirjatOk = 0;
  let asiakirjatVirhe = 0;
  for (const rivi of asiakirjat ?? []) {
    const sisalto = rivi.sisalto as {
      kunta?: {
        dokumentit?: Array<{ url?: string }>;
        grok_lahde_tyyppi?: string;
        grok_julkaisija?: string;
      };
    };
    const dokUrlit = (sisalto.kunta?.dokumentit ?? [])
      .map((d) => d.url?.trim())
      .filter((u): u is string => Boolean(u));
    const urlit =
      dokUrlit.length > 0
        ? dokUrlit
        : rivi.lahde_url
          ? [rivi.lahde_url as string]
          : [];

    if (kuiva) {
      console.log("[kuiva] asiakirja", rivi.lahde_url, "urlit", urlit.length);
      continue;
    }

    try {
      // lahde_tyyppi kirjoitetaan julkaise_kunta_havainto-RPC:ssä
      // (dokumentti.lahde_tyyppi / kunta.grok_lahde_tyyppi). Suora
      // dokumentit.UPDATE service_rolella ei onnistu (vain SELECT).
      await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA, {
        hanke_id: (rivi.hanke_id as string) ?? undefined,
        dokumentit_url: urlit,
      });
      asiakirjatOk += 1;
      console.log(
        "ok asiakirja",
        rivi.lahde_url,
        sisalto.kunta?.grok_lahde_tyyppi ?? "",
      );
    } catch (e) {
      asiakirjatVirhe += 1;
      console.error(
        "VIRHE asiakirja",
        rivi.lahde_url,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        kuiva,
        laatijat_hyvaksytty: laatijatOk,
        asiakirjat_hyvaksytty: asiakirjatOk,
        asiakirjat_virhe: asiakirjatVirhe,
        epavarmat_jatetaan: "grok_lahdeselvitys_era1_epavarma",
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
