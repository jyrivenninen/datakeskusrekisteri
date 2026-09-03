import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "./ymparisto";

/**
 * Supabase-asiakas agentti-roolilla (Grok, ulkoiset ajot).
 * PostgREST vaatii anon-avaimen `apikey`-headeriin ja agentti-JWT:n
 * `Authorization: Bearer` -headeriin. Pelkkä agentti-JWT antaa 401 Invalid API key.
 */
export function luoAgenttiAsiakas(): SupabaseClient {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const agenttiJwt = process.env.SUPABASE_AGENTTI_KEY;
  if (!url || !anon || !agenttiJwt) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ja SUPABASE_AGENTTI_KEY tarvitaan. Luo JWT: npm run agentti:jwt. Älä liitä avaimia chattiin.",
    );
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${agenttiJwt}`,
      },
    },
  });
}
