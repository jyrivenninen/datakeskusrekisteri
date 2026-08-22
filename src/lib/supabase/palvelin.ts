import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseJulkinenAvain, supabaseUrl } from "@/lib/supabase/ymparisto";

/**
 * Palvelinasiakas App Routerille.
 * Anon-avaimella on tuotannossa vain lukuoikeus julkaistuun tietoon (RLS, vaihe 2).
 */
export async function luoPalvelinAsiakas() {
  const evasteet = await cookies();

  return createServerClient(supabaseUrl(), supabaseJulkinenAvain(), {
    cookies: {
      getAll() {
        return evasteet.getAll();
      },
      setAll(asetettavat) {
        try {
          asetettavat.forEach(({ name, value, options }) => {
            evasteet.set(name, value, options);
          });
        } catch {
          // setAll-kutsu Server Componentista voidaan ohittaa:
          // istuntoa ei vielä käytetä (kirjautuminen tulee vaiheessa 5).
        }
      },
    },
  });
}
