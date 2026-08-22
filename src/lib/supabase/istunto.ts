import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseJulkinenAvain, supabaseUrl } from "@/lib/supabase/ymparisto";

export async function paivitaIstunto(request: NextRequest) {
  let vastaus = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseJulkinenAvain(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(asetettavat) {
        asetettavat.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        vastaus = NextResponse.next({ request });
        asetettavat.forEach(({ name, value, options }) => {
          vastaus.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/yllapito") && !user) {
    const osoite = request.nextUrl.clone();
    osoite.pathname = "/kirjaudu";
    osoite.searchParams.set("seuraava", request.nextUrl.pathname);
    return NextResponse.redirect(osoite);
  }

  return vastaus;
}
