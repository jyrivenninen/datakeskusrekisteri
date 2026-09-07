"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition, type ReactNode } from "react";
import { hankkeetSuodatusPolku } from "@/lib/haku";
import {
  HANKE_JARJESTYS_VAIHTOEHDOT,
  parsiHankeJarjestys,
  type HankeJarjestys,
} from "@/lib/hanke-jarjestys";
import type { HankeSuodatus } from "@/lib/suodatus";

function LatausPyora() {
  return (
    <svg
      className="size-5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function HankeLuetteloOsio({
  suodatus,
  children,
}: {
  suodatus: HankeSuodatus;
  children: ReactNode;
}) {
  const router = useRouter();
  const [onLataus, aloitaSiirtyma] = useTransition();
  const jarjestys = parsiHankeJarjestys(suodatus.jarjestys);

  const paivitaJarjestys = useCallback(
    (arvo: HankeJarjestys) => {
      aloitaSiirtyma(() => {
        router.replace(
          hankkeetSuodatusPolku({
            ...suodatus,
            jarjestys: arvo === "nimi" ? undefined : arvo,
          }),
          { scroll: false },
        );
      });
    },
    [router, suodatus],
  );

  return (
    <>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h3 id="hankeluettelo-otsikko" className="text-lg font-semibold">
          Luettelo
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="hanke-jarjestys" className="text-sm font-medium text-muted">
            Järjestys
          </label>
          <select
            id="hanke-jarjestys"
            value={jarjestys}
            disabled={onLataus}
            aria-busy={onLataus}
            onChange={(tapahtuma) =>
              paivitaJarjestys(tapahtuma.target.value as HankeJarjestys)
            }
            className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            {HANKE_JARJESTYS_VAIHTOEHDOT.map((vaihtoehto) => (
              <option key={vaihtoehto.arvo} value={vaihtoehto.arvo}>
                {vaihtoehto.nimi}
              </option>
            ))}
          </select>
          {onLataus ? (
            <span className="flex items-center gap-1.5 text-sm text-muted" role="status">
              <LatausPyora />
              Järjestetään…
            </span>
          ) : null}
        </div>
      </div>
      <div className="relative" aria-busy={onLataus}>
        {onLataus ? (
          <div
            className="absolute inset-0 z-10 flex min-h-[8rem] items-center justify-center rounded-lg bg-background/75"
            aria-hidden="true"
          >
            <span className="flex items-center gap-2 text-sm text-muted">
              <LatausPyora />
              Järjestetään luetteloa…
            </span>
          </div>
        ) : null}
        <div className={onLataus ? "pointer-events-none opacity-50" : undefined}>
          {children}
        </div>
      </div>
    </>
  );
}
