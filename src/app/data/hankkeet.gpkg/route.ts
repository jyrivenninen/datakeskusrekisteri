import { avoinDataGpkgOtsikot, avoinDataJuuriUrl } from "@/lib/avoin-data";
import { haeAvoinDataHankkeet } from "@/lib/avoin-data-haku";
import { rakennaHankkeetGeopackage } from "@/lib/geopackage";

export const revalidate = 300;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const juuri = avoinDataJuuriUrl(request.url);
  const { hankkeet, virhe } = await haeAvoinDataHankkeet(juuri);
  if (virhe) {
    return new Response(virhe, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const tiedosto = await rakennaHankkeetGeopackage(hankkeet);
  return new Response(Buffer.from(tiedosto), { headers: avoinDataGpkgOtsikot() });
}
