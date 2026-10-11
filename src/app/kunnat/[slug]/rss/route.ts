import { avoinDataJuuriUrl } from "@/lib/avoin-data";
import { rakennaKuntaRss, RSS_MAARA } from "@/lib/kunta-syote";
import {
  haeJulkaistutMuutokset,
  haeKuntaSlugilla,
  haeTulevatMaaraajat,
} from "@/lib/supabase/kyselyt";

export const revalidate = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { kunta, virhe: kuntaVirhe } = await haeKuntaSlugilla(slug);
  if (kuntaVirhe) {
    return new Response(kuntaVirhe, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (!kunta) {
    return new Response("Kuntaa ei löydy.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const [{ muutokset, virhe: muutosVirhe }, { maaraajat, virhe: maaraajaVirhe }] =
    await Promise.all([
      haeJulkaistutMuutokset({ kunta: kunta.nimi, raja: RSS_MAARA }),
      haeTulevatMaaraajat({ kunta: kunta.nimi, raja: RSS_MAARA }),
    ]);
  if (muutosVirhe || maaraajaVirhe) {
    return new Response(muutosVirhe ?? maaraajaVirhe ?? "Virhe", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const xml = rakennaKuntaRss(
    kunta,
    muutokset,
    maaraajat,
    avoinDataJuuriUrl(request.url),
  );
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
