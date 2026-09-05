import type { Karttamerkki } from "@/komponentit/kartta";
import { FINGRID_TUOTANTO_DATASETIT, haeFingridTuotantoNyt } from "@/lib/fingrid";
import { ratkaiseMaakunta } from "@/lib/maakunta";
import { hankeTehoMw } from "@/lib/naytto";
import type { HankeSuodatus } from "@/lib/suodatus";
import { HANKE_VAIHEET, type HankeVaihe } from "@/lib/supabase/tietokanta";
import {
  haeJulkaistutHankkeet,
  haeKuntaMaakuntaKartta,
} from "@/lib/supabase/kyselyt";

export type KarttaTuotantoVertailu = {
  fingridMw: number;
  fingridPaivitetty: string;
  tuotantotyypit: { nimi: string; mw: number; lahde_url: string }[];
};

export type KarttaSivuData = {
  merkit: Karttamerkki[];
  tuotantoVertailu: KarttaTuotantoVertailu | null;
  vaiheLkm: Partial<Record<HankeVaihe, number>>;
  hankeVirhe: string | null;
};

export async function haeKarttaSivuData(suodatus: HankeSuodatus): Promise<KarttaSivuData> {
  const [{ hankkeet, johdot, virhe: hankeVirhe }, fingridTuotanto, kuntaMaakunnat] =
    await Promise.all([
      haeJulkaistutHankkeet(suodatus),
      haeFingridTuotantoNyt(),
      haeKuntaMaakuntaKartta(),
    ]);

  const merkit: Karttamerkki[] = hankkeet.flatMap((hanke) => {
    const alue = hanke.sijainti_alue?.type === "Polygon" ? hanke.sijainti_alue : null;
    const hankeJohdot = johdot
      .filter((johto) => johto.hanke_id === hanke.id && johto.reitti)
      .map((johto) => ({ id: johto.id, reitti: johto.reitti! }));
    if (
      hanke.sijainti_lat == null &&
      hanke.sijainti_lon == null &&
      !alue &&
      hankeJohdot.length === 0
    ) {
      return [];
    }
    return [
      {
        id: hanke.id,
        nimi: hanke.nimi,
        vaihe: hanke.vaihe,
        lat: hanke.sijainti_lat != null ? Number(hanke.sijainti_lat) : undefined,
        lon: hanke.sijainti_lon != null ? Number(hanke.sijainti_lon) : undefined,
        tehoMw: hankeTehoMw(hanke),
        maakunta: ratkaiseMaakunta(hanke.maakunta, hanke.kunta, kuntaMaakunnat).maakunta,
        alue,
        johdot: hankeJohdot,
      },
    ];
  });

  const tuotantoVertailu =
    fingridTuotanto?.kokonaistuotanto_mw != null
      ? {
          fingridMw: fingridTuotanto.kokonaistuotanto_mw,
          fingridPaivitetty: fingridTuotanto.paivitetty_pvm,
          tuotantotyypit: fingridTuotanto.rivit.filter(
            (rivi) => rivi.datasetId !== FINGRID_TUOTANTO_DATASETIT.kokonaistuotanto.id,
          ),
        }
      : null;

  const vaiheLkm = Object.fromEntries(
    HANKE_VAIHEET.map((vaihe) => [
      vaihe,
      merkit.filter((merkki) => merkki.vaihe === vaihe).length,
    ]),
  ) as Partial<Record<HankeVaihe, number>>;

  return { merkit, tuotantoVertailu, vaiheLkm, hankeVirhe };
}
