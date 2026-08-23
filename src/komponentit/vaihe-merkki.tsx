import { VAIHE_NIMET, VAIHE_VARIT } from "@/lib/naytto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

export function VaiheMerkki({
  vaihe,
  luokka,
}: {
  vaihe: HankeVaihe;
  luokka?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${luokka ?? ""}`}>
      <span
        className="inline-block size-2.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ backgroundColor: VAIHE_VARIT[vaihe] }}
        aria-hidden="true"
      />
      {VAIHE_NIMET[vaihe]}
    </span>
  );
}
