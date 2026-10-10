"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tallennaLahdeMetatiedotToiminto } from "@/app/toiminnot";
import {
  LAHDE_TYYPPI_NIMET,
  LAHDE_TYYPIT,
  SITOVUUSTASO_NIMET,
  SITOVUUSTASOT,
  oletusSitovuustaso,
  type LahdeTyyppi,
  type Sitovuustaso,
} from "@/lib/lahde-metatiedot";
import {
  alkuLapikayntiTila,
  type LahdeTyyppiLapikayntiRivi,
  type LahdeTyyppiLapikayntiYhteenveto,
} from "@/lib/lahde-tyyppi-lapikaynti";

type RiviTila = {
  lahde_tyyppi: LahdeTyyppi;
  sitovuustaso: Sitovuustaso;
  otsikko: string;
  sitovuusManuaalinen: boolean;
};

function alkuTilat(rivit: LahdeTyyppiLapikayntiRivi[]): Record<string, RiviTila> {
  return Object.fromEntries(
    rivit.map((r) => {
      const alku = alkuLapikayntiTila(r);
      return [
        r.avain,
        {
          ...alku,
          sitovuusManuaalinen: false,
        },
      ];
    }),
  );
}

export function LahdeTyyppiLapikayntiLista({
  rivit,
  yhteenveto,
}: {
  rivit: LahdeTyyppiLapikayntiRivi[];
  yhteenveto: LahdeTyyppiLapikayntiYhteenveto;
}) {
  const router = useRouter();
  const [tilat, setTilat] = useState<Record<string, RiviTila>>(() => alkuTilat(rivit));
  const [aktiivinen, setAktiivinen] = useState(0);
  const [tallentaa, setTallentaa] = useState(false);
  const riviRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    setTilat(alkuTilat(rivit));
    setAktiivinen(0);
  }, [rivit]);

  const aktiivinenRivi = rivit[aktiivinen] ?? null;

  const paivitaTyyppi = useCallback((avain: string, tyyppi: LahdeTyyppi) => {
    setTilat((ed) => {
      const nykyinen = ed[avain];
      if (!nykyinen) return ed;
      const uusiSitovuus = nykyinen.sitovuusManuaalinen
        ? nykyinen.sitovuustaso
        : oletusSitovuustaso(tyyppi);
      return {
        ...ed,
        [avain]: {
          ...nykyinen,
          lahde_tyyppi: tyyppi,
          sitovuustaso: uusiSitovuus,
        },
      };
    });
  }, []);

  const paivitaSitovuus = useCallback((avain: string, sitovuustaso: Sitovuustaso) => {
    setTilat((ed) => {
      const nykyinen = ed[avain];
      if (!nykyinen) return ed;
      return {
        ...ed,
        [avain]: { ...nykyinen, sitovuustaso, sitovuusManuaalinen: true },
      };
    });
  }, []);

  const tallennaRivi = useCallback(
    async (rivi: LahdeTyyppiLapikayntiRivi) => {
      const tila = tilat[rivi.avain];
      if (!tila || tallentaa) return;
      setTallentaa(true);
      const fd = new FormData();
      fd.set("dokumentti_id", rivi.dokumentti_id);
      fd.set("lahde_tyyppi", tila.lahde_tyyppi);
      fd.set("sitovuustaso", tila.sitovuustaso);
      fd.set("otsikko", tila.otsikko);
      if (rivi.ehdotus_id) fd.set("ehdotus_id", rivi.ehdotus_id);
      fd.set("paluu", "/yllapito/lahde-tyypit");
      try {
        await tallennaLahdeMetatiedotToiminto(fd);
      } finally {
        setTallentaa(false);
      }
    },
    [tilat, tallentaa],
  );

  useEffect(() => {
    const kohde = riviRefs.current[aktiivinen];
    if (kohde) {
      kohde.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [aktiivinen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kohde = e.target as HTMLElement | null;
      if (
        kohde &&
        (kohde.tagName === "INPUT" ||
          kohde.tagName === "SELECT" ||
          kohde.tagName === "TEXTAREA" ||
          kohde.isContentEditable)
      ) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && aktiivinenRivi) {
          e.preventDefault();
          void tallennaRivi(aktiivinenRivi);
        }
        return;
      }

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setAktiivinen((i) => Math.min(i + 1, rivit.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setAktiivinen((i) => Math.max(i - 1, 0));
      } else if ((e.key === "Enter" || e.key === "s") && aktiivinenRivi) {
        e.preventDefault();
        void tallennaRivi(aktiivinenRivi);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aktiivinenRivi, rivit.length, tallennaRivi]);

  const edistyminen = useMemo(() => {
    if (yhteenveto.yhteensa === 0) return 0;
    return Math.round((yhteenveto.kasitelty / yhteenveto.yhteensa) * 100);
  }, [yhteenveto]);

  if (rivit.length === 0) {
    return (
      <p className="mt-6 text-sm">
        Kaikki URL:t on käsitelty ({yhteenveto.kasitelty} / {yhteenveto.yhteensa}).
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div
        className="rounded border border-border bg-surface px-4 py-3 text-sm"
        role="status"
        aria-live="polite"
      >
        <p>
          <strong className="font-medium">Edistyminen:</strong> {yhteenveto.kasitelty} käsitelty,{" "}
          {yhteenveto.jaljella} jäljellä ({edistyminen} %). Jonossa domain-ehdotuksia:{" "}
          {yhteenveto.odottavia_ehdotuksia}.
        </p>
        <p className="mt-1 text-muted">
          Näppäimet: ↑/k edellinen, ↓/j seuraava, Enter tai s tallenna rivi. Ctrl/Cmd+Enter
          tallentaa myös kentän sisällä.
        </p>
      </div>

      <ol className="space-y-3">
        {rivit.map((rivi, indeksi) => {
          const tila = tilat[rivi.avain] ?? alkuLapikayntiTila(rivi);
          const aktiivinenRiviTama = indeksi === aktiivinen;
          return (
            <li key={rivi.avain}>
              <div
                ref={(el) => {
                  riviRefs.current[indeksi] = el;
                }}
                className={`rounded border px-3 py-3 ${
                  aktiivinenRiviTama
                    ? "border-link ring-2 ring-link/30"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex flex-wrap items-start gap-2 text-sm">
                  <span className="font-mono text-xs text-muted">#{indeksi + 1}</span>
                  {rivi.on_ehdotus ? (
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-950 dark:bg-violet-950 dark:text-violet-50">
                      Domain-ehdotus
                    </span>
                  ) : (
                    <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                      Ei ehdotusta
                    </span>
                  )}
                  <span className="text-muted">{rivi.esiintymia} viittausta</span>
                  {rivi.otsikko_automaattinen ? (
                    <span className="rounded border border-amber-700 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50">
                      Otsikko = URL (automaattinen)
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 break-all text-sm">
                  <a
                    href={rivi.url}
                    className="text-link underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {rivi.url}
                  </a>
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label
                      htmlFor={`tyyppi-${rivi.avain}`}
                      className="block text-xs font-medium"
                    >
                      Lähdetyyppi
                    </label>
                    <select
                      id={`tyyppi-${rivi.avain}`}
                      value={tila.lahde_tyyppi}
                      onChange={(e) =>
                        paivitaTyyppi(rivi.avain, e.target.value as LahdeTyyppi)
                      }
                      onFocus={() => setAktiivinen(indeksi)}
                      className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      {LAHDE_TYYPIT.map((t) => (
                        <option key={t} value={t}>
                          {LAHDE_TYYPPI_NIMET[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`sitovuus-${rivi.avain}`}
                      className="block text-xs font-medium"
                    >
                      Sitovuustaso
                    </label>
                    <select
                      id={`sitovuus-${rivi.avain}`}
                      value={tila.sitovuustaso}
                      onChange={(e) =>
                        paivitaSitovuus(rivi.avain, e.target.value as Sitovuustaso)
                      }
                      onFocus={() => setAktiivinen(indeksi)}
                      className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      {SITOVUUSTASOT.map((s) => (
                        <option key={s} value={s}>
                          {SITOVUUSTASO_NIMET[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`otsikko-${rivi.avain}`} className="block text-xs font-medium">
                      Otsikko {rivi.otsikko_automaattinen ? "(korjaa tarvittaessa)" : ""}
                    </label>
                    <input
                      id={`otsikko-${rivi.avain}`}
                      type="text"
                      value={tila.otsikko}
                      onChange={(e) =>
                        setTilat((ed) => ({
                          ...ed,
                          [rivi.avain]: { ...ed[rivi.avain], otsikko: e.target.value },
                        }))
                      }
                      onFocus={() => setAktiivinen(indeksi)}
                      placeholder={rivi.otsikko_automaattinen ? rivi.url : rivi.otsikko}
                      className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={tallentaa}
                    onClick={() => void tallennaRivi(rivi)}
                    className="rounded border border-foreground px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Tallenna ja seuraava
                  </button>
                  <button
                    type="button"
                    className="text-sm text-link underline"
                    onClick={() => router.refresh()}
                  >
                    Päivitä lista
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
