/**
 * Hyväksyy LS13 erien 2 ja 3 sama-arvoiset lähdevahvistukset.
 * Koneellinen lainaustarkistus on pakollinen: epäonnistuneet jäävät jonoon.
 *
 * Aja: npx tsx scripts/hyvaksy-lahdeselvitys13-era23-vahvistus.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { tarkistaEraEhdotusKentat } from "../src/lib/ls13-era-portti";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const TUNNISTEET = [
  "lahdeselvitys13_era2_vahvistus",
  "lahdeselvitys13_era3_vahvistus",
];

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus, ehdottaja_tunniste, sisalto")
    .in("ehdottaja_tunniste", TUNNISTEET)
    .eq("tila", "odottaa")
    .eq("tyyppi", "taydennys")
    .order("ehdottaja_tunniste")
    .order("luotu_pvm");
  if (error) throw new Error(error.message);

  const jonossa = data ?? [];
  const eraan: typeof jonossa = [];
  const yksittain: {
    id: string;
    tunniste: string;
    huomautus: string | null;
    syy: string;
  }[] = [];
  for (const rivi of jonossa) {
    const sisalto = rivi.sisalto as EhdotusSisalto;
    const portti = tarkistaEraEhdotusKentat(sisalto?.kentat ?? {});
    if (!portti.ok) {
      yksittain.push({
        id: rivi.id as string,
        tunniste: rivi.ehdottaja_tunniste as string,
        huomautus: rivi.huomautus as string | null,
        syy: `${portti.kentta}: ${portti.syy}`,
      });
      continue;
    }
    eraan.push(rivi);
  }

  const ryhmittain = new Map<string, number>();
  for (const r of eraan) {
    const t = r.ehdottaja_tunniste as string;
    ryhmittain.set(t, (ryhmittain.get(t) ?? 0) + 1);
  }
  console.log(
    JSON.stringify(
      {
        jonossa: jonossa.length,
        eraan: Object.fromEntries(ryhmittain),
        eraan_yht: eraan.length,
        yksittain: yksittain.length,
        yksittain_rivit: yksittain,
      },
      null,
      2,
    ),
  );

  let ok = 0;
  let virhe = 0;
  for (const rivi of eraan) {
    if (kuiva) {
      console.log("[kuiva]", rivi.ehdottaja_tunniste, rivi.huomautus);
      continue;
    }
    try {
      await hyvaksyMuutosehdotus(rivi.id as string, KASITTELIJA);
      ok += 1;
      console.log("ok", rivi.huomautus);
    } catch (e) {
      virhe += 1;
      console.error("virhe", rivi.id, rivi.huomautus, e);
    }
  }
  console.log({ ok, virhe, kuiva, ohitettu_yksittain: yksittain.length });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
