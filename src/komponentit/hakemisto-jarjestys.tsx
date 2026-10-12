"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  HAKEMISTO_JARJESTYS_VAIHTOEHDOT,
  hakemistoJarjestysPolku,
  type HakemistoJarjestys,
} from "@/lib/hakemisto-jarjestys";

export function HakemistoJarjestysValinta({
  polku,
  jarjestys,
}: {
  /** Esim. `/kunnat`, `/toimijat`, `/konsultit`. */
  polku: string;
  jarjestys: HakemistoJarjestys;
}) {
  const router = useRouter();
  const [onLataus, aloitaSiirtyma] = useTransition();

  const paivita = useCallback(
    (arvo: HakemistoJarjestys) => {
      aloitaSiirtyma(() => {
        router.replace(hakemistoJarjestysPolku(polku, arvo), { scroll: false });
      });
    },
    [router, polku],
  );

  const id = `hakemisto-jarjestys-${polku.replace(/\W+/g, "")}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        Järjestys
      </label>
      <select
        id={id}
        value={jarjestys}
        disabled={onLataus}
        aria-busy={onLataus}
        onChange={(e) => paivita(e.target.value as HakemistoJarjestys)}
        className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
      >
        {HAKEMISTO_JARJESTYS_VAIHTOEHDOT.map((v) => (
          <option key={v.arvo} value={v.arvo}>
            {v.nimi}
          </option>
        ))}
      </select>
    </div>
  );
}
