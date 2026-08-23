import type { HankeKuva, KenttaLahde } from "@/lib/supabase/tietokanta";

export function HankeGalleria({
  kuvat,
  lahteet,
}: {
  kuvat: HankeKuva[];
  lahteet: KenttaLahde[];
}) {
  if (kuvat.length === 0) {
    return <p className="mt-3 text-muted">Ei merkittyjä valokuvia.</p>;
  }

  return (
    <ul className="mt-4 grid gap-6 sm:grid-cols-2">
      {kuvat.map((kuva) => {
        const kuvanLahteet = lahteet.filter((lahde) => lahde.rivi_id === kuva.id);
        return (
          <li key={kuva.id}>
            <figure className="overflow-hidden rounded border border-border bg-surface">
              <img
                src={kuva.kuva_url}
                alt={kuva.kuvateksti}
                className="h-64 w-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
              <figcaption className="space-y-1 p-3 text-sm">
                <p>{kuva.kuvateksti}</p>
                <p className="text-muted">Valokuva: {kuva.kuvaaja}</p>
                {kuvanLahteet[0] ? (
                  <p>
                    <a
                      href={kuvanLahteet[0].lahde_url}
                      className="text-link underline"
                      rel="noopener noreferrer"
                    >
                      Lähde
                    </a>
                  </p>
                ) : null}
              </figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
