import {
  avoinDataJuuriUrl,
  avoinDataOtsikot,
  rakennaAvoinDataHanke,
  rakennaAvoinDataRekisteri,
} from "@/lib/avoin-data";
import { haeHanke, haeJulkaistutHankkeet } from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export async function GET(request: Request) {
  const { hankkeet, virhe } = await haeJulkaistutHankkeet();
  if (virhe) {
    return Response.json({ virhe }, { status: 503, headers: avoinDataOtsikot() });
  }

  const juuri = avoinDataJuuriUrl(request.url);
  const avoimet: NonNullable<ReturnType<typeof rakennaAvoinDataHanke>>[] = [];

  for (const lista of hankkeet) {
    const kysely = await haeHanke(lista.id);
    if (kysely.virhe || !kysely.hanke) continue;
    const rivi = rakennaAvoinDataHanke(kysely, juuri);
    if (rivi) avoimet.push(rivi);
  }

  return Response.json(rakennaAvoinDataRekisteri(avoimet, juuri), {
    headers: avoinDataOtsikot(),
  });
}
