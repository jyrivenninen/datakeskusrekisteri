"use client";

import { useState } from "react";
import { PakollinenMerkki } from "@/komponentit/pakollinen-merkki";

export type LisalahdeValinta = { arvo: string; nimi: string };

type Rivi = { id: number; kentta: string; url: string; viesti: string };

function riviPuutteellinen(rivi: Rivi): boolean {
  return !rivi.kentta || !rivi.url.trim();
}

function naytaRivinPuute(rivi: Rivi) {
  const kentta = document.getElementById(`lisalahde-${rivi.id}-kentta`);
  const url = document.getElementById(`lisalahde-${rivi.id}-url`);
  if (!rivi.kentta && kentta instanceof HTMLSelectElement) {
    kentta.reportValidity();
    return;
  }
  if (url instanceof HTMLInputElement) url.reportValidity();
}

export function IlmoitusLisalahteet({
  valinnat,
  alussa = 0,
  vahintaan = false,
  kentatPakollisia = false,
  otsikko = "Muut linkit",
  ohje = "Jos jokin tieto on eri osoitteessa, lisää linkki ja valitse, mitä se koskee. Arvoa ei tarvitse kirjoittaa.",
  kysyViesti = false,
}: {
  valinnat: LisalahdeValinta[];
  /** Valmiina näkyvät rivit. Täydennyksessä ensimmäinen rivi on lomakkeen sisältö. */
  alussa?: number;
  /** Viimeistä riviä ei voi poistaa. */
  vahintaan?: boolean;
  /** Jokaisen lisätyn rivin tieto ja osoite ovat pakollisia. */
  kentatPakollisia?: boolean;
  otsikko?: string;
  ohje?: string;
  /** Jokaiselle riville oma arvo tai viesti. */
  kysyViesti?: boolean;
}) {
  const [rivit, setRivit] = useState<Rivi[]>(() =>
    Array.from({ length: alussa }, (_, indeksi) => ({
      id: indeksi + 1,
      kentta: "",
      url: "",
      viesti: "",
    })),
  );
  const [auki, setAuki] = useState<number | null>(() => (alussa > 0 ? 1 : null));
  const [luonnos, setLuonnos] = useState<number | null>(() => (alussa > 0 ? 1 : null));

  function lisaa() {
    const aukiRivi = rivit.find((rivi) => rivi.id === auki);
    if (aukiRivi && kentatPakollisia && riviPuutteellinen(aukiRivi)) {
      naytaRivinPuute(aukiRivi);
      return;
    }
    const tyhja =
      aukiRivi != null &&
      !aukiRivi.kentta &&
      !aukiRivi.url.trim() &&
      !aukiRivi.viesti.trim();
    if (tyhja) return;
    const id = rivit.reduce((isoin, rivi) => Math.max(isoin, rivi.id), 0) + 1;
    setRivit((edelliset) => [...edelliset, { id, kentta: "", url: "", viesti: "" }]);
    setAuki(id);
    setLuonnos(id);
  }

  function poista(id: number) {
    setRivit((edelliset) => {
      if (vahintaan && edelliset.length <= 1) return edelliset;
      return edelliset.filter((rivi) => rivi.id !== id);
    });
    if (auki === id) setAuki(null);
    if (luonnos === id) setLuonnos(null);
  }

  function paivita(id: number, osa: Partial<Omit<Rivi, "id">>) {
    setRivit((edelliset) =>
      edelliset.map((rivi) => (rivi.id === id ? { ...rivi, ...osa } : rivi)),
    );
  }

  return (
    <fieldset className="space-y-3 rounded border border-border px-3 py-3">
      <legend className="px-1 text-sm font-medium">{otsikko}</legend>
      <p className="text-sm text-muted">{ohje}</p>
      {rivit.map((rivi, jarjestys) => (
        <LisalahdeRivi
          key={rivi.id}
          tunniste={`lisalahde-${rivi.id}`}
          rivi={rivi}
          valinnat={valinnat}
          pakollinen={kentatPakollisia || (vahintaan && jarjestys === 0)}
          erotin={jarjestys > 0}
          kysyViesti={kysyViesti}
          auki={auki === rivi.id}
          onAvaa={() => setAuki(rivi.id)}
          onSulje={
            rivi.id === luonnos
              ? undefined
              : () => {
                  if (kentatPakollisia && riviPuutteellinen(rivi)) {
                    naytaRivinPuute(rivi);
                    return;
                  }
                  setAuki(null);
                }
          }
          onPaivita={(osa) => paivita(rivi.id, osa)}
          onPoista={vahintaan && rivit.length <= 1 ? undefined : () => poista(rivi.id)}
        />
      ))}
      <button
        type="button"
        onClick={lisaa}
        className="rounded border border-border bg-surface px-3 py-2 text-sm"
      >
        {kysyViesti ? "Lisää tieto" : "Lisää linkki"}
      </button>
      {alussa > 0 ? null : (
        <noscript>
          <LisalahdeLomake
            tunniste="lisalahde-0"
            valinnat={valinnat}
            kysyViesti={kysyViesti}
            erotin
          />
        </noscript>
      )}
    </fieldset>
  );
}

