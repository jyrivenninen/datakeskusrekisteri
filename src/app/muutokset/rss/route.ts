import { avoinDataJuuriUrl } from "@/lib/avoin-data";
import { RSS_MAARA, rakennaMuutoksetRss } from "@/lib/muutos-naytto";
import { haeJulkaistutMuutokset } from "@/lib/supabase/kyselyt";

export const revalidate = 300;

export async function GET(request: Request) {
  const { muutokset, virhe } = await haeJulkaistutMuutokset({ raja: RSS_MAARA });
  if (virhe) {
    return new Response(virhe, { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const xml = rakennaMuutoksetRss(muutokset, avoinDataJuuriUrl(request.url));
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
