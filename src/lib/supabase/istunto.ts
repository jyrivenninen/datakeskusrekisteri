import { NextResponse, type NextRequest } from "next/server";

function onAuthEvaste(request: NextRequest): boolean {
  return request.cookies.getAll().some((evaste) => evaste.name.includes("auth-token"));
}

/**
 * Ei kutsuta Supabase Authia täällä. Vercelin Edge-middleware aikakatkeaa,
 * jos getUser() jää odottamaan verkkoa.
 */
export function paivitaIstunto(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/yllapito") &&
    !onAuthEvaste(request)
  ) {
    const osoite = request.nextUrl.clone();
    osoite.pathname = "/kirjaudu";
    osoite.searchParams.set("seuraava", request.nextUrl.pathname);
    return NextResponse.redirect(osoite);
  }
  return NextResponse.next({ request });
}
