import type { KenttaLahde } from "@/lib/supabase/tietokanta";
import { LUOTTAMUS_NIMET, MERKINTA_NIMET, muotoilePvm } from "@/lib/naytto";

export function Lahdeluettelo({ lahteet }: { lahteet: KenttaLahde[] }) {
  const maara = lahteet.length;
  return (
    <details className="mt-2">
      <summary className="w-fit cursor-pointer rounded border border-border bg-surface px-2 py-1 text-sm text-foreground">
        {maara === 0
          ? "Lähteet ja tarkenteet"
          : `Lähteet ja tarkenteet (${maara})`}
      </summary>
      {maara === 0 ? (
        <p className="mt-2 text-sm text-muted">Lähdettä ei ole merkitty.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {lahteet.map((lahde) => (
            <li key={lahde.id} className="rounded border border-border bg-background px-3 py-2">
              <p>
                <a
                  href={lahde.lahde_url}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {lahde.lahde_url}
                </a>
                {lahde.lahde_sivu != null ? ` (s. ${lahde.lahde_sivu})` : ""}
              </p>
              <p className="mt-1 text-muted">
                {LUOTTAMUS_NIMET[lahde.luottamus]} · {MERKINTA_NIMET[lahde.merkitty]} ·
                vahvistettu {muotoilePvm(lahde.vahvistettu_pvm)}
              </p>
              {lahde.lainaus ? (
                <blockquote className="mt-1 border-l-2 border-border pl-3 text-foreground">
                  {lahde.lainaus}
                </blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
