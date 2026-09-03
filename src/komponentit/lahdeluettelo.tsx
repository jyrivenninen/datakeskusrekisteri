import type { KenttaLahde } from "@/lib/supabase/tietokanta";
import { LUOTTAMUS_NIMET, MERKINTA_NIMET, muotoilePvm } from "@/lib/naytto";

export function Lahdeluettelo({ lahteet }: { lahteet: KenttaLahde[] }) {
  if (lahteet.length === 0) {
    return <p className="mt-3 text-sm text-muted">Lähdettä ei ole merkitty.</p>;
  }

  return (
    <ul className="mt-3 space-y-2 text-sm">
      {lahteet.map((lahde) => (
        <li key={lahde.id} className="rounded border border-border bg-background px-3 py-2">
          <p>
            <a href={lahde.lahde_url} className="text-link underline" rel="noopener noreferrer">
              {lahde.lahde_url}
            </a>
            {lahde.lahde_sivu != null ? ` (s. ${lahde.lahde_sivu})` : ""}
          </p>
          <p className="mt-1 text-muted">
            {LUOTTAMUS_NIMET[lahde.luottamus]} · {MERKINTA_NIMET[lahde.merkitty]} ·
            tarkistettu {muotoilePvm(lahde.vahvistettu_pvm)}
          </p>
          {lahde.lainaus ? (
            <blockquote className="mt-1 border-l-2 border-border pl-3 text-foreground">
              {lahde.lainaus}
            </blockquote>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
