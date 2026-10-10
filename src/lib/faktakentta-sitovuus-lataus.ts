import type { SupabaseClient } from "@supabase/supabase-js";
import seed from "@/data/faktakentta-sitovuus.json";
import {
  rakennaSitovuusHaku,
  type FaktakenttaSitovuusRivi,
} from "@/lib/faktakentta-sitovuus";

export async function lataaSitovuusHaku(palvelin?: SupabaseClient) {
  if (palvelin) {
    const { data, error } = await palvelin.from("faktakentta_sitovuus").select("taulu, kentta, luokka");
    if (!error && data?.length) {
      return rakennaSitovuusHaku(data as FaktakenttaSitovuusRivi[]);
    }
  }
  return rakennaSitovuusHaku(seed as FaktakenttaSitovuusRivi[]);
}
