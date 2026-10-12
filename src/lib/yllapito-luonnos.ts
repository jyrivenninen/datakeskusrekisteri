/**
 * Ylläpidon tilapäinen UI-tila tietokantaan (eväste ei riitä suurelle JSON:lle).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const VANHENEMINEN_S = 600;

export async function tallennaYllapitoLuonnos(
  supabase: SupabaseClient,
  kayttajaId: string,
  avain: string,
  sisalto: unknown,
): Promise<void> {
  const vanhenee = new Date(Date.now() + VANHENEMINEN_S * 1000).toISOString();
  const { error } = await supabase.from("yllapito_luonnokset").upsert(
    {
      kayttaja_id: kayttajaId,
      avain,
      sisalto,
      vanhenee_pvm: vanhenee,
      luotu_pvm: new Date().toISOString(),
    },
    { onConflict: "kayttaja_id,avain" },
  );
  if (error) throw new Error(`Luonnoksen tallennus epäonnistui: ${error.message}`);
}

export async function haeYllapitoLuonnos<T>(
  supabase: SupabaseClient,
  kayttajaId: string,
  avain: string,
): Promise<T | null> {
  const { data, error } = await supabase
    .from("yllapito_luonnokset")
    .select("sisalto, vanhenee_pvm")
    .eq("kayttaja_id", kayttajaId)
    .eq("avain", avain)
    .maybeSingle();
  if (error) throw new Error(`Luonnoksen luku epäonnistui: ${error.message}`);
  if (!data) return null;
  if (new Date(data.vanhenee_pvm).getTime() < Date.now()) {
    await poistaYllapitoLuonnos(supabase, kayttajaId, avain);
    return null;
  }
  return data.sisalto as T;
}

export async function poistaYllapitoLuonnos(
  supabase: SupabaseClient,
  kayttajaId: string,
  avain: string,
): Promise<void> {
  const { error } = await supabase
    .from("yllapito_luonnokset")
    .delete()
    .eq("kayttaja_id", kayttajaId)
    .eq("avain", avain);
  if (error) throw new Error(`Luonnoksen poisto epäonnistui: ${error.message}`);
}
