/**
 * Täydentää hyväksytyistä kuntahavainnoista puuttuvat asiakirjat hankkeille.
 *
 * Kuiva: KUIVA=1 npx tsx scripts/korjaa-puuttuvat-kunta-dokumentit.ts
 * Yksi hanke: HANKE_ID=uuid npx tsx scripts/korjaa-puuttuvat-kunta-dokumentit.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";

const KASITTELIJA = "scripts/korjaa-puuttuvat-kunta-dokumentit";

type KuntaDokumentti = NonNullable<EhdotusSisalto["kunta"]>["dokumentit"] extends
  | (infer T)[]
  | undefined
  ? T
  : never;

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error("Supabase-avaimet puuttuvat.");
  }

  const kuiva = process.env.KUIVA === "1";
  const hankeSuodatin = process.env.HANKE_ID?.trim() ?? "";
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: ehdotukset, error } = await sb
    .from("muutosehdotukset")
    .select("id, hanke_id, lahde_url, sisalto, huomautus")
    .eq("tyyppi", "kunta_havainto")
    .eq("tila", "hyvaksytty")
    .not("hanke_id", "is", null);
  if (error) throw new Error(error.message);

  let lisatty = 0;
  let ohitettu = 0;

  for (const ehdotus of ehdotukset ?? []) {
    const hankeId = ehdotus.hanke_id as string;
    if (hankeSuodatin && hankeId !== hankeSuodatin) continue;

    const sisalto = ehdotus.sisalto as EhdotusSisalto;
    const dokumentit = sisalto.kunta?.dokumentit ?? [];
    if (dokumentit.length === 0) continue;

    const { data: olemassa } = await sb
      .from("dokumentit")
      .select("url")
      .eq("hanke_id", hankeId);
    const urlt = new Set((olemassa ?? []).map((d) => d.url));

    for (const dok of dokumentit as KuntaDokumentti[]) {
      if (urlt.has(dok.url)) {
        ohitettu += 1;
        continue;
      }

      const otsikko = dok.otsikko?.slice(0, 60) ?? dok.url;
      if (kuiva) {
        console.log(`kuiva: lisätään ${otsikko} → hanke ${hankeId.slice(0, 8)}…`);
        lisatty += 1;
        continue;
      }

      const { data: dokId, error: rpcVirhe } = await sb.rpc("lisaa_hanke_dokumentti", {
        p_hanke_id: hankeId,
        p_url: dok.url,
        p_otsikko: dok.otsikko,
        p_laji: dok.laji,
        p_muoto: dok.muoto ?? null,
        p_lahde_url: ehdotus.lahde_url,
        p_kasittelija: KASITTELIJA,
      });
      if (rpcVirhe) {
        throw new Error(`${otsikko}: ${rpcVirhe.message}`);
      }
      console.log(`lisätty: ${otsikko} (${String(dokId).slice(0, 8)}…)`);
      urlt.add(dok.url);
      lisatty += 1;
    }
  }

  console.log(`${KASITTELIJA}: ${lisatty} lisätty, ${ohitettu} jo olemassa${kuiva ? " (kuiva)" : ""}.`);
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
