import { lahetaIlmoitus } from "@/app/toiminnot";
import { HANKE_KENTTA_NIMET, VAIHE_NIMET } from "@/lib/naytto";
import { LOMAKE_KENTAT } from "@/lib/ehdotus";
import { HANKE_VAIHEET } from "@/lib/supabase/tietokanta";
import { haeJulkaistutHankkeet } from "@/lib/supabase/kyselyt";

export default async function IlmoitusSivu({
  searchParams,
}: {
  searchParams: Promise<{ virhe?: string; valmis?: string; tyyppi?: string }>;
}) {
  const params = await searchParams;
  const tyyppi = params.tyyppi === "taydennys" ? "taydennys" : "uusi_hanke";
  const { hankkeet } = await haeJulkaistutHankkeet();

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Ilmoita hanke tai täydennys</h1>
      <p className="mt-4 max-w-prose leading-relaxed text-muted">
        Ilmoitus ei julkaise tietoja suoraan. Ylläpitäjä tarkistaa lähteet ennen
        kuin mikään siirtyy rekisteriin.
      </p>

      {params.valmis ? (
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

        {LOMAKE_KENTAT.map((kentta) => (
          <p key={kentta} className="flex flex-col gap-1">
            <label htmlFor={kentta} className="text-sm font-medium">
              {kentta === "toimija_nimi"
                ? "Hankkeesta vastaava (nimi)"
                : HANKE_KENTTA_NIMET[kentta] ?? kentta}
              {tyyppi === "uusi_hanke" && ["nimi", "kunta", "vaihe"].includes(kentta)
                ? " (pakollinen)"
                : ""}
            </label>
            {kentta === "vaihe" ? (
              <select
                id={kentta}
                name={kentta}
                required={tyyppi === "uusi_hanke"}
                className="rounded border border-border bg-surface px-2 py-2"
                defaultValue=""
              >
                <option value="">Valitse vaihe</option>
                {HANKE_VAIHEET.map((vaihe) => (
                  <option key={vaihe} value={vaihe}>
                    {VAIHE_NIMET[vaihe]}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={kentta}
                name={kentta}
                required={tyyppi === "uusi_hanke" && ["nimi", "kunta"].includes(kentta)}
                className="rounded border border-border bg-surface px-2 py-2"
              />
            )}
          </p>
        ))}

        <p className="flex flex-col gap-1">
          <label htmlFor="lahde_url" className="text-sm font-medium">
            Lähteen osoite (pakollinen)
          </label>
          <input
            id="lahde_url"
            name="lahde_url"
            type="url"
            required
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
            rows={3}
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
        <p className="flex flex-col gap-1">
          <label htmlFor="huomautus" className="text-sm font-medium">
            Lisätieto ylläpitäjälle
          </label>
          <textarea
            id="huomautus"
            name="huomautus"
            rows={3}
            className="rounded border border-border bg-surface px-2 py-2"
          />
        </p>
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
        <button
          type="submit"
          className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Lähetä tarkistettavaksi
        </button>
      </form>
    </main>
  );
}
