"use client";

import { useState } from "react";

export function KopioiOsoite({ osoite }: { osoite: string }) {
  const [kopioitu, setKopioitu] = useState(false);

  return (
    <div className="mt-2">
      <p className="text-sm">
        Vastaa ennen kuin merkitset käsitellyksi. Osoite poistuu merkittäessä.
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span>{osoite}</span>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
          onClick={() => {
            void navigator.clipboard.writeText(osoite).then(() => {
              setKopioitu(true);
            });
          }}
        >
          Kopioi osoite
        </button>
        {kopioitu ? (
          <span role="status" className="text-muted">
            Kopioitu
          </span>
        ) : null}
      </p>
    </div>
  );
}
