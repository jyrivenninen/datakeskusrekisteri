import { avoinDataJuuriUrl, avoinDataOtsikot } from "@/lib/avoin-data";
import { rakennaKuntaJson } from "@/lib/kunta-syote";
import {
  haeKaikkiJulkaistutMuutokset,
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
    return Response.json({ virhe: kuntaVirhe }, { status: 503, headers: avoinDataOtsikot() });
  }
  if (!kunta) {
    return Response.json({ virhe: "Kuntaa ei löydy." }, { status: 404, headers: avoinDataOtsikot() });
  }

  const [{ muutokset, virhe: muutosVirhe }, { maaraajat, virhe: maaraajaVirhe }] =
    await Promise.all([
      haeKaikkiJulkaistutMuutokset({ kunta: kunta.nimi }),
      haeTulevatMaaraajat({ kunta: kunta.nimi, raja: 500 }),
    ]);
  if (muutosVirhe || maaraajaVirhe) {
    return Response.json(
      { virhe: muutosVirhe ?? maaraajaVirhe },
      { status: 503, headers: avoinDataOtsikot() },
    );
  }

  return Response.json(
    rakennaKuntaJson(kunta, muutokset, maaraajat, avoinDataJuuriUrl(request.url)),
    { headers: avoinDataOtsikot() },
  );
}
