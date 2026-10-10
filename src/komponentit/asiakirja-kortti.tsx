import { asiakirjaMetataInfo } from "@/lib/asiakirja-naytto";
import { kenttaNayttonimi } from "@/lib/naytto";
import type { AsiakirjanKaytto } from "@/lib/supabase/kyselyt";

type AsiakirjaRiviProps = {
  url: string;
  otsikko: string;
  otsikkoOnUrl: boolean;
  meta: string;
  kattaa: AsiakirjanKaytto[];
};

export function AsiakirjaRivi({ url, otsikko, otsikkoOnUrl, meta, kattaa }: AsiakirjaRiviProps) {
  return (
    <div className="py-1.5">
      <p className="text-sm leading-snug">
        <a
          href={url}
          className="font-medium text-link underline"
          rel="noopener noreferrer"
          title={!otsikkoOnUrl ? url : undefined}
        >
          {otsikko}
        </a>
        {meta ? <span className="text-muted"> · {meta}</span> : null}
      </p>
      {kattaa.length > 0 ? (
        <details className="asiakirja-kentat mt-0.5 text-xs text-muted">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            Käytetty {kattaa.length} kentässä
          </summary>
          <p className="mt-1 text-foreground/80">
            {kattaa
              .map((kaytto) => {
                const nimi = kenttaNayttonimi(kaytto.taulu, kaytto.kentta);
                const sivut =
                  kaytto.sivut.length > 0 ? ` (s. ${kaytto.sivut.join(", ")})` : "";
                return `${nimi}${sivut}`;
              })
              .join("; ")}
          </p>
        </details>
      ) : null}
    </div>
  );
}
