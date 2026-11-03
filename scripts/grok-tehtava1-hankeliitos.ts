/**
 * Grok-lähdeselvitys 10.10.2026 — tehtävä 1: kolme hankeliitosta (raportti).
 * Aja: npx tsx scripts/grok-tehtava1-hankeliitos.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const TAPAUKSET = [
  {
    avain: "nebius_mantsala",
    haku: ["Nebius", "Kapuli", "Mäntsälä"],
    urlVihje: "mantsalad10.oncloudos.com",
    kortteliOdotus: "2319",
  },
  {
    avain: "fugen_toholampi",
    haku: ["Fu-Gen", "Toholampi", "Marjokangas", "Greensky"],
    urlVihje: "toholampi",
  },
  {
    avain: "hyperco_kouvola",
    haku: ["Hyperco", "Kouvola", "Voikkaa"],
    urlVihje: "kouvola.fi",
  },
] as const;

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const raportti: Record<string, unknown> = {};

  for (const tapaus of TAPAUKSET) {
    const avainTapaus = tapaus.avain;
    const hankkeetMap = new Map<string, Record<string, unknown>>();

    for (const sana of tapaus.haku) {
      const { data } = await sb
        .from("hankkeet")
        .select(
          "id, nimi, kunta, kortteli, kaavatunnus, toimija_organisaatio_id, vaihe, julkaistu",
        )
        .ilike("nimi", `%${sana}%`)
        .is("yhdistetty_kohde_id", null)
        .limit(20);
      for (const h of data ?? []) {
        hankkeetMap.set(h.id, h);
      }
    }

    const hankkeet = [...hankkeetMap.values()];
    const yksityiskohta = [];

    for (const h of hankkeet) {
      const hankeId = h.id as string;
      const { data: org } = h.toimija_organisaatio_id
        ? await sb
            .from("organisaatiot")
            .select("id, nimi, y_tunnus, verkko_osoite, verkkotunnus")
            .eq("id", h.toimija_organisaatio_id)
            .maybeSingle()
        : { data: null };

      const { data: lahteet } = await sb
        .from("kentta_lahteet")
        .select("kentta, lahde_url, lahde_sivu, luottamus, merkitty, lainaus, dokumentti_id")
        .eq("taulu", "hankkeet")
        .eq("rivi_id", hankeId)
        .order("kentta");

      const urlLahteet = (lahteet ?? []).filter((l) =>
        tapaus.urlVihje ? l.lahde_url?.includes(tapaus.urlVihje) : true,
      );

      yksityiskohta.push({
        hanke: h,
        toimija: org,
        kaikki_lahteet_lkm: lahteet?.length ?? 0,
        url_vihje_osumat: urlLahteet,
        toimija_organisaatio_lahteet: (lahteet ?? []).filter(
          (l) => l.kentta === "toimija_organisaatio_id",
        ),
      });
    }

    raportti[avainTapaus] = {
      hankkeita_loytyi: hankkeet.length,
      hankkeet: yksityiskohta,
    };
  }

  console.log(JSON.stringify(raportti, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
