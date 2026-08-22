import { createBrowserClient } from "@supabase/ssr";
import { supabaseJulkinenAvain, supabaseUrl } from "@/lib/supabase/ymparisto";

/** Selainasiakas. Älä käytä palvelinrenderöidyillä sivuilla. */
export function luoSelainAsiakas() {
  return createBrowserClient(supabaseUrl(), supabaseJulkinenAvain());
}
