import { luoYllapitoAsiakas, supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

export type VanhentunutKentta = {
  laji: "lahde" | "tarkistus";
  hanke_id: string;
  hanke_nimi: string;
  kentta: string;
  vahvistettu_pvm: string;
  lahde_url: string | null;
  luottamus: string | null;
  merkitty: string | null;
  huomautus: string | null;
};

const OLETUS_KUUKAUTTA = 6;

/** Julkaistujen hankkeiden vanhentuneet lähteet ja kenttätarkistukset. */
export async function haeVanhentuneetKentat(
  kuukautta = OLETUS_KUUKAUTTA,
): Promise<VanhentunutKentta[]> {
  if (!supabasePalvelinAvainAsetettu()) return [];
  const { data, error } = await luoYllapitoAsiakas().rpc("vanhentuneet_kentat", {
    p_kuukautta: kuukautta,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as VanhentunutKentta[];
}

export { OLETUS_KUUKAUTTA as VANHENTUNUT_KUUKAUTTA_OLETUS };
