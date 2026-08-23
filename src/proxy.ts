import { NextResponse, type NextRequest } from "next/server";
import { paivitaIstunto } from "@/lib/supabase/istunto";

export function proxy(request: NextRequest) {
  return paivitaIstunto(request);
}

export const config = {
  matcher: ["/yllapito", "/yllapito/:path*"],
};
