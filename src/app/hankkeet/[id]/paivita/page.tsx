import { notFound, permanentRedirect } from "next/navigation";
import { lahetaKenttapaivitys, lahetaKenttaTarkistus } from "@/app/toiminnot";
import { LomakeLahetysNappi } from "@/komponentit/lomake-lahetysnappi";
import {
  onPaivitettavaHankeKentta,
  onVaihtoehtoKentta,
  tarkistusKenttaLomakkeesta,
  type PaivitettavaHankeKentta,
} from "@/lib/ehdotus";
import { HANKE_KENTTA_NIMET, LUOTTAMUS_NIMET, VAIHE_NIMET } from "@/lib/naytto";
import { haeHanke, haeHankeOhjaus, type HankeListalla } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { HANKE_VAIHEET, LUOTTAMUSTASOT } from "@/lib/supabase/tietokanta";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

function nykyinenHankeArvo(hanke: HankeListalla, kentta: PaivitettavaHankeKentta): string {
  if (kentta === "toimija_nimi") return hanke.toimija?.nimi ?? "";
  const arvo = hanke[kentta as Exclude<PaivitettavaHankeKentta, "toimija_nimi">];
  if (arvo == null || arvo === "") return "";
  return String(arvo);
}

export default async function KenttapaivitysSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    kentta?: string;
    vaihtoehto?: string;
    virhe?: string;
    valmis?: string;
  }>;
}) {
  const { id } = await params;
  const ohjaus = await haeHankeOhjaus(id);
  if (ohjaus && ohjaus !== id) permanentRedirect(`/hankkeet/${ohjaus}/paivita`);
  const query = await searchParams;
  const { hanke, vaihtoehdot, virhe: latausVirhe } = await haeHanke(id);
  if (latausVirhe || !hanke) notFound();

  const vaihtoehtoTunnus = query.vaihtoehto?.trim() ?? "";
  const kentta = query.kentta?.trim() ?? "";

  if (vaihtoehtoTunnus) {
    if (!onVaihtoehtoKentta(kentta)) notFound();
  } else if (!onPaivitettavaHankeKentta(kentta)) {
    notFound();
  }

  const vaihtoehto = vaihtoehtoTunnus
    ? vaihtoehdot.find((rivi) => rivi.tunnus === vaihtoehtoTunnus)
    : undefined;
  if (vaihtoehtoTunnus && !vaihtoehto) notFound();

  const nykyinen = vaihtoehto
    ? onVaihtoehtoKentta(kentta) && vaihtoehto[kentta] != null
      ? String(vaihtoehto[kentta])
      : ""
    : onPaivitettavaHankeKentta(kentta)
      ? nykyinenHankeArvo(hanke, kentta)
      : "";
  const { user: yllapitaja } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());
  const kenttaNimi = HANKE_KENTTA_NIMET[kentta] ?? kentta;

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
          {hanke.nimi}
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Päivitä kenttä</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-muted">
        {vaihtoehto ? `Vaihtoehto ${vaihtoehto.tunnus} · ` : null}
        {kenttaNimi}. Lähde merkitään samaan tapaan kuin muissakin rekisterin tiedoissa.
        {julkaiseSuoraan
          ? " Ylläpitäjänä päivitys julkaistaan heti."
          : " Ilmoitus ei julkaise tietoja suoraan. Ylläpitäjä tarkistaa lähteen."}
      </p>

      {query.valmis === "julkaistu" ? (
        <p className="mt-6 rounded border border-border bg-surface px-4 py-3" role="status">
          Kenttä julkaistiin.{" "}
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
        <form action={lahetaKenttapaivitys} className="mt-6 space-y-4">
          <input type="hidden" name="hanke_id" value={hanke.id} />
          <input type="hidden" name="kentta" value={kentta} />
          {vaihtoehto ? (
            <input type="hidden" name="vaihtoehto" value={vaihtoehto.tunnus} />
          ) : null}
          <input type="hidden" name="nykyinen_arvo" value={nykyinen} />

          <p className="text-sm text-muted">Nykyinen arvo: {nykyinen || "ei merkitty"}</p>

          <p className="flex flex-col gap-1">
            <label htmlFor="arvo" className="text-sm font-medium">
              Uusi arvo
            </label>
            {kentta === "vaihe" ? (
              <select
                id="arvo"
                name="arvo"
                required
                defaultValue={nykyinen}
                className="rounded border border-border bg-surface px-2 py-2"
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
                id="arvo"
                name="arvo"
                required
                defaultValue={nykyinen}
                className="rounded border border-border bg-surface px-2 py-2"
              />
            )}
          </p>

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
            valmis={julkaiseSuoraan ? "Julkaise päivitys" : "Lähetä tarkistettavaksi"}
            odottaa="Lähetetään…"
          />
        </form>
      )}

      {query.valmis || vaihtoehtoTunnus || !tarkistusKenttaLomakkeesta(kentta) || nykyinen ? null : (
        <form action={lahetaKenttaTarkistus} className="mt-10 space-y-4 border-t border-border pt-8">
          <input type="hidden" name="hanke_id" value={hanke.id} />
          <input type="hidden" name="kentta" value={kentta} />
          <h2 className="text-lg font-semibold">Ei julkista lähdettä</h2>
          <p className="text-sm leading-relaxed text-muted">
            Jos kenttä on käyty läpi eikä julkista lähdettä ole, merkitse se
            tähän. Arvoa ei täytetä. Sama tyhjä kenttä ei nouse uudelleen
            tarkistusjonoon, ennen kuin tämä merkintä vanhenee.
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="tarkistus_huomautus" className="text-sm font-medium">
              Huomautus (ei julkaista)
            </label>
            <textarea
              id="tarkistus_huomautus"
              name="huomautus"
              rows={3}
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          {julkaiseSuoraan ? null : (
            <p className="flex flex-col gap-1">
              <label htmlFor="tarkistus_tunniste" className="text-sm font-medium">
                Sähköposti tai muu yhteystieto (ei julkaista)
              </label>
              <input
                id="tarkistus_tunniste"
                name="ehdottaja_tunniste"
                className="rounded border border-border bg-surface px-2 py-2"
              />
            </p>
          )}
          <LomakeLahetysNappi
            valmis={julkaiseSuoraan ? "Merkitse tarkistetuksi" : "Lähetä tarkistus jonoon"}
            odottaa="Lähetetään…"
          />
        </form>
      )}
    </main>
  );
}
