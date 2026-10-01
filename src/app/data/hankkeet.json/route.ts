import {
  avoinDataJuuriUrl,
  avoinDataOtsikot,
  rakennaAvoinDataRekisteri,
} from "@/lib/avoin-data";
import { haeAvoinDataHankkeet } from "@/lib/avoin-data-haku";

export const revalidate = 300;

export async function GET(request: Request) {
  const juuri = avoinDataJuuriUrl(request.url);
  const { hankkeet, virhe } = await haeAvoinDataHankkeet(juuri);
  if (virhe) {
    return Response.json({ virhe }, { status: 503, headers: avoinDataOtsikot() });
  }

  return Response.json(rakennaAvoinDataRekisteri(hankkeet, juuri), {
    headers: avoinDataOtsikot(),
  });
}
