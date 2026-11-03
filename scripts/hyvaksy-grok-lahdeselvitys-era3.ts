/**
 * Hyväksyy erän 3 jonot. Aja: npx tsx scripts/hyvaksy-grok-lahdeselvitys-era3.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const TUNNISTEET = [
  "grok_lahdeselvitys_era3_laatijat_asiakirja",
  "grok_lahdeselvitys_era3_laatijat_pykala",
  "grok_lahdeselvitys_era3_asiakirjat",
  "grok_lahdeselvitys_era3_huomautus",
] as const;

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: rivit, error } = await sb
    .from("muutosehdotukset")
    .select("id, tyyppi, hanke_id, lahde_url, sisalto, huomautus, ehdottaja_tunniste")
    .eq("tila", "odottaa")
    .in("ehdottaja_tunniste", [...TUNNISTEET])
    .order("luotu_pvm");
  if (error) throw new Error(error.message);

  const raportti = {
    kuiva,
    laatijat_ok: 0,
    asiakirjat_ok: 0,
    asiakirjat_virhe: 0,
    huomautus_ok: 0,
    lahde_tyyppi_paatos: 0,
    lahde_tyyppi_viranomaisasiakirja: 0,
    lahde_tyyppi_hankkeen_oma: 0,
    lahde_tyyppi_muu_tai_puuttuu: 0,
  };

  const jarjestys = [...(rivit ?? [])].sort((a, b) => {
    const paino = (t: string) =>
      t.includes("laatijat") ? 0 : t.includes("huomautus") ? 1 : 2;
    return (
      paino(a.ehdottaja_tunniste as string) - paino(b.ehdottaja_tunniste as string)
    );
  });

  for (const rivi of jarjestys) {
    const tun = rivi.ehdottaja_tunniste as string;

    if (tun.includes("laatijat")) {
      if (kuiva) {
        console.log("[kuiva] laatija", rivi.huomautus);
        continue;
      }
      await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA);
      raportti.laatijat_ok += 1;
      console.log("ok laatija", rivi.huomautus);
      continue;
    }

    if (tun.includes("huomautus")) {
      if (kuiva) {
        console.log("[kuiva] huomautus", rivi.huomautus);
        continue;
      }
      await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA);
      raportti.huomautus_ok += 1;
      console.log("ok huomautus", rivi.huomautus);
      continue;
    }

    const sisalto = rivi.sisalto as {
      kunta?: {
        dokumentit?: Array<{ url?: string; lahde_tyyppi?: string }>;
        grok_lahde_tyyppi?: string;
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
      console.log("[kuiva] asiakirja", rivi.lahde_url);
      continue;
    }

    try {
      await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA, {
        hanke_id: (rivi.hanke_id as string) ?? undefined,
        dokumentit_url: urlit,
      });
      raportti.asiakirjat_ok += 1;
      for (const dokUrl of urlit) {
        const { data: dok } = await sb
          .from("dokumentit")
          .select("lahde_tyyppi")
          .eq("url", dokUrl)
          .maybeSingle();
        const t = dok?.lahde_tyyppi;
        if (t === "paatos") raportti.lahde_tyyppi_paatos += 1;
        else if (t === "viranomaisasiakirja")
          raportti.lahde_tyyppi_viranomaisasiakirja += 1;
        else if (t === "hankkeen_oma") raportti.lahde_tyyppi_hankkeen_oma += 1;
        else raportti.lahde_tyyppi_muu_tai_puuttuu += 1;
      }
      console.log("ok asiakirja", rivi.lahde_url);
    } catch (e) {
      raportti.asiakirjat_virhe += 1;
      console.error(
        "VIRHE",
        rivi.lahde_url,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(JSON.stringify(raportti, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
