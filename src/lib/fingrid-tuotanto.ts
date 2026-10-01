/**
 * Kartan tuotantovertailu lukee tallennetun Fingrid-mittauksen.
 * Rajapintaa ei kutsuta sivulatauksessa.
 */

import { FINGRID_TUOTANTO_DATASETIT, type FingridTuotantoNakyma } from "@/lib/fingrid";
import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";

const JARJESTYS = [
  FINGRID_TUOTANTO_DATASETIT.kokonaistuotanto.id,
  FINGRID_TUOTANTO_DATASETIT.ydinvoima.id,
  FINGRID_TUOTANTO_DATASETIT.tuulivoima.id,
  FINGRID_TUOTANTO_DATASETIT.vesivoima.id,
] as const;

export async function haeTallennettuFingridTuotanto(): Promise<FingridTuotantoNakyma | null> {
  if (!supabaseYmparistoAsetettu()) return null;

  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("fingrid_tuotanto")
      .select("dataset_id, nimi, mw, mittaus_pvm, lahde_url");
    if (error || !data || data.length === 0) return null;

    const rivit = [...data]
      .sort(
        (a, b) =>
          JARJESTYS.indexOf(a.dataset_id as (typeof JARJESTYS)[number]) -
          JARJESTYS.indexOf(b.dataset_id as (typeof JARJESTYS)[number]),
      )
      .map((rivi) => ({
        datasetId: Number(rivi.dataset_id),
        nimi: rivi.nimi as string,
        mw: Number(rivi.mw),
        mittausPvm: rivi.mittaus_pvm as string,
        lahde_url: rivi.lahde_url as string,
      }));

    const kokonais = rivit.find(
      (rivi) => rivi.datasetId === FINGRID_TUOTANTO_DATASETIT.kokonaistuotanto.id,
    );
    if (!kokonais || !Number.isFinite(kokonais.mw)) return null;

    return {
      paivitetty_pvm: kokonais.mittausPvm,
      rivit,
      kokonaistuotanto_mw: kokonais.mw,
    };
  } catch {
    return null;
  }
}
