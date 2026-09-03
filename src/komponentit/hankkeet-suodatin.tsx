"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { HANKE_VAIHEET } from "@/lib/supabase/tietokanta";
import type { HankeSuodatus } from "@/lib/supabase/kyselyt";
import { parsiSuodatus } from "@/lib/supabase/kyselyt";
import {
  aktiivisetEhdot,
  HAKU_DEBOUNCE_MS,
  hankkeetSuodatusPolku,
  onAktiivinenSuodatus,
  parsiHakusana,
} from "@/lib/haku";
import { KOKO_LUOKAT, VAIHE_NIMET } from "@/lib/naytto";

function HakuKuvake() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20L16 16" strokeLinecap="round" />
    </svg>
  );
}

export function HankkeetSuodatin({
  suodatus,
  kunnat,
}: {
  suodatus: HankeSuodatus;
  kunnat: string[];
}) {
  const router = useRouter();
  const [onSiirtymassa, aloitaSiirtyma] = useTransition();
  const [hakuPaikallinen, setHakuPaikallinen] = useState(suodatus.q ?? "");
  const viiveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pyyntoRef = useRef(0);

  useEffect(() => {
    setHakuPaikallinen(suodatus.q ?? "");
  }, [suodatus.q]);

  const paivitaUrl = useCallback(
    (uusi: HankeSuodatus) => {
      aloitaSiirtyma(() => {
        router.replace(hankkeetSuodatusPolku(uusi), { scroll: false });
      });
    },
    [router],
  );

  const onHakuMuutos = (arvo: string) => {
    setHakuPaikallinen(arvo);
    if (viiveRef.current) clearTimeout(viiveRef.current);
    const pyynto = ++pyyntoRef.current;
    viiveRef.current = setTimeout(() => {
      if (pyynto !== pyyntoRef.current) return;
      paivitaUrl({ ...suodatus, q: parsiHakusana(arvo) });
    }, HAKU_DEBOUNCE_MS);
  };

  const tyhjennaHaku = () => {
    if (viiveRef.current) clearTimeout(viiveRef.current);
    pyyntoRef.current += 1;
    setHakuPaikallinen("");
    paivitaUrl({ ...suodatus, q: undefined });
  };

  const ehdot = aktiivisetEhdot(suodatus);
  const aktiivinen = onAktiivinenSuodatus(suodatus);
  const lomakeAvain = hankkeetSuodatusPolku(suodatus);

  return (
    <div
      className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5"
      aria-busy={onSiirtymassa}
    >
      <div className="relative">
        <label htmlFor="haku" className="sr-only">
          Hae hankkeen nimellä tai kunnalla
        </label>
        <HakuKuvake />
        <input
          id="haku"
          name="q"
          type="search"
          value={hakuPaikallinen}
          maxLength={200}
          autoComplete="off"
          placeholder="Hae hankkeen nimellä tai kunnalla"
          className="min-h-11 w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-11 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          onChange={(tapahtuma) => onHakuMuutos(tapahtuma.target.value)}
        />
        {hakuPaikallinen ? (
          <button
            type="button"
            onClick={tyhjennaHaku}
            className="absolute right-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
            aria-label="Tyhjennä haku"
          >
            ×
          </button>
        ) : null}
      </div>

      {ehdot.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Aktiiviset suodattimet">
          {ehdot.map((ehto) => (
            <li key={ehto.avain}>
              <Link
                href={hankkeetSuodatusPolku(ehto.poista)}
                scroll={false}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3 py-1 text-sm hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
              >
                {ehto.nimi}
                <span className="ml-2 text-muted" aria-hidden>
                  ×
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        key={lomakeAvain}
        method="get"
        action="/"
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onChange={(tapahtuma) => {
          const fd = new FormData(tapahtuma.currentTarget);
          paivitaUrl(
            parsiSuodatus({
              q: String(fd.get("q") ?? ""),
              kunta: String(fd.get("kunta") ?? ""),
              vaihe: String(fd.get("vaihe") ?? ""),
              koko: String(fd.get("koko") ?? ""),
              kuvalliset: fd.get("kuvalliset") === "1" ? "1" : undefined,
            }),
          );
        }}
      >
        <input type="hidden" name="q" value={hakuPaikallinen} />

        <p className="flex flex-col gap-1 sm:col-span-1">
          <label htmlFor="kunta" className="text-sm font-medium">
            Kunta
          </label>
          <select
            id="kunta"
            name="kunta"
            defaultValue={suodatus.kunta ?? ""}
            className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            <option value="">Kaikki kunnat</option>
            {kunnat.map((kunta) => (
              <option key={kunta} value={kunta}>
                {kunta}
              </option>
            ))}
          </select>
        </p>

        <p className="flex flex-col gap-1 sm:col-span-1">
          <label htmlFor="vaihe" className="text-sm font-medium">
            Vaihe
          </label>
          <select
            id="vaihe"
            name="vaihe"
            defaultValue={suodatus.vaihe ?? ""}
            className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            <option value="">Kaikki vaiheet</option>
            {HANKE_VAIHEET.map((vaihe) => (
              <option key={vaihe} value={vaihe}>
                {VAIHE_NIMET[vaihe]}
              </option>
            ))}
          </select>
        </p>

        <p className="flex flex-col gap-1 sm:col-span-1">
          <label htmlFor="koko" className="text-sm font-medium">
            Koko
          </label>
          <select
            id="koko"
            name="koko"
            defaultValue={suodatus.koko ?? ""}
            className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            <option value="">Kaikki koot</option>
            {KOKO_LUOKAT.map((luokka) => (
              <option key={luokka.arvo} value={luokka.arvo}>
                {luokka.nimi}
              </option>
            ))}
          </select>
        </p>

        <p className="flex min-h-11 items-center gap-2 sm:col-span-1 sm:self-end">
          <input
            id="kuvalliset"
            type="checkbox"
            name="kuvalliset"
            value="1"
            defaultChecked={Boolean(suodatus.kuvalliset)}
            className="size-4"
          />
          <label htmlFor="kuvalliset" className="text-sm font-medium">
            Näytä vain kuvalliset
          </label>
        </p>

        <noscript>
          <p className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="haku-noscript" className="text-sm font-medium">
              Haku
            </label>
            <input
              id="haku-noscript"
              name="q"
              type="search"
              defaultValue={suodatus.q ?? ""}
              maxLength={200}
              placeholder="Hae hankkeen nimellä tai kunnalla"
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </p>
          <button
            type="submit"
            className="min-h-11 rounded-lg border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background sm:col-span-2 lg:col-span-4"
          >
            Suodata
          </button>
        </noscript>
      </form>

      {aktiivinen ? (
        <p className="mt-4">
          <Link
            href="/"
            scroll={false}
            className="inline-flex min-h-11 items-center text-sm font-medium text-link underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          >
            Tyhjennä suodattimet
          </Link>
        </p>
      ) : null}

      {onSiirtymassa ? (
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          Päivitetään…
        </p>
      ) : null}
    </div>
  );
}
