"use client";

import { useState, type MouseEvent } from "react";

/** Latauslinkki, joka kertoo muodostuksen olevan käynnissä. Ilman JavaScriptiä tavallinen linkki. */
export function AvoinDataLinkki({
  href,
  nimi,
  tiedosto,
}: {
  href: string;
  nimi: string;
  tiedosto: string;
}) {
  const [tila, setTila] = useState<"valmis" | "kaynnissa" | "virhe">("valmis");

  async function lataa(tapahtuma: MouseEvent<HTMLAnchorElement>) {
    if (
      tapahtuma.metaKey ||
      tapahtuma.ctrlKey ||
      tapahtuma.shiftKey ||
      tapahtuma.altKey ||
      tapahtuma.button !== 0
    ) {
      return;
    }
    tapahtuma.preventDefault();
    setTila("kaynnissa");
    try {
      const vastaus = await fetch(href);
      if (!vastaus.ok) {
        setTila("virhe");
        return;
      }
      const blob = await vastaus.blob();
      const osoite = URL.createObjectURL(blob);
      const linkki = document.createElement("a");
      linkki.href = osoite;
      linkki.download = tiedosto;
      document.body.appendChild(linkki);
      linkki.click();
      linkki.remove();
      URL.revokeObjectURL(osoite);
      setTila("valmis");
    } catch {
      setTila("virhe");
    }
  }

  return (
    <>
      <a
        href={href}
        className="text-link underline"
        aria-busy={tila === "kaynnissa" || undefined}
        onClick={lataa}
      >
        {tila === "kaynnissa" ? "Muodostetaan aineistoa…" : nimi}
      </a>
      {tila === "virhe" ? (
        <span className="text-muted"> Lataus epäonnistui. Yritä linkkiä uudelleen.</span>
      ) : null}
    </>
  );
}
