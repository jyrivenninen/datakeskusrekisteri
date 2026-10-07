import { NextResponse, type NextRequest } from "next/server";

/** Supabase Auth -eväste (ei kutsu getUser:ia — turvallinen Edgessä). */
export function pyyntoNayttaaKirjautuneelta(request: NextRequest): boolean {
  return request.cookies.getAll().some((evaste) => evaste.name.includes("auth-token"));
}

/**
 * Ei kutsuta Supabase Authia täällä. Vercelin Edge-middleware aikakatkeaa,
 * jos getUser() jää odottamaan verkkoa.
 */
export function paivitaIstunto(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/yllapito") &&
    !pyyntoNayttaaKirjautuneelta(request)
  ) {
    const osoite = request.nextUrl.clone();
    osoite.pathname = "/kirjaudu";
    osoite.searchParams.set(
      "seuraava",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(osoite);
  }
  return NextResponse.next({ request });
}
