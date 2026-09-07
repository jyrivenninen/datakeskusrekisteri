/**
 * Täydentää odottavien kuntahavaintojen sisalto.kunta.dokumentit Dynasty-asiasivuilta.
 *
 * Kuiva: KUIVA=1 npx tsx scripts/taydenna-kunta-havainto-dokumentit.ts
 * Yksi kunta: KUNTA=Kouvola npx tsx scripts/taydenna-kunta-havainto-dokumentit.ts
 */
import { createClient } from "@supabase/supabase-js";
import { haeKuntaDokumentit } from "../agents/lahteet/kunnat/sovittimet/dynasty";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";

const EHDOTTAJA = "scripts/taydenna-kunta-havainto-dokumentit";

function viiveMs(): number {
  const n = Number(process.env.KUNTA_DOKUMENTTI_VIIVE_MS ?? "500");
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function dokumentitPuuttuu(sisalto: EhdotusSisalto): boolean {
  const lista = sisalto.kunta?.dokumentit;
  return !Array.isArray(lista) || lista.length === 0;
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }

  const kuiva = process.env.KUIVA === "1";
  const kuntaSuodatin = process.env.KUNTA?.trim().toLowerCase() ?? "";
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, lahde_url, huomautus, sisalto")
    .eq("tyyppi", "kunta_havainto")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });
  if (error) throw new Error(error.message);

  const rivit = (data ?? []).filter((r) => {
    const sisalto = r.sisalto as EhdotusSisalto;
    if (!dokumentitPuuttuu(sisalto)) return false;
    if (!r.lahde_url?.trim()) return false;
    if (kuntaSuodatin) {
      const nimi = sisalto.kunta?.kunta_nimi?.trim().toLowerCase() ?? "";
      if (nimi !== kuntaSuodatin) return false;
    }
    return true;
  });

  console.log(
    `${EHDOTTAJA}: ${rivit.length} odottavaa havaintoa ilman asiakirjoja${kuiva ? " (kuiva)" : ""}.`,
  );

  let paivitetty = 0;
  let ohitettu = 0;

  for (const rivi of rivit) {
    const sisalto = rivi.sisalto as EhdotusSisalto;
    const kunta = sisalto.kunta;
    const asiaUrl = rivi.lahde_url as string;
    const otsikko = kunta?.otsikko ?? rivi.huomautus ?? rivi.id;

    let dokumentit;
    try {
      dokumentit = await haeKuntaDokumentit(asiaUrl);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "haku epäonnistui";
      console.warn(`  ohitetaan ${otsikko.slice(0, 50)}: ${viesti}`);
      ohitettu += 1;
      await odota(viiveMs());
      continue;
    }

    if (dokumentit.length === 0) {
      console.log(`  ei asiakirjoja: ${otsikko.slice(0, 60)}`);
      ohitettu += 1;
      await odota(viiveMs());
      continue;
    }

    const uusiSisalto: EhdotusSisalto = {
      ...sisalto,
      kentat: sisalto.kentat ?? {},
      kunta: kunta
        ? { ...kunta, dokumentit }
        : {
            kunta_id: "",
            kunta_nimi: "",
            jarjestelma: "",
            syote_url: "",
            otsikko: otsikko,
            kuvaus: null,
            alkoi: null,
            hakusana: "",
            hankkeita_kunnassa: 0,
            dokumentit,
          },
    };

    if (kuiva) {
      console.log(
        `  kuiva: ${otsikko.slice(0, 50)} → ${dokumentit.length} asiakirjaa`,
      );
      for (const dok of dokumentit) {
        console.log(`    · ${dok.otsikko}`);
      }
      paivitetty += 1;
      await odota(viiveMs());
      continue;
    }

    const { error: paivitysVirhe } = await sb
      .from("muutosehdotukset")
      .update({ sisalto: uusiSisalto })
      .eq("id", rivi.id)
      .eq("tila", "odottaa");
    if (paivitysVirhe) throw new Error(paivitysVirhe.message);

    console.log(
      `  päivitetty: ${otsikko.slice(0, 50)} · ${dokumentit.length} asiakirjaa`,
    );
    paivitetty += 1;
    await odota(viiveMs());
  }

  console.log(`${EHDOTTAJA}: ${paivitetty} täydennetty, ${ohitettu} ohitettu.`);
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
