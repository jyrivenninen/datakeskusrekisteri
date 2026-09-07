import {
  avoinDataJuuriUrl,
  avoinDataOtsikot,
  rakennaAvoinDataHanke,
  rakennaAvoinDataRekisteri,
} from "@/lib/avoin-data";
import { haeHanke, haeHankeOhjaus } from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ohjaus = await haeHankeOhjaus(id);
  if (ohjaus && ohjaus !== id) {
    const kohde = new URL(request.url);
    kohde.pathname = `/hankkeet/${ohjaus}/json`;
    return Response.redirect(kohde, 308);
  }

  const kysely = await haeHanke(id);
  if (kysely.virhe) {
    return Response.json({ virhe: kysely.virhe }, { status: 503, headers: avoinDataOtsikot() });
  }
  if (!kysely.hanke) {
    return Response.json({ virhe: "Hanketta ei löytynyt." }, { status: 404, headers: avoinDataOtsikot() });
  }

  const juuri = avoinDataJuuriUrl(request.url);
  const hanke = rakennaAvoinDataHanke(kysely, juuri);
  if (!hanke) {
    return Response.json({ virhe: "Hanketta ei löytynyt." }, { status: 404, headers: avoinDataOtsikot() });
  }

  return Response.json(
    {
      versio: "1",
      lisenssi: rakennaAvoinDataRekisteri([], juuri).lisenssi,
      ...hanke,
    },
    { headers: avoinDataOtsikot() },
  );
}
