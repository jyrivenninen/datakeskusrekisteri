import {
  avoinDataCsvOtsikot,
  avoinDataJuuriUrl,
  hankkeetCsv,
} from "@/lib/avoin-data";
import { haeAvoinDataHankkeet } from "@/lib/avoin-data-haku";

export const revalidate = 300;

export async function GET(request: Request) {
  const juuri = avoinDataJuuriUrl(request.url);
  const { hankkeet, virhe } = await haeAvoinDataHankkeet(juuri);
  if (virhe) {
    return new Response(virhe, { status: 503, headers: avoinDataCsvOtsikot() });
  }

  return new Response(hankkeetCsv(hankkeet), { headers: avoinDataCsvOtsikot() });
}
