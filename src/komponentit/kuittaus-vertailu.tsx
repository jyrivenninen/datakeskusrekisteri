import type { KuittausTila } from "@/lib/kuittaus";

function KuittausTilaRivi({ otsikko, tila }: { otsikko: string; tila: KuittausTila }) {
  return (
    <div className="rounded border border-border bg-surface px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{otsikko}</p>
      <p className="mt-1">
        <span className="font-medium">{tila.arvo}</span>
        <span className="text-muted"> · {tila.luottamus}</span>
        <span className="text-muted"> · {tila.merkitty}</span>
      </p>
    </div>
  );
}

export function KuittausVertailu({
  vanha,
  uusi,
  ennenAgenttia,
}: {
  vanha: KuittausTila;
  uusi: KuittausTila;
  ennenAgenttia?: string | null;
}) {
  return (
    <div className="mt-2 space-y-2">
      {ennenAgenttia ? (
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">Ennen agenttia:</span> {ennenAgenttia}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <KuittausTilaRivi otsikko="Vanha (nyt julkaistu)" tila={vanha} />
        <KuittausTilaRivi otsikko="Uusi (kuittauksen jälkeen)" tila={uusi} />
      </div>
    </div>
  );
}
