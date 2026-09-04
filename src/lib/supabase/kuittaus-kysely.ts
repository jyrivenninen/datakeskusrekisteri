import {
  rakennaKuittausNakyma,
  type KuittausLahde,
  type KuittausNakymaRivi,
} from "@/lib/kuittaus";
import type { Hanke } from "@/lib/supabase/tietokanta";
import { luoYllapitoAsiakas, supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

export type KuittausNakymaTulos = {
  rivit: KuittausNakymaRivi[];
  hankeNimet: Map<string, string>;
  kunnat: string[];
  toimijat: string[];
  kentat: string[];
};

export async function haeKuittausNakyma(): Promise<KuittausNakymaTulos | null> {
  if (!supabasePalvelinAvainAsetettu()) return null;

  const palvelin = luoYllapitoAsiakas();
  const { data: lahteet } = await palvelin
    .from("kentta_lahteet")
    .select("rivi_id, kentta, luottamus, merkitty, lainaus, lahde_url")
    .eq("taulu", "hankkeet")
    .eq("merkitty", "koneen_ehdottama");

  const kuittausHankeIdt = [
    ...new Set((lahteet ?? []).map((l) => l.rivi_id).filter(Boolean)),
  ] as string[];

  if (kuittausHankeIdt.length === 0) {
    return { rivit: [], hankeNimet: new Map(), kunnat: [], toimijat: [], kentat: [] };
  }

  const { data: kuittausHankkeetData } = await palvelin
    .from("hankkeet")
    .select("*")
    .in("id", kuittausHankeIdt);
  const kuittausHankkeet = (kuittausHankkeetData ?? []) as Hanke[];

  const hankeNimet = new Map<string, string>();
  for (const h of kuittausHankkeet) hankeNimet.set(h.id, h.nimi);

  const orgIdt = [
    ...new Set(
      kuittausHankkeet
        .map((h) => h.toimija_organisaatio_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const orgNimet = new Map<string, string>();
  if (orgIdt.length > 0) {
    const { data: orgs } = await palvelin.from("organisaatiot").select("id, nimi").in("id", orgIdt);
    for (const org of orgs ?? []) orgNimet.set(org.id, org.nimi);
  }

  const { data: agenttiEhdotukset } = await palvelin
    .from("muutosehdotukset")
    .select("hanke_id, tyyppi, sisalto")
    .in("hanke_id", kuittausHankeIdt)
    .eq("ehdottaja_tyyppi", "agentti")
    .in("tyyppi", ["taydennys", "uusi_hanke", "korjaus"]);

  const rivit = rakennaKuittausNakyma(
    (lahteet ?? []) as KuittausLahde[],
    kuittausHankkeet,
    orgNimet,
    agenttiEhdotukset ?? [],
  );

  const kunnat = [...new Set(rivit.map((r) => r.kunta))].sort((a, b) => a.localeCompare(b, "fi"));
  const toimijat = [
    ...new Set(rivit.map((r) => r.toimija_nimi).filter((n): n is string => Boolean(n))),
  ].sort((a, b) => a.localeCompare(b, "fi"));
  const kentat = [...new Set(rivit.map((r) => r.lahde_kentta))].sort((a, b) =>
    a.localeCompare(b, "fi"),
  );

  return { rivit, hankeNimet, kunnat, toimijat, kentat };
}
