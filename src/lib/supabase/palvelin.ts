import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { haeAjalla } from "@/lib/hae-ajalla";
import { supabaseJulkinenAvain, supabaseUrl } from "@/lib/supabase/ymparisto";

/**
 * Palvelinasiakas App Routerille.
 * Anon-avaimella on tuotannossa vain lukuoikeus julkaistuun tietoon (RLS, vaihe 2).
 */
export async function luoPalvelinAsiakas() {
  const evasteet = await cookies();

  return createServerClient(supabaseUrl(), supabaseJulkinenAvain(), {
    global: { fetch: haeAjalla },
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
          // setAll-kutsu Server Componentista voidaan ohittaa.
        }
      },
    },
  });
}

export async function haeKirjautunutKayttaja() {
  const supabase = await luoPalvelinAsiakas();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { user: null, supabase };
    return { user: data.user, supabase };
  } catch {
    return { user: null, supabase };
  }
}
