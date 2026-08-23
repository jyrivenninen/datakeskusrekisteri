import type { YhteyshenkiloHakemistossa } from "@/lib/supabase/kyselyt";

export function YhteyshenkiloLista({
  henkilot,
}: {
  henkilot: YhteyshenkiloHakemistossa[];
}) {
  if (henkilot.length === 0) {
    return <p className="mt-3">Ei merkittyjä yhteyshenkilöitä.</p>;
  }

  return (
    <ul className="mt-4 divide-y divide-border border-y border-border">
      {henkilot.map((henkilo) => (
        <li key={henkilo.id} className="py-4">
          <p className="font-medium">{henkilo.nimi}</p>
          <p className="mt-1 text-sm text-muted">{henkilo.rooli}</p>
          {henkilo.organisaatio ? (
            <p className="mt-1 text-sm">
              <a
                href={`/organisaatiot/${henkilo.organisaatio.id}`}
                className="text-link underline"
              >
                {henkilo.organisaatio.nimi}
              </a>
            </p>
          ) : null}
          {henkilo.hanke ? (
            <p className="mt-1 text-sm">
              Hanke:{" "}
              <a href={`/hankkeet/${henkilo.hanke.id}`} className="text-link underline">
                {henkilo.hanke.nimi}
              </a>
              <span className="text-muted"> ({henkilo.hanke.kunta})</span>
            </p>
          ) : null}
          {henkilo.sahkoposti ? (
            <p className="mt-1 text-sm">
              <a href={`mailto:${henkilo.sahkoposti}`} className="text-link underline">
                {henkilo.sahkoposti}
              </a>
            </p>
          ) : null}
          {henkilo.puhelin ? <p className="mt-1 text-sm">{henkilo.puhelin}</p> : null}
        </li>
      ))}
    </ul>
  );
}
