"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { hankkeetSuodatusPolku } from "@/lib/haku";
import {
  HANKE_JARJESTYS_VAIHTOEHDOT,
  parsiHankeJarjestys,
  type HankeJarjestys,
} from "@/lib/hanke-jarjestys";
import type { HankeSuodatus } from "@/lib/suodatus";

export function HankeLuetteloJarjestys({ suodatus }: { suodatus: HankeSuodatus }) {
  const router = useRouter();
  const jarjestys = parsiHankeJarjestys(suodatus.jarjestys);

  const paivita = useCallback(
    (arvo: HankeJarjestys) => {
      router.replace(
        hankkeetSuodatusPolku({
          ...suodatus,
          jarjestys: arvo === "nimi" ? undefined : arvo,
        }),
        { scroll: false },
      );
    },
    [router, suodatus],
  );

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="hanke-jarjestys" className="text-sm font-medium text-muted">
        Järjestys
      </label>
      <select
        id="hanke-jarjestys"
        value={jarjestys}
        onChange={(tapahtuma) => paivita(tapahtuma.target.value as HankeJarjestys)}
        className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
      >
        {HANKE_JARJESTYS_VAIHTOEHDOT.map((vaihtoehto) => (
          <option key={vaihtoehto.arvo} value={vaihtoehto.arvo}>
            {vaihtoehto.nimi}
          </option>
        ))}
      </select>
    </div>
  );
}
