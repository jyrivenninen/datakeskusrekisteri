import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/ymparisto";

export function supabasePalvelinAvainAsetettu(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type YllapitoHanke = {
  id: string;
  nimi: string;
  kunta: string | null;
  vaihe?: string;
  julkaistu?: boolean;
  yhdistetty_kohde_id?: string | null;
  poistettu_perustelu?: string | null;
  poistettu_pvm?: string | null;
  poistettu_kasittelija?: string | null;
};

/** Ylläpidon lukuhaku: palvelinavain ohittaa julkaistu-RLS:n. */
export async function haeHankkeetYllapitoon(
  idt: string[],
): Promise<YllapitoHanke[]> {
  if (idt.length === 0 || !supabasePalvelinAvainAsetettu()) return [];
  const { data } = await luoYllapitoAsiakas()
    .from("hankkeet")
    .select("id, nimi, kunta, vaihe, julkaistu, yhdistetty_kohde_id")
    .in("id", idt);
  return data ?? [];
}

/** Julkaisemattomat luonnokset (ei duplikaatteja eikä yhdistettyjä). */
export async function haeJulkaisemattomatHankkeet(): Promise<YllapitoHanke[]> {
  if (!supabasePalvelinAvainAsetettu()) return [];
  const { data } = await luoYllapitoAsiakas()
    .from("hankkeet")
    .select("id, nimi, kunta, vaihe, julkaistu")
    .eq("julkaistu", false)
    .is("yhdistetty_kohde_id", null)
    .order("paivitetty_pvm", { ascending: false });
  return data ?? [];
}

/** Poistetut / duplikaatit / yhdistetyt (julkaistu = false, kohde asetettu). */
export async function haePoistetutHankkeet(): Promise<YllapitoHanke[]> {
  if (!supabasePalvelinAvainAsetettu()) return [];
  const { data } = await luoYllapitoAsiakas()
    .from("hankkeet")
    .select(
      "id, nimi, kunta, vaihe, julkaistu, yhdistetty_kohde_id, poistettu_perustelu, poistettu_pvm, poistettu_kasittelija",
    )
    .eq("julkaistu", false)
    .not("yhdistetty_kohde_id", "is", null)
    .order("poistettu_pvm", { ascending: false, nullsFirst: false })
    .order("paivitetty_pvm", { ascending: false });
  return data ?? [];
}

/** Kohteet duplikaattimerkinnän valintalistalle. */
export async function haeHankkeetDuplikaattiKohteet(): Promise<
  Pick<YllapitoHanke, "id" | "nimi" | "kunta">[]
> {
  if (!supabasePalvelinAvainAsetettu()) return [];
  const { data } = await luoYllapitoAsiakas()
    .from("hankkeet")
    .select("id, nimi, kunta")
    .is("yhdistetty_kohde_id", null)
    .order("nimi", { ascending: true });
  return data ?? [];
}

/** Vain palvelintoiminnot. Älä tuo selainkoodiin. */
export function luoYllapitoAsiakas() {
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!avain) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY puuttuu. Lisää se tiedostoon .env.local ja Verceliin.",
    );
  }
  return createClient(supabaseUrl(), avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
