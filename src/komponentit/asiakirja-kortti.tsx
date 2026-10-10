"use client";

import {
  DOKUMENTTI_KIELI_NIMET,
  DOKUMENTTI_LAJI_NIMET,
  DOKUMENTTI_MUOTO_NIMET,
  kenttaNayttonimi,
  muotoilePvm,
} from "@/lib/naytto";
import type { AsiakirjanKaytto } from "@/lib/supabase/kyselyt";
import type { DokumenttiLaji, DokumenttiKieli, DokumenttiMuoto } from "@/lib/supabase/tietokanta";

type AsiakirjaKorttiProps = {
  url: string;
  otsikko: string;
  otsikkoOnUrl: boolean;
  laji: DokumenttiLaji;
  muoto: DokumenttiMuoto | null;
  kieli: DokumenttiKieli | null;
  julkaisija: string | null;
  julkaistu_pvm: string | null;
  tunnus: string | null;
  sivumaara: number | null;
  kattaa: AsiakirjanKaytto[];
};

export function AsiakirjaKortti({
  url,
  otsikko,
  otsikkoOnUrl,
  laji,
  muoto,
  kieli,
  julkaisija,
  julkaistu_pvm,
  tunnus,
  sivumaara,
  kattaa,
}: AsiakirjaKorttiProps) {
  return (
    <details className="asiakirja-kortti rounded border border-border bg-surface">
      <summary className="asiakirja-kortti-yhteenveto cursor-pointer px-3 py-2">
        <span className="flex items-start gap-2">
          <a
            href={url}
            className="min-w-0 flex-1 font-medium text-link underline"
            rel="noopener noreferrer"
            title={!otsikkoOnUrl ? url : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {otsikko}
          </a>
          <span className="asiakirja-kortti-nuoli mt-0.5 shrink-0 text-muted" aria-hidden>
            ▾
          </span>
        </span>
        <span className="sr-only">Metatiedot ja kentät</span>
      </summary>
      <div className="border-t border-border px-3 py-2 text-sm">
        <p className="text-muted">
          {DOKUMENTTI_LAJI_NIMET[laji]}
          {muoto ? ` · ${DOKUMENTTI_MUOTO_NIMET[muoto]}` : ""}
          {kieli ? ` · ${DOKUMENTTI_KIELI_NIMET[kieli]}` : ""}
          {julkaisija ? ` · ${julkaisija}` : ""}
          {julkaistu_pvm ? ` · ${muotoilePvm(julkaistu_pvm)}` : ""}
          {tunnus ? ` · ${tunnus}` : ""}
          {sivumaara != null ? ` · ${sivumaara} s.` : ""}
        </p>
        {kattaa.length > 0 ? (
          <p className="mt-2">
            Käytetty kentissä:{" "}
            {kattaa
              .map((kaytto) => {
                const nimi = kenttaNayttonimi(kaytto.taulu, kaytto.kentta);
                const sivut =
                  kaytto.sivut.length > 0 ? ` (s. ${kaytto.sivut.join(", ")})` : "";
                return `${nimi}${sivut}`;
              })
              .join("; ")}
          </p>
        ) : (
          <p className="mt-2 text-muted">Ei vielä kytketty rekisterin faktakenttiin.</p>
        )}
      </div>
    </details>
  );
}
