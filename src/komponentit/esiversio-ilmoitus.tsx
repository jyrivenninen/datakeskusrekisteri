"use client";

import { useEffect, useId, useState } from "react";
import { kuittaaEsiversio, siirraEsiversioKuittausSelainlle } from "@/app/toiminnot";
import {
  ESIVERSIO_DATA_ARVO,
  ESIVERSIO_DATA_ATTR,
  ESIVERSIO_TEKSTI,
  OSALLISTUMINEN_TEKSTI,
  esiversioKuittausSetCookie,
  onkoEsiversioKuitattuEvasteesta,
} from "@/lib/esiversio";

function asetaKuitattuAttribuutti() {
  try {
    document.documentElement.setAttribute(ESIVERSIO_DATA_ATTR, ESIVERSIO_DATA_ARVO);
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
 * Ei-modaali banneri: ei fokusloukkua, ei peitä sisältöä.
 * Piilotus: CSS data-attribuutilla (inline-skripti) + paikallinen tila kuittauksen jälkeen.
 */
export function EsiversioIlmoitus() {
  const otsikkoId = useId();
  const [kuitattu, asetaKuitattu] = useState(false);
  const [odottaa, asetaOdottaa] = useState(false);

  useEffect(() => {
    let peruttu = false;

    if (onkoEsiversioKuitattuEvasteesta(document.cookie)) {
      asetaKuitattuAttribuutti();
      asetaKuitattu(true);
      return;
    }

    // Vanha httpOnly-eväste ei näy document.cookiessa — siirto palvelimelta kerran.
    void siirraEsiversioKuittausSelainlle()
      .then((ok) => {
        if (peruttu || !ok) return;
        kirjoitaKuittausSelain();
        asetaKuitattuAttribuutti();
        asetaKuitattu(true);
      })
      .catch(() => {
        /* näytä ilmoitus */
      });

    return () => {
      peruttu = true;
    };
  }, []);

  async function kasitteleKuittaus(tapahtuma: React.FormEvent<HTMLFormElement>) {
    tapahtuma.preventDefault();
    asetaOdottaa(true);
    kirjoitaKuittausSelain();
    asetaKuitattuAttribuutti();
    asetaKuitattu(true);
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

  const piilossa = kuitattu;

  return (
    <aside
      className="esiversio-ilmoitus border-b border-border bg-surface"
      aria-labelledby={otsikkoId}
      aria-hidden={piilossa ? true : undefined}
      inert={piilossa ? true : undefined}
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
            disabled={odottaa || piilossa}
            className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-70"
          >
            Ymmärrän
          </button>
        </form>
      </div>
    </aside>
  );
}
