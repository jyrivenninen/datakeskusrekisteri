import { notFound } from "next/navigation";
import { lahetaKuva } from "@/app/toiminnot";
import { LUOTTAMUS_NIMET } from "@/lib/naytto";
import { haeHanke } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { LUOTTAMUSTASOT } from "@/lib/supabase/tietokanta";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

export default async function KuvaEhdotusSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ virhe?: string; valmis?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { hanke, virhe: latausVirhe } = await haeHanke(id);
  if (latausVirhe || !hanke) notFound();

  const { user: yllapitaja } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
          {hanke.nimi}
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Lisää valokuva</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-muted">
        Kuva haetaan antamastasi osoitteesta. Rekisteri ei tallenna kuvatiedostoa.
        Merkitse kuvateksti ja valokuvaaja lähteen mukaan.
        {julkaiseSuoraan
          ? " Ylläpitäjänä kuva julkaistaan heti."
          : " Ilmoitus ei julkaise kuvaa suoraan. Ylläpitäjä tarkistaa lähteen."}
      </p>

      {query.valmis === "julkaistu" ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="status">
          Kuva julkaistiin.{" "}
          <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
            Palaa hankkeeseen
          </a>
        </p>
      ) : null}
      {query.valmis === "odottaa" ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="status">
          Ilmoitus odottaa tarkistusta.{" "}
          <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
            Palaa hankkeeseen
          </a>
        </p>
      ) : null}
      {query.virhe ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="alert">
          {query.virhe}
        </p>
      ) : null}

      {query.valmis ? null : (
        <form action={lahetaKuva} className="mt-6 space-y-4">
          <input type="hidden" name="hanke_id" value={hanke.id} />
          <p className="flex flex-col gap-1">
            <label htmlFor="kuva_url" className="text-sm font-medium">
              Kuvan osoite (https, pakollinen)
            </label>
            <input
              id="kuva_url"
              name="kuva_url"
              type="url"
              required
              placeholder="https://"
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="kuvateksti" className="text-sm font-medium">
              Kuvateksti
            </label>
            <textarea
              id="kuvateksti"
              name="kuvateksti"
              required
              rows={3}
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="kuvaaja" className="text-sm font-medium">
              Valokuvaaja
            </label>
            <input
              id="kuvaaja"
              name="kuvaaja"
              required
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="lahde_url" className="text-sm font-medium">
              Lähdesivu (jos eri kuin kuvan osoite)
            </label>
            <input
              id="lahde_url"
              name="lahde_url"
              type="url"
              placeholder="https://"
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="lahde_sivu" className="text-sm font-medium">
              Sivunumero (jos asiakirja)
            </label>
            <input
              id="lahde_sivu"
              name="lahde_sivu"
              inputMode="numeric"
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="lainaus" className="text-sm font-medium">
              Sanatarkka kohta lähteestä
            </label>
            <textarea
              id="lainaus"
              name="lainaus"
              rows={2}
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          {julkaiseSuoraan ? (
            <p className="flex flex-col gap-1">
              <label htmlFor="luottamus" className="text-sm font-medium">
                Luottamus
              </label>
              <select
                id="luottamus"
                name="luottamus"
                defaultValue="vahvistettu"
                className="rounded border border-border bg-surface px-2 py-2"
              >
                {LUOTTAMUSTASOT.map((taso) => (
                  <option key={taso} value={taso}>
                    {LUOTTAMUS_NIMET[taso]}
                  </option>
                ))}
              </select>
            </p>
          ) : null}
          <p className="flex flex-col gap-1">
            <label htmlFor="huomautus" className="text-sm font-medium">
              Lisätieto ylläpitäjälle
            </label>
            <textarea
              id="huomautus"
              name="huomautus"
              rows={2}
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          {julkaiseSuoraan ? null : (
            <p className="flex flex-col gap-1">
              <label htmlFor="ehdottaja_tunniste" className="text-sm font-medium">
                Sähköposti tai muu yhteystieto (ei julkaista)
              </label>
              <input
                id="ehdottaja_tunniste"
                name="ehdottaja_tunniste"
                className="rounded border border-border bg-surface px-2 py-2"
              />
            </p>
          )}
          <button
            type="submit"
            className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {julkaiseSuoraan ? "Julkaise valokuva" : "Lähetä tarkistettavaksi"}
          </button>
        </form>
      )}
    </main>
  );
}
