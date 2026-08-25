import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/ymparisto";

export function supabasePalvelinAvainAsetettu(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type YllapitoHanke = { id: string; nimi: string; kunta: string | null };

/** Ylläpidon lukuhaku: palvelinavain ohittaa julkaistu-RLS:n. */
export async function haeHankkeetYllapitoon(
  idt: string[],
): Promise<YllapitoHanke[]> {
  if (idt.length === 0 || !supabasePalvelinAvainAsetettu()) return [];
  const { data } = await luoYllapitoAsiakas()
    .from("hankkeet")
    .select("id, nimi, kunta")
    .in("id", idt);
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
