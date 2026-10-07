import { type NextRequest } from "next/server";
import { paivitaIstunto } from "@/lib/supabase/istunto";
import { kirjaaSivukatseluTaustalla, pitaaKirjataSivukatselu } from "@/lib/sivukatselu";

export function proxy(request: NextRequest) {
  if (pitaaKirjataSivukatselu(request)) {
    kirjaaSivukatseluTaustalla(request.nextUrl.pathname);
  }
  return paivitaIstunto(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|css|js|map|csv|gpkg)$).*)",
  ],
};
