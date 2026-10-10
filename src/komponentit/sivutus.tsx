export function Sivutus({
  sivu,
  sivuja,
  polku,
}: {
  sivu: number;
  sivuja: number;
  polku: (sivu: number) => string;
}) {
  if (sivuja <= 1) return null;
  const linkki =
    "inline-flex min-h-11 items-center text-link underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";
  return (
    <nav aria-label="Sivutus" className="mt-6 flex flex-wrap items-center gap-4 text-sm">
      {sivu > 1 ? (
        <a className={linkki} href={polku(sivu - 1)}>
          Edellinen
        </a>
      ) : (
        <span className="text-muted">Edellinen</span>
      )}
      <span>
        Sivu {sivu} / {sivuja}
      </span>
      {sivu < sivuja ? (
        <a className={linkki} href={polku(sivu + 1)}>
          Seuraava
        </a>
      ) : (
        <span className="text-muted">Seuraava</span>
      )}
    </nav>
  );
}
