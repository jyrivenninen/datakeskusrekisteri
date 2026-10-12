"use client";

import { useState } from "react";
import {
  PINTA_ALA_YKSIKKO_RAJA_HA,
  epaselvatPintaAlaKentat,
  muunnaM2Ha,
  type PintaAlaYksikkoVahvistus,
} from "@/lib/pinta-ala-yksikko";
import { vahvistaPintaAlaYksikkoToiminto } from "@/app/toiminnot";

type Props = {
  ehdotusId: string;
  kentat: Record<string, { arvo?: string | null; yksikko?: string | null }>;
};

/**
 * Kun pinta_ala_ha / kaava_ala_ha > raja ilman yksikköä: ei ratkaisua eikä
 * Hyväksy-painiketta ennen yksikön vahvistusta.
 */
export function PintaAlaYksikkoVahvistus({ ehdotusId, kentat }: Props) {
  const epaselvat = epaselvatPintaAlaKentat(kentat);
  const [yksikko, setYksikko] = useState<PintaAlaYksikkoVahvistus | "">("");
  const [virhe, setVirhe] = useState<string | null>(null);
  const [odottaa, setOdottaa] = useState(false);

  if (epaselvat.length === 0) return null;

  const voiVahvistaa = yksikko === "ha" || yksikko === "m2";

  async function vahvista() {
    if (!voiVahvistaa) {
      setVirhe("Valitse ha tai m² vahvistaaksesi, tai hylkää ehdotus.");
      return;
    }
    setOdottaa(true);
    setVirhe(null);
    const fd = new FormData();
    fd.set("id", ehdotusId);
    fd.set("yksikko", yksikko);
    try {
      await vahvistaPintaAlaYksikkoToiminto(fd);
    } catch (syy) {
      setVirhe(syy instanceof Error ? syy.message : "Vahvistus epäonnistui.");
      setOdottaa(false);
    }
  }

  return (
    <section
      className="mt-6 rounded-xl border border-border bg-surface p-4"
      aria-labelledby="pinta-ala-yksikko-otsikko"
    >
      <h2 id="pinta-ala-yksikko-otsikko" className="text-lg font-semibold">
        Yksikkö epäselvä
      </h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Yksikkö puuttuu (<code className="text-xs">ei_merkitty</code>) tai luku
        ylittää {PINTA_ALA_YKSIKKO_RAJA_HA.toLocaleString("fi")} ha ilman
        vahvistettua hehtaariyksikköä. Vahvista yksikkö ennen julkaisua.
        Ratkaisuvaihtoehdot ja «Hyväksy ja julkaise» eivät ole käytössä ennen
        vahvistusta.
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {epaselvat.map((k) => (
          <li key={k.kentta}>
            <span className="font-medium">{k.kentta}</span>:{" "}
            {k.arvo.toLocaleString("fi")}
            {yksikko === "m2" ? (
              <span className="text-muted">
                {" "}
                → {muunnaM2Ha(k.arvo).toLocaleString("fi")} ha
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium">Asiakirjan yksikkö</legend>
        {(
          [
            ["ha", "hehtaaria (ha) — arvo on jo hehtaareina"],
            ["m2", "neliömetriä (m²) — muunnetaan hehtaareiksi"],
            ["ei_merkitty", "ei merkitty — julkaisu estetty; hylkää ehdotus"],
          ] as const
        ).map(([arvo, teksti]) => (
          <div key={arvo} className="flex items-start gap-2">
            <input
              id={`pinta-yksikko-${arvo}`}
              type="radio"
              name="pinta_ala_yksikko"
              value={arvo}
              checked={yksikko === arvo}
              onChange={() => setYksikko(arvo)}
              className="mt-1"
            />
            <label htmlFor={`pinta-yksikko-${arvo}`} className="text-sm">
              {teksti}
            </label>
          </div>
        ))}
      </fieldset>
      {virhe ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {virhe}
        </p>
      ) : null}
      <button
        type="button"
        disabled={odottaa || !voiVahvistaa}
        onClick={vahvista}
        className="mt-4 rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {voiVahvistaa ? "Vahvista yksikkö" : "Valitse yksikkö"}
      </button>
      {yksikko === "ei_merkitty" ? (
        <p className="mt-2 text-sm text-muted">
          Julkaisu estetty. Hylkää ehdotus (asiakirja voi jäädä hankkeelle).
        </p>
      ) : null}
    </section>
  );
}
