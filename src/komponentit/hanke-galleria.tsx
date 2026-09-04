import type { HankeKuva, KenttaLahde } from "@/lib/supabase/tietokanta";
import { poistaKuvaToiminto } from "@/app/toiminnot";

export function HankeGalleria({
  kuvat,
  lahteet,
  hankeId,
  yllapito = false,
}: {
  kuvat: HankeKuva[];
  lahteet: KenttaLahde[];
  hankeId?: string;
  yllapito?: boolean;
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
                {yllapito && hankeId ? (
                  <form action={poistaKuvaToiminto} className="pt-2">
                    <input type="hidden" name="hanke_id" value={hankeId} />
                    <input type="hidden" name="kuva_id" value={kuva.id} />
                    <button
                      type="submit"
                      className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
                    >
                      Poista kuva
                    </button>
                    <p className="mt-1 text-xs text-muted">
                      Piilottaa kuvan julkiselta sivulta. Tieto säilyy kannassa.
                    </p>
                  </form>
                ) : null}
              </figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
