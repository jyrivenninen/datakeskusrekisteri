/**
 * Supabase-ympäristömuuttujat.
 *
 * Nimet noudattavat Vercelin ja Supabasen integraation vakiota,
 * jotta avaimet voi kytkeä hallintapaneelista ilman koodimuutoksia.
 */

export function supabaseYmparistoAsetettu(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL puuttuu. Lisää se tiedostoon .env.local.",
    );
  }
  return url;
}

export function supabaseJulkinenAvain(): string {
  const avain = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY puuttuu. Lisää se tiedostoon .env.local.",
    );
  }
  return avain;
}
