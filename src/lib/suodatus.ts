import { parsiHakusana } from "@/lib/haku";
import { onHankeVaihe, onKokoLuokka, type KokoLuokka } from "@/lib/naytto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

/** URL-suodattimet etusivun hankelistauksessa. Client-safe (ei server-importteja). */
export type HankeSuodatus = {
  q?: string;
  kunta?: string;
  vaihe?: HankeVaihe;
  koko?: KokoLuokka;
  kuvalliset?: boolean;
};

export function parsiSuodatus(params: {
  q?: string;
  kunta?: string;
  vaihe?: string;
  koko?: string;
  kuvalliset?: string;
}): HankeSuodatus {
  return {
    q: parsiHakusana(params.q),
    kunta: params.kunta || undefined,
    vaihe: params.vaihe && onHankeVaihe(params.vaihe) ? params.vaihe : undefined,
    koko: params.koko && onKokoLuokka(params.koko) ? params.koko : undefined,
    kuvalliset: params.kuvalliset === "1",
  };
}
