import {
  MaaraajaHuomioMerkinta,
  maaraajaHuomioRiviLuokka,
} from "@/komponentit/maaraaja-huomio-merkinta";
import type { MaaraajaHuomio } from "@/lib/maaraaja-huomio";
import { lahdeLinkinNimi } from "@/lib/muutos-naytto";

export function AjankohtaLista({ children }: { children: React.ReactNode }) {
  return (
    <ul className="mt-3 min-h-[10.5rem] border-y border-border sm:min-h-[17.5rem]">
      {children}
    </ul>
  );
}

export function AjankohtaKohta({
  ylarivi,
  href,
  nimi,
  kunta,
  kuntaHref,
  piilotaKapealla = false,
  maaraajaHuomio = null,
}: {
  ylarivi: string;
  href: string;
  nimi: string;
  kunta: string;
  kuntaHref?: string | null;
  piilotaKapealla?: boolean;
  maaraajaHuomio?: MaaraajaHuomio | null;
}) {
  return (
    <li
      className={`flex h-14 flex-col justify-center border-b border-border last:border-b-0 ${
        piilotaKapealla ? "max-sm:hidden" : ""
      } ${maaraajaHuomioRiviLuokka(maaraajaHuomio != null)}`}
    >
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-0 text-sm">
        <span className="min-w-0 truncate">{ylarivi}</span>
        {maaraajaHuomio ? (
          <>
            {" "}
            <MaaraajaHuomioMerkinta huomio={maaraajaHuomio} />
          </>
        ) : null}
      </p>
      <p className="truncate text-sm">
        <a href={href} className="text-link underline">
          {nimi}
        </a>
        <span className="text-muted">
          {" ("}
          {kuntaHref ? (
            <a href={kuntaHref} className="text-link underline">
              {kunta}
            </a>
          ) : (
            kunta
          )}
          {")"}
        </span>
      </p>
    </li>
  );
}

export function LahdeRivi({
  url,
  otsikko,
}: {
  url: string | null;
  otsikko: string | null;
}) {
  if (!url) return null;
  return (
    <p className="mt-1 truncate text-sm">
      <a href={url} className="text-link underline">
        {lahdeLinkinNimi(otsikko, url)}
      </a>
    </p>
  );
}
