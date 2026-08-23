import { NextResponse } from "next/server";
import { haeHanke } from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { hanke, asiakirjat, virhe } = await haeHanke(id);

  if (virhe) {
    return NextResponse.json({ virhe }, { status: 503 });
  }
  if (!hanke) {
    return NextResponse.json({ virhe: "Hanketta ei löytynyt." }, { status: 404 });
  }

  return NextResponse.json(
    {
      hanke_id: hanke.id,
      hanke_nimi: hanke.nimi,
      asiakirjat: asiakirjat.map((asiakirja) => ({
        id: asiakirja.id,
        url: asiakirja.url,
        otsikko: asiakirja.otsikko,
        laji: asiakirja.laji,
        muoto: asiakirja.muoto,
        kieli: asiakirja.kieli,
        julkaisija: asiakirja.julkaisija,
        julkaistu_pvm: asiakirja.julkaistu_pvm,
        tunnus: asiakirja.tunnus,
        sivumaara: asiakirja.sivumaara,
        menettely_id: asiakirja.menettely_id,
        kattaa: asiakirja.kattaa,
      })),
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
