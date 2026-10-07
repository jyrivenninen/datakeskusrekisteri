import type { NextRequest } from "next/server";

const BOT_KUVIO =
  /bot|crawler|spider|slurp|facebookexternalhit|preview|headless|curl|wget|python-requests|go-http-client/i;

/** Kirjataanko tämä GET-pyyntö sivulataukseksi. */
export function pitaaKirjataSivukatselu(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  const polku = request.nextUrl.pathname;
  if (!polku.startsWith("/")) return false;
  if (polku.startsWith("/_next") || polku.startsWith("/api")) return false;
  if (/\.(svg|png|jpe?g|gif|webp|ico|woff2?|css|js|map|json|csv|gpkg)$/i.test(polku)) {
    return false;
  }
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_KUVIO.test(ua)) return false;
  return true;
}

/** Taustakutsu Supabase-RPC:hen (Edge/proxy, ei odota vastausta). */
export function kirjaaSivukatseluTaustalla(polku: string): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !avain) return;

  const normalisoitu = polku.split(/[?#]/)[0] || "/";
  void fetch(`${url}/rest/v1/rpc/kirjaa_sivukatselu`, {
    method: "POST",
    headers: {
      apikey: avain,
      Authorization: `Bearer ${avain}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_polku: normalisoitu }),
  }).catch(() => {
    /* analytiikka ei saa estää sivua */
  });
}
