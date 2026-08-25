import { lahetaIlmoitus } from "@/app/toiminnot";
import { IlmoitusKenttalohko } from "@/komponentit/ilmoitus-kenttalohko";
import { LomakeLahetysNappi } from "@/komponentit/lomake-lahetysnappi";
import { LOMAKE_KENTAT } from "@/lib/ehdotus";
import { haeJulkaistutHankkeet } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

export default async function IlmoitusSivu({
  searchParams,
}: {
  searchParams: Promise<{ virhe?: string; valmis?: string; tyyppi?: string }>;
}) {
  const params = await searchParams;
  const tyyppi = params.tyyppi === "taydennys" ? "taydennys" : "uusi_hanke";
  const { hankkeet } = await haeJulkaistutHankkeet();
  const { user: yllapitaja } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Ilmoita hanke tai täydennys</h1>
      <p className="mt-4 leading-relaxed text-muted">
        {julkaiseSuoraan
          ? "Ylläpitäjänä tallennus julkaistaan heti. Täytä vain kentät, joille on julkinen lähde. Tyhjä kenttä on parempi kuin arvattu."
          : "Ilmoitus ei julkaise tietoja suoraan. Ylläpitäjä tarkistaa lähteet ennen kuin mikään siirtyy rekisteriin. Täytä vain kentät, joille on julkinen lähde. Tyhjä kenttä on parempi kuin arvattu."}
      </p>
      <p className="mt-3 leading-relaxed text-muted">
        Yhteinen lähde riittää, jos kaikki täytetyt tiedot ovat samasta
        osoitteesta. Jos kenttä on eri asiakirjasta, anna sille oma osoite.
        Epävarma luku merkitään luottamuksella Epävarma (oletus); vahvistettu
        vain, kun kohta on lähteessä suoraan.
      </p>

      {params.valmis === "julkaistu" ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="status">
          Tiedot julkaistiin.
        </p>
      ) : null}
      {params.valmis === "1" ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="status">
          Kiitos. Ilmoitus on vastaanotettu ja odottaa tarkistusta.
        </p>
      ) : null}
      {params.virhe ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="alert">
          {params.virhe}
        </p>
      ) : null}

      <p className="mt-6 text-sm">
        <a
          href="/ilmoitus?tyyppi=uusi_hanke"
          className={tyyppi === "uusi_hanke" ? "font-semibold underline" : "text-link underline"}
        >
          Uusi hanke
        </a>
        {" · "}
        <a
          href="/ilmoitus?tyyppi=taydennys"
          className={tyyppi === "taydennys" ? "font-semibold underline" : "text-link underline"}
        >
          Täydennys
        </a>
      </p>

      <form action={lahetaIlmoitus} className="mt-6 space-y-4">
        <input type="hidden" name="tyyppi" value={tyyppi} />

        {tyyppi === "taydennys" ? (
          <p className="flex flex-col gap-1">
            <label htmlFor="hanke_id" className="text-sm font-medium">
              Hanke
            </label>
            <select
              id="hanke_id"
              name="hanke_id"
              required
              className="rounded border border-border bg-surface px-2 py-2"
            >
              <option value="">Valitse hanke</option>
              {hankkeet.map((hanke) => (
                <option key={hanke.id} value={hanke.id}>
                  {hanke.nimi} ({hanke.kunta})
                </option>
              ))}
            </select>
          </p>
        ) : null}

        <fieldset className="space-y-3 rounded border border-border px-3 py-3">
          <legend className="px-1 text-sm font-medium">Yhteinen lähde</legend>
          <p className="text-sm text-muted">
            Käytetään kentille, joille ei anneta omaa osoitetta.
            {tyyppi === "uusi_hanke"
              ? " Uudessa hankkeessa tarvitaan lähde nimelle, kunnalle ja vaiheelle."
              : ""}
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="lahde_url" className="text-sm font-medium">
              Lähteen osoite
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
              Sanatarkka kohta (jos sama kaikille)
            </label>
            <textarea
              id="lainaus"
              name="lainaus"
              rows={3}
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
        </fieldset>

        {LOMAKE_KENTAT.map((kentta) => (
          <IlmoitusKenttalohko
            key={kentta}
            kentta={kentta}
            pakollinen={tyyppi === "uusi_hanke" && ["nimi", "kunta", "vaihe"].includes(kentta)}
          />
        ))}

        <p className="flex flex-col gap-1">
          <label htmlFor="huomautus" className="text-sm font-medium">
            {julkaiseSuoraan ? "Muistiinpano (ei julkaista)" : "Lisätieto ylläpitäjälle"}
          </label>
          <textarea
            id="huomautus"
            name="huomautus"
            rows={3}
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
        <LomakeLahetysNappi
          valmis={julkaiseSuoraan ? "Julkaise" : "Lähetä tarkistettavaksi"}
          odottaa={julkaiseSuoraan ? "Julkaistaan…" : "Lähetetään…"}
        />
      </form>
    </main>
  );
}
