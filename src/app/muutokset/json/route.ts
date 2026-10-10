import {
  avoinDataJuuriUrl,
  avoinDataOtsikot,
} from "@/lib/avoin-data";
import { rakennaMuutoksetJson } from "@/lib/muutos-naytto";
import { haeKaikkiJulkaistutMuutokset } from "@/lib/supabase/kyselyt";

export const revalidate = 300;

export async function GET(request: Request) {
  const juuri = avoinDataJuuriUrl(request.url);
  const { muutokset, virhe } = await haeKaikkiJulkaistutMuutokset();
  if (virhe) {
    return Response.json({ virhe }, { status: 503, headers: avoinDataOtsikot() });
  }
  return Response.json(rakennaMuutoksetJson(muutokset, juuri), {
    headers: avoinDataOtsikot(),
  });
}
