import { kirjauduSisaan } from "@/app/toiminnot";

export default async function KirjauduSivu({
  searchParams,
}: {
  searchParams: Promise<{ virhe?: string; seuraava?: string }>;
}) {
  const params = await searchParams;
  return (
    <main id="sisalto" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold">Ylläpitäjän kirjautuminen</h1>
      <p className="mt-3 text-sm text-muted">
        Kirjautuminen on vain rekisterin ylläpitäjille.
      </p>
      {params.virhe ? (
        <p className="mt-4" role="alert">
          {params.virhe}
        </p>
      ) : null}
      <form action={kirjauduSisaan} className="mt-6 space-y-4">
        <input type="hidden" name="seuraava" value={params.seuraava ?? "/yllapito"} />
        <p className="flex flex-col gap-1">
          <label htmlFor="sahkoposti" className="text-sm font-medium">
            Sähköposti
          </label>
          <input
            id="sahkoposti"
            name="sahkoposti"
            type="email"
            required
            autoComplete="username"
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
        <p className="flex flex-col gap-1">
          <label htmlFor="salasana" className="text-sm font-medium">
            Salasana
          </label>
          <input
            id="salasana"
            name="salasana"
            type="password"
            required
            autoComplete="current-password"
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
        <button
          type="submit"
          className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Kirjaudu
        </button>
      </form>
    </main>
  );
}