function tiivistelma(rivi: Rivi, valinnat: LisalahdeValinta[]): string {
  const nimi =
    rivi.kentta === "muu"
      ? "Muu tieto"
      : (valinnat.find((valinta) => valinta.arvo === rivi.kentta)?.nimi ?? "");
  const teksti = (rivi.viesti || rivi.url).replace(/\s+/g, " ").trim();
  if (!nimi && !teksti) return "Tyhjä rivi";
  if (!teksti) return nimi;
  if (!nimi) return teksti;
  return `${nimi}: ${teksti}`;
}

function LisalahdeRivi({
  tunniste,
  rivi,
  valinnat,
  pakollinen,
  erotin,
  kysyViesti,
  auki,
  onAvaa,
  onSulje,
  onPaivita,
  onPoista,
}: {
  tunniste: string;
  rivi: Rivi;
  valinnat: LisalahdeValinta[];
  pakollinen: boolean;
  erotin: boolean;
  kysyViesti: boolean;
  auki: boolean;
  onAvaa: () => void;
  onSulje?: () => void;
  onPaivita: (osa: Partial<Omit<Rivi, "id">>) => void;
  onPoista?: () => void;
}) {
  const luokka = erotin ? "border-t border-border pt-3" : "";

  if (!auki) {
    const teksti = tiivistelma(rivi, valinnat);
    return (
      <div className={`flex items-center justify-between gap-3 ${luokka}`}>
        <p className="min-w-0 flex-1 truncate text-sm" title={teksti}>
          {teksti}
        </p>
        <span className="flex shrink-0 gap-3">
          <button type="button" onClick={onAvaa} className="text-sm text-link underline">
            Muokkaa
          </button>
          {onPoista ? (
            <button type="button" onClick={onPoista} className="text-sm text-link underline">
              Poista
            </button>
          ) : null}
        </span>
        <input type="hidden" name="lisalahde_kentta" value={rivi.kentta} />
        <input type="hidden" name="lisalahde_url" value={rivi.url} />
        {kysyViesti ? <input type="hidden" name="lisalahde_viesti" value={rivi.viesti} /> : null}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${luokka}`}>
      <LisalahdeLomake
        tunniste={tunniste}
        valinnat={valinnat}
        kysyViesti={kysyViesti}
        pakollinen={pakollinen}
        rivi={rivi}
        onPaivita={onPaivita}
      />
      {onSulje || onPoista ? (
      <span className="flex gap-3">
        {onSulje ? (
          <button type="button" onClick={onSulje} className="text-sm text-link underline">
            Pienennä
          </button>
        ) : null}
        {onPoista ? (
          <button type="button" onClick={onPoista} className="text-sm text-link underline">
            Poista
          </button>
        ) : null}
      </span>
      ) : null}
    </div>
  );
}

function LisalahdeLomake({
  tunniste,
  valinnat,
  kysyViesti,
  pakollinen = false,
  erotin = false,
  rivi,
  onPaivita,
}: {
  tunniste: string;
  valinnat: LisalahdeValinta[];
  kysyViesti: boolean;
  pakollinen?: boolean;
  erotin?: boolean;
  rivi?: Rivi;
  onPaivita?: (osa: Partial<Omit<Rivi, "id">>) => void;
}) {
  return (
    <div className={erotin ? "space-y-3 border-t border-border pt-3" : "space-y-3"}>
      <p className="flex flex-col gap-1">
        <label htmlFor={`${tunniste}-kentta`} className="text-sm font-medium">
          Tieto
          {pakollinen ? <PakollinenMerkki /> : null}
        </label>
        <select
          id={`${tunniste}-kentta`}
          name="lisalahde_kentta"
          value={rivi ? rivi.kentta : undefined}
          defaultValue={rivi ? undefined : ""}
          required={pakollinen}
          onChange={onPaivita ? (tapahtuma) => onPaivita({ kentta: tapahtuma.target.value }) : undefined}
          className="rounded border border-border bg-surface px-2 py-2"
        >
          <option value="">Valitse tieto</option>
          {valinnat.map((valinta) => (
            <option key={valinta.arvo} value={valinta.arvo}>
              {valinta.nimi}
            </option>
          ))}
          <option value="muu">Muu tieto</option>
        </select>
      </p>
      <p className="flex flex-col gap-1">
        <label htmlFor={`${tunniste}-url`} className="text-sm font-medium">
          Osoite
          {pakollinen ? <PakollinenMerkki /> : null}
        </label>
        <input
          id={`${tunniste}-url`}
          name="lisalahde_url"
          type="url"
          required={pakollinen}
          placeholder="https://"
          value={rivi ? rivi.url : undefined}
          onChange={onPaivita ? (tapahtuma) => onPaivita({ url: tapahtuma.target.value }) : undefined}
          className="rounded border border-border bg-surface px-2 py-2"
        />
      </p>
      {kysyViesti ? (
        <p className="flex flex-col gap-1">
          <label htmlFor={`${tunniste}-viesti`} className="text-sm font-medium">
            Arvo tai viesti
          </label>
          <textarea
            id={`${tunniste}-viesti`}
            name="lisalahde_viesti"
            rows={2}
            value={rivi ? rivi.viesti : undefined}
            onChange={onPaivita ? (tapahtuma) => onPaivita({ viesti: tapahtuma.target.value }) : undefined}
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
      ) : null}
    </div>
  );
}
