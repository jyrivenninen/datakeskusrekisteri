import {
  avoinDataCsvOtsikot,
  avoinDataJuuriUrl,
  hankkeetCsv,
  rakennaAvoinDataHanke,
} from "@/lib/avoin-data";
import { haeHanke, haeJulkaistutHankkeet } from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export async function GET(request: Request) {
  const { hankkeet, virhe } = await haeJulkaistutHankkeet();
  if (virhe) {
    return new Response(virhe, { status: 503, headers: avoinDataCsvOtsikot() });
  }

  const juuri = avoinDataJuuriUrl(request.url);
  const avoimet: NonNullable<ReturnType<typeof rakennaAvoinDataHanke>>[] = [];

  for (const lista of hankkeet) {
    const kysely = await haeHanke(lista.id);
    if (kysely.virhe || !kysely.hanke) continue;
    const rivi = rakennaAvoinDataHanke(kysely, juuri);
    if (rivi) avoimet.push(rivi);
  }

  return new Response(hankkeetCsv(avoimet), { headers: avoinDataCsvOtsikot() });
}
