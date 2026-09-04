import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

/** Palauttaa kirjautuneen ylläpitäjän tai nullin. Ei ohjaa kirjautumiseen. */
export async function haeYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) return { user: null, supabase, nimi: null as string | null };
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id, nimi")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) return { user: null, supabase, nimi: null as string | null };
  return { user, supabase, nimi: data.nimi as string };
}

/** Ohjaa kirjautumiseen tai estää, jos ei ylläpito-oikeutta. */
export async function vaadiYllapitaja(seuraava = "/yllapito") {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) {
    redirect(`/kirjaudu?seuraava=${encodeURIComponent(seuraava)}`);
  }
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id, nimi")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) {
    redirect(`/kirjaudu?virhe=${encodeURIComponent("Ei ylläpito-oikeutta.")}`);
  }
  return { user, supabase, nimi: data.nimi as string };
}
