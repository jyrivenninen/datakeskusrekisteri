import { HANKE_VAIHEET } from "@/lib/supabase/tietokanta";
import {
  KOKO_LUOKAT,
  VAIHE_NIMET,
  onHankeVaihe,
  onKokoLuokka,
} from "@/lib/naytto";
import type { HankeSuodatus } from "@/lib/supabase/kyselyt";

export function Suodatuslomake({
  suodatus,
  kunnat,
}: {
  suodatus: HankeSuodatus;
  kunnat: string[];
}) {
  return (
    <form method="get" className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <p className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor="kunta" className="text-sm font-medium">
          Kunta
        </label>
        <select
          id="kunta"
          name="kunta"
          defaultValue={suodatus.kunta ?? ""}
          className="rounded border border-border bg-surface px-2 py-2 text-foreground"
        >
          <option value="">Kaikki kunnat</option>
          {kunnat.map((kunta) => (
            <option key={kunta} value={kunta}>
              {kunta}
            </option>
          ))}
        </select>
      </p>
      <p className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor="vaihe" className="text-sm font-medium">
          Vaihe
        </label>
        <select
          id="vaihe"
          name="vaihe"
          defaultValue={suodatus.vaihe ?? ""}
          className="rounded border border-border bg-surface px-2 py-2 text-foreground"
        >
          <option value="">Kaikki vaiheet</option>
          {HANKE_VAIHEET.map((vaihe) => (
            <option key={vaihe} value={vaihe}>
              {VAIHE_NIMET[vaihe]}
            </option>
          ))}
        </select>
      </p>
      <p className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor="koko" className="text-sm font-medium">
          Koko
        </label>
        <select
          id="koko"
          name="koko"
          defaultValue={suodatus.koko ?? ""}
          className="rounded border border-border bg-surface px-2 py-2 text-foreground"
        >
          <option value="">Kaikki koot</option>
          {KOKO_LUOKAT.map((luokka) => (
            <option key={luokka.arvo} value={luokka.arvo}>
              {luokka.nimi}
            </option>
          ))}
        </select>
      </p>
      <button
        type="submit"
        className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        Suodata
      </button>
    </form>
  );
}

export function parsiSuodatus(params: {
  kunta?: string;
  vaihe?: string;
  koko?: string;
}): HankeSuodatus {
  return {
    kunta: params.kunta || undefined,
    vaihe: params.vaihe && onHankeVaihe(params.vaihe) ? params.vaihe : undefined,
    koko: params.koko && onKokoLuokka(params.koko) ? params.koko : undefined,
  };
}
