"use client";

import { useId, useState } from "react";

/** Sähköposti on DOM:ssa ja required vain, kun vastaus on valittu. */
export function VastausEmailKentta() {
  const [haluaa, setHaluaa] = useState(false);
  const ohjeId = useId();
  const lohkoId = useId();

  return (
    <div>
      <p className="flex min-h-11 items-center gap-2">
        <input
          id="haluan_vastauksen"
          name="haluan_vastauksen"
          type="checkbox"
          value="1"
          checked={haluaa}
          aria-expanded={haluaa}
          aria-controls={lohkoId}
          className="size-4"
          onChange={(tapahtuma) => setHaluaa(tapahtuma.target.checked)}
        />
        <label htmlFor="haluan_vastauksen" className="text-sm font-medium">
          Haluan vastauksen
        </label>
      </p>
      {haluaa ? (
        <div id={lohkoId} className="mt-3 flex flex-col gap-1" aria-live="polite">
          <label htmlFor="vastaus_email" className="text-sm font-medium">
            Sähköpostiosoite
          </label>
          <input
            id="vastaus_email"
            name="vastaus_email"
            type="email"
            required
            aria-required="true"
            inputMode="email"
            autoComplete="email"
            maxLength={320}
            spellCheck={false}
            aria-describedby={ohjeId}
            className="rounded border border-border bg-surface px-2 py-2"
          />
          <span id={ohjeId} className="max-w-prose text-sm leading-relaxed text-muted">
            Osoitetta käytetään vain vastaamiseen, eikä sitä julkaista. Se poistetaan, kun
            palaute on käsitelty, viimeistään 90 päivän kuluttua.{" "}
            <a href="/tietoa#yksityisyys" className="text-link underline">
              Tietosuojaseloste
            </a>
          </span>
        </div>
      ) : null}
    </div>
  );
}
