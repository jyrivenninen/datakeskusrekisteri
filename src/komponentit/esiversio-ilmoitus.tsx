"use client";

import { useId, useState } from "react";
import { kuittaaEsiversio } from "@/app/toiminnot";
import {
  ESIVERSIO_DATA_ATTR,
  ESIVERSIO_DATA_KUITATTU,
  ESIVERSIO_TEKSTI,
  OSALLISTUMINEN_TEKSTI,
  esiversioKuittausSetCookie,
} from "@/lib/esiversio";

function asetaKuitattuAttribuutti() {
  try {
    document.documentElement.setAttribute(
      ESIVERSIO_DATA_ATTR,
      ESIVERSIO_DATA_KUITATTU,
    );
  } catch {
    /* ohita */
  }
}

function kirjoitaKuittausSelain() {
  try {
    document.cookie = esiversioKuittausSetCookie();
  } catch {
    /* ohita — palvelintoiminto voi silti tallentaa */
  }
}

/**
 * Esiversioilmoitus layoutissa (ei remounttia sivunvaihdossa).
 * Näkyvyys vain html[data-esiversio]-attribuutilla (ei hydraatiotilaa).
 * Markup sama palvelimella ja selaimessa.
 */
export function EsiversioIlmoitus() {
  const otsikkoId = useId();
  const [odottaa, asetaOdottaa] = useState(false);

  async function kasitteleKuittaus(tapahtuma: React.FormEvent<HTMLFormElement>) {
    tapahtuma.preventDefault();
    asetaOdottaa(true);
    kirjoitaKuittausSelain();
    asetaKuitattuAttribuutti();
    try {
      await kuittaaEsiversio();
    } catch {
      /* selaineväste riittää näkyvyyteen */
    }
    const sisalto = document.getElementById("sisalto");
    if (sisalto instanceof HTMLElement) {
      sisalto.setAttribute("tabindex", "-1");
      sisalto.focus({ preventScroll: true });
    }
    asetaOdottaa(false);
  }

  return (
    <aside
      className="esiversio-ilmoitus border-b border-border bg-surface"
      aria-labelledby={otsikkoId}
    >
      <div className="sivuleveys max-w-3xl py-6">
        <h2 id={otsikkoId} className="text-xl font-semibold text-foreground">
          Esiversio
        </h2>
        <p className="mt-3 leading-relaxed text-foreground">{ESIVERSIO_TEKSTI}</p>
        <p className="mt-3 leading-relaxed text-foreground">{OSALLISTUMINEN_TEKSTI}</p>
        <p className="mt-3 text-sm text-muted">
          Ilmoita hanke tai täydennys sivulla{" "}
          <a href="/ilmoitus" className="text-link underline">
            Ilmoita hanke
          </a>
          . Palaute ja muut viestit sivulla{" "}
          <a href="/yhteys" className="text-link underline">
            Ota yhteyttä
          </a>
          . Lisätietoa on sivulla{" "}
          <a href="/tietoa" className="text-link underline">
            Tietoa palvelusta
          </a>
          .
        </p>
        <form action={kuittaaEsiversio} onSubmit={kasitteleKuittaus} className="mt-6">
          <button
            type="submit"
            disabled={odottaa}
            className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-70"
          >
            Ymmärrän
          </button>
        </form>
      </div>
    </aside>
  );
}
