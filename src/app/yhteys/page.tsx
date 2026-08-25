import type { Metadata } from "next";
import { lahetaPalaute } from "@/app/toiminnot";
import { PALAUTE_AIHE_NIMET } from "@/lib/naytto";
import { PALAUTE_AIHEET } from "@/lib/supabase/tietokanta";

export const metadata: Metadata = {
  title: "Ota yhteyttä – Datakeskushankkeiden kansallinen rekisteri",
  description: "Viesti ylläpidolle. Ei julkaista.",
};

export default async function YhteysSivu({
  searchParams,
}: {
  searchParams: Promise<{ virhe?: string; valmis?: string }>;
}) {
  const params = await searchParams;

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Ota yhteyttä</h1>
      <p className="mt-4 max-w-prose leading-relaxed text-muted">
        Voit jättää palautetta, kysymyksen tai muun viestin ylläpidolle. Viesti
        ei näy julkisella sivustolla, eikä siitä lähde sähköpostia. Hanketiedot
        merkitään lähteineen{" "}
        <a href="/ilmoitus" className="text-link underline">
          ilmoituslomakkeella
        </a>
        .
      </p>

      {params.valmis ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="status">
          Kiitos. Viesti on vastaanotettu.
        </p>
      ) : null}
      {params.virhe ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="alert">
          {params.virhe}
        </p>
      ) : null}

      <form action={lahetaPalaute} className="mt-6 space-y-4">
        <p className="absolute left-[-10000px] h-px w-px overflow-hidden">
          <label htmlFor="organisaation_www">Jätä tyhjäksi</label>
          <input id="organisaation_www" name="organisaation_www" tabIndex={-1} autoComplete="off" />
        </p>
        <p className="flex flex-col gap-1">
          <label htmlFor="aihe" className="text-sm font-medium">
            Aihe
          </label>
          <select
            id="aihe"
            name="aihe"
            className="rounded border border-border bg-surface px-2 py-2"
            defaultValue="palaute"
          >
            {PALAUTE_AIHEET.map((aihe) => (
              <option key={aihe} value={aihe}>
                {PALAUTE_AIHE_NIMET[aihe]}
              </option>
            ))}
          </select>
        </p>
        <p className="flex flex-col gap-1">
          <label htmlFor="nimi" className="text-sm font-medium">
            Nimi (vapaaehtoinen)
          </label>
          <input
            id="nimi"
            name="nimi"
            maxLength={200}
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
        <p className="flex flex-col gap-1">
          <label htmlFor="sahkoposti" className="text-sm font-medium">
            Sähköposti (vapaaehtoinen, ei julkaista)
          </label>
          <input
            id="sahkoposti"
            name="sahkoposti"
            type="email"
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
        <p className="flex flex-col gap-1">
          <label htmlFor="viesti" className="text-sm font-medium">
            Viesti (pakollinen)
          </label>
          <textarea
            id="viesti"
            name="viesti"
            required
            minLength={12}
            maxLength={8000}
            rows={8}
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
        <button
          type="submit"
          className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Lähetä
        </button>
      </form>
    </main>
  );
}
