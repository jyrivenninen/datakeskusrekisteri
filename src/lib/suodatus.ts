import { parsiHakusana } from "@/lib/haku";
import { parsiHankeJarjestys, type HankeJarjestys } from "@/lib/hanke-jarjestys";
import { onHankeVaihe, onKokoLuokka, type KokoLuokka } from "@/lib/naytto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

/** URL-suodattimet etusivun hankelistauksessa. Client-safe (ei server-importteja). */
export type HankeSuodatus = {
  q?: string;
  kunta?: string;
  vaihe?: HankeVaihe;
  koko?: KokoLuokka;
  kuvalliset?: boolean;
  jarjestys?: HankeJarjestys;
};

export function parsiSuodatus(params: {
  q?: string;
  kunta?: string;
  vaihe?: string;
  koko?: string;
  kuvalliset?: string;
  jarjestys?: string;
}): HankeSuodatus {
  const jarjestys = parsiHankeJarjestys(params.jarjestys);
  return {
    q: parsiHakusana(params.q),
    kunta: params.kunta || undefined,
    vaihe: params.vaihe && onHankeVaihe(params.vaihe) ? params.vaihe : undefined,
    koko: params.koko && onKokoLuokka(params.koko) ? params.koko : undefined,
    kuvalliset: params.kuvalliset === "1",
    jarjestys: jarjestys === "nimi" ? undefined : jarjestys,
  };
}
