import type { Metadata } from "next";
import { lahetaIlmoitus } from "@/app/toiminnot";
import { IlmoitusKenttalohko } from "@/komponentit/ilmoitus-kenttalohko";
import { PakollinenMerkki } from "@/komponentit/pakollinen-merkki";
import { IlmoitusLisalahteet } from "@/komponentit/ilmoitus-lisalahteet";
import { LomakeLahetysNappi } from "@/komponentit/lomake-lahetysnappi";
import { JULKINEN_ILMOITUS_KENTAT, JULKINEN_LISALAHDE_KENTAT, LOMAKE_KENTAT } from "@/lib/ehdotus";
import { HANKE_KENTTA_NIMET } from "@/lib/naytto";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";
import { haeJulkaistutHankkeet } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

export const metadata: Metadata = kortinMetatiedot({
  otsikko: `Ilmoita hanke – ${SIVUSTON_OTSIKKO}`,
  kuvaus: "Ilmoita datakeskushanke tai täydennä julkaistua tietoa. Ilmoitus tarkistetaan ennen julkaisua.",
  polku: "/ilmoitus",
});

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
  const julkinenTaydennys = !julkaiseSuoraan && tyyppi === "taydennys";
  const julkinenUusi = !julkaiseSuoraan && tyyppi === "uusi_hanke";
  const lisalahdeValinnat = JULKINEN_LISALAHDE_KENTAT.map((kentta) => ({
    arvo: kentta,
    nimi: HANKE_KENTTA_NIMET[kentta] ?? kentta,
  }));

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        {julkaiseSuoraan ? "Ilmoita hanke tai täydennys" : "Ilmoita hanke"}
      </h1>
      <p className="mt-4 leading-relaxed text-muted">
        {julkaiseSuoraan
          ? "Ylläpitäjänä tallennus julkaistaan heti. Täytä vain kentät, joille on julkinen lähde. Tyhjä kenttä on parempi kuin arvattu."
          : julkinenTaydennys
            ? "Valitse hanke ja tieto, anna osoite ja kirjoita arvo tai viesti. Ilmoitus ei tule heti rekisteriin."
            : "Kerro hankkeen nimi ja kunta. Anna osoite, josta tieto löytyy. Ilmoitus ei tule heti rekisteriin."}
      </p>
      {julkaiseSuoraan ? (
        <p className="mt-3 leading-relaxed text-muted">
          Yhteinen lähde riittää, jos kaikki täytetyt tiedot ovat samasta
          osoitteesta. Jos kenttä on eri asiakirjasta, anna sille oma osoite.
          Epävarma luku merkitään luottamuksella Epävarma (oletus); vahvistettu
          vain, kun kohta on lähteessä suoraan.
        </p>
      ) : null}

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
              <PakollinenMerkki />
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

        {julkinenUusi ? (
          <>
            {JULKINEN_ILMOITUS_KENTAT.map((kentta) => (
              <p key={kentta} className="flex flex-col gap-1">
                <label htmlFor={kentta} className="text-sm font-medium">
                  {HANKE_KENTTA_NIMET[kentta]}
                  <PakollinenMerkki />
                </label>
                <input
                  id={kentta}
                  name={kentta}
                  required
                  className="rounded border border-border bg-surface px-2 py-2"
                />
              </p>
            ))}
            <p className="flex flex-col gap-1">
              <label htmlFor="lahde_url" className="text-sm font-medium">
                Osoite
                <PakollinenMerkki />
              </label>
              <input
                id="lahde_url"
                name="lahde_url"
                type="url"
                required
                placeholder="https://"
                className="rounded border border-border bg-surface px-2 py-2"
              />
              <span className="text-sm text-muted">
                Uutinen, kunnan sivu tai muu julkinen osoite.
              </span>
            </p>
          </>
        ) : null}

        {julkaiseSuoraan ? (
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
              {tyyppi === "uusi_hanke" ? <PakollinenMerkki /> : null}
            </label>
            <input
              id="lahde_url"
              name="lahde_url"
              type="url"
              required={tyyppi === "uusi_hanke"}
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
        ) : null}

        {julkaiseSuoraan
          ? LOMAKE_KENTAT.map((kentta) => (
          <IlmoitusKenttalohko
            key={kentta}
            kentta={kentta}
            pakollinen={tyyppi === "uusi_hanke" && ["nimi", "kunta", "vaihe"].includes(kentta)}
          />
        ))
          : null}

        {julkaiseSuoraan ? null : (
          <IlmoitusLisalahteet
            valinnat={lisalahdeValinnat}
            alussa={julkinenTaydennys ? 1 : 0}
            vahintaan={julkinenTaydennys}
            otsikko={julkinenTaydennys ? "Täydennys" : "Muut linkit"}
            kysyViesti
            ohje={
              julkinenTaydennys
                ? "Valitse kenttä tai Muu tieto, anna osoite ja kirjoita arvo tai viesti. Voit lisätä useita."
                : "Jos tieto on eri osoitteessa, valitse mitä se koskee, anna osoite ja kirjoita arvo tai viesti."
            }
          />
        )}

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
        <LomakeLahetysNappi
          valmis={julkaiseSuoraan ? "Julkaise" : "Lähetä tarkistettavaksi"}
          odottaa={julkaiseSuoraan ? "Julkaistaan…" : "Lähetetään…"}
        />
      </form>
    </main>
  );
}
