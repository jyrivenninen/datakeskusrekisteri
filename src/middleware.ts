import { NextResponse, type NextRequest } from "next/server";
import { paivitaIstunto } from "@/lib/supabase/istunto";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";

export async function middleware(request: NextRequest) {
  if (!supabaseYmparistoAsetettu()) {
    return NextResponse.next();
  }
  return paivitaIstunto(request);
}

export const config = {
  matcher: ["/yllapito/:path*", "/kirjaudu"],
};
