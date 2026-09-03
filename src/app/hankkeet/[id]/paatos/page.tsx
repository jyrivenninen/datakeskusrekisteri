import { notFound, permanentRedirect } from "next/navigation";
import { lahetaPaatos } from "@/app/toiminnot";
import { LomakeLahetysNappi } from "@/komponentit/lomake-lahetysnappi";
import { LUOTTAMUS_NIMET } from "@/lib/naytto";
import { haeHanke, haeHankeOhjaus } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { LUOTTAMUSTASOT } from "@/lib/supabase/tietokanta";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

export default async function PaatosSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ virhe?: string; valmis?: string }>;
}) {
  const { id } = await params;
  const ohjaus = await haeHankeOhjaus(id);
  if (ohjaus && ohjaus !== id) permanentRedirect(`/hankkeet/${ohjaus}/paatos`);
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
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Ilmoita viranomaispäätös</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-muted">
        Merkitse päätös, sen päivä ja päättävä elin lähteineen. Päätöksen päivä on
        asiakirjan tai viranomaisen ilmoittama päivä, ei rekisterin tarkistuspäivä.
        {julkaiseSuoraan
          ? " Ylläpitäjänä ilmoitus julkaistaan heti."
          : " Ilmoitus ei julkaise tietoja suoraan. Ylläpitäjä tarkistaa lähteen."}
      </p>

      {query.virhe ? (
        <p className="mt-4 rounded border border-red-800 bg-red-50 px-3 py-2 text-sm dark:bg-red-950/40">
          {query.virhe}
        </p>
      ) : null}
      {query.valmis === "odottaa" ? (
        <p className="mt-4 rounded border border-border bg-muted/20 px-3 py-2 text-sm">
          Ilmoitus on jonossa. Ylläpitäjä tarkistaa sen ennen julkaisua.
        </p>
      ) : null}
      {query.valmis === "julkaistu" ? (
        <p className="mt-4 rounded border border-border bg-muted/20 px-3 py-2 text-sm">
          Päätös on julkaistu.
        </p>
      ) : null}

      <form action={lahetaPaatos} className="mt-8 space-y-6">
        <input type="hidden" name="hanke_id" value={hanke.id} />

        <div>
          <label htmlFor="kuvaus" className="block font-medium">
            Kuvaus
          </label>
          <p className="mt-1 text-sm text-muted">
            Mitä päätettiin? Esim. «Rakennuslupa myönnetty» tai «YVA-menettely päättynyt».
          </p>
          <input
            id="kuvaus"
            name="kuvaus"
            required
            className="mt-2 w-full rounded border border-border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="pvm" className="block font-medium">
            Päätöksen päivä
          </label>
          <input
            id="pvm"
            name="pvm"
            type="date"
            required
            className="mt-2 rounded border border-border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="paattava_organisaatio_nimi" className="block font-medium">
            Päättävä elin
          </label>
          <input
            id="paattava_organisaatio_nimi"
            name="paattava_organisaatio_nimi"
            required
            className="mt-2 w-full rounded border border-border px-3 py-2"
          />
        </div>

        <fieldset className="space-y-4 rounded border border-border p-4">
          <legend className="px-1 font-medium">Lähde</legend>
          <div>
            <label htmlFor="lahde_url" className="block text-sm font-medium">
              Lähteen osoite
            </label>
            <input
              id="lahde_url"
              name="lahde_url"
              type="url"
              required
              className="mt-1 w-full rounded border border-border px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="lahde_sivu" className="block text-sm font-medium">
              Sivunumero (PDF)
            </label>
            <input
              id="lahde_sivu"
              name="lahde_sivu"
              inputMode="numeric"
              className="mt-1 w-full rounded border border-border px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="lainaus" className="block text-sm font-medium">
              Lainaus lähteestä
            </label>
            <textarea
              id="lainaus"
              name="lainaus"
              rows={3}
              className="mt-1 w-full rounded border border-border px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="luottamus" className="block text-sm font-medium">
              Luottamus
            </label>
            <select
              id="luottamus"
              name="luottamus"
              defaultValue="vahvistettu"
              className="mt-1 w-full rounded border border-border px-3 py-2"
            >
              {LUOTTAMUSTASOT.filter((arvo) => arvo !== "ristiriitainen").map((arvo) => (
                <option key={arvo} value={arvo}>
                  {LUOTTAMUS_NIMET[arvo]}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <div>
          <label htmlFor="huomautus" className="block font-medium">
            Huomautus ylläpidolle (valinnainen)
          </label>
          <textarea
            id="huomautus"
            name="huomautus"
            rows={2}
            className="mt-2 w-full rounded border border-border px-3 py-2"
          />
        </div>

        <LomakeLahetysNappi
          valmis={julkaiseSuoraan ? "Julkaise päätös" : "Lähetä ilmoitus"}
          odottaa="Lähetetään…"
        />
      </form>
    </main>
  );
}
