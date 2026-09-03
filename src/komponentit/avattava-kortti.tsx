import type { ReactNode } from "react";
import { Lahdeluettelo } from "@/komponentit/lahdeluettelo";
import { Liikennevalo } from "@/komponentit/liikennevalo";
import type { KentanTila } from "@/lib/naytto";
import type { KenttaLahde } from "@/lib/supabase/tietokanta";

export function Korttiruudukko({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

export function AvattavaKortti({
  nimi,
  arvo,
  tila,
  lahteet,
  toiminnot,
  tarkistus,
}: {
  nimi: string;
  arvo: ReactNode;
  tila: KentanTila;
  lahteet: KenttaLahde[];
  toiminnot?: ReactNode;
  tarkistus?: string | null;
}) {
  return (
    <details className="faktakortti rounded border border-border bg-surface">
      <summary className="faktakortti-yhteenveto cursor-pointer p-3">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm text-muted">{nimi}</span>
            <span className="mt-1 block font-medium">{arvo}</span>
          </span>
          <Liikennevalo tila={tila} tiivis />
        </span>
      </summary>
      <div className="border-t border-border px-3 pb-3">
        <p className="sr-only">Lähteet ja tarkenteet: {nimi}</p>
        <Lahdeluettelo lahteet={lahteet} />
        {tarkistus ? <p className="mt-3 text-sm text-muted">{tarkistus}</p> : null}
        {toiminnot ? <div className="mt-3 text-sm">{toiminnot}</div> : null}
      </div>
    </details>
  );
}
