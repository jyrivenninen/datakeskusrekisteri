/**
 * Analysoi kuittauslistaa. Aja: npx tsx scripts/analysoi-kuittaus.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { onKuittausTaydennys, rakennaKuittausNakyma } from "../src/lib/kuittaus";
import type { Hanke } from "../src/lib/supabase/tietokanta";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: lahteet } = await sb
    .from("kentta_lahteet")
    .select("rivi_id, kentta, luottamus, merkitty, lainaus, lahde_url")
    .eq("taulu", "hankkeet")
    .eq("merkitty", "koneen_ehdottama");

  const ids = [...new Set((lahteet ?? []).map((l) => l.rivi_id))];
  const { data: hankkeet } = ids.length
    ? await sb.from("hankkeet").select("*").in("id", ids)
    : { data: [] as Hanke[] };

  const orgIds = [
    ...new Set(
      (hankkeet ?? [])
        .map((h) => h.toimija_organisaatio_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: orgs } = orgIds.length
    ? await sb.from("organisaatiot").select("id, nimi").in("id", orgIds)
    : { data: [] };
  const orgNimet = new Map((orgs ?? []).map((o) => [o.id, o.nimi]));

  const { data: agentti } = ids.length
    ? await sb
        .from("muutosehdotukset")
        .select("hanke_id, tyyppi, sisalto, huomautus, tila")
        .in("hanke_id", ids)
        .eq("ehdottaja_tyyppi", "agentti")
        .in("tyyppi", ["taydennys", "uusi_hanke", "korjaus"])
    : { data: [] };

  const rivit = rakennaKuittausNakyma(lahteet ?? [], hankkeet ?? [], orgNimet, agentti ?? []);
  const tayd = rivit.filter(onKuittausTaydennys);

  const ennenAgenttiaLkm = new Map<string, number>();
  for (const r of rivit) {
    const avain = r.ennenAgenttia ?? "(puuttuu)";
    ennenAgenttiaLkm.set(avain, (ennenAgenttiaLkm.get(avain) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        lahteet: lahteet?.length ?? 0,
        rivit: rivit.length,
        taydennys: tayd.length,
        ennenAgenttia: Object.fromEntries(ennenAgenttiaLkm),
        agenttiEhdotuksia: agentti?.length ?? 0,
        agenttiTyhjatKentat: (agentti ?? []).filter(
          (e) => Object.keys((e.sisalto as { kentat?: Record<string, unknown> })?.kentat ?? {}).length === 0,
        ).length,
        puuttuuEsimerkki: rivit
          .filter((r) => !r.ennenAgenttia)
          .slice(0, 3)
          .map((r) => {
            const ehd = (agentti ?? []).filter((e) => e.hanke_id === r.hanke_id);
            return {
              kentta: r.lahde_kentta,
              hanke_id: r.hanke_id,
              agenttiEhdotuksia: ehd.length,
              ehdotukset: ehd.map((e) => ({
                tyyppi: e.tyyppi,
                tila: e.tila,
                kentat: Object.keys((e.sisalto as { kentat?: Record<string, unknown> })?.kentat ?? {}),
              })),
            };
          }),
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
