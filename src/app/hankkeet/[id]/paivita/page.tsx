import { notFound, permanentRedirect } from "next/navigation";
import { lahetaKenttapaivitys, lahetaKenttaTarkistus, lahetaKenttaTyhjennys } from "@/app/toiminnot";
import { KenttaPaivitysLomake } from "@/komponentit/kentta-paivitys-lomake";
import { LomakeLahetysNappi } from "@/komponentit/lomake-lahetysnappi";
import { PakollinenMerkki } from "@/komponentit/pakollinen-merkki";
import {
  onPaivitettavaHankeKentta,
  onVaihtoehtoKentta,
  tarkistusKenttaLomakkeesta,
  tyhjennysKenttaLomakkeesta,
  type PaivitettavaHankeKentta,
} from "@/lib/ehdotus";
import { HANKE_KENTTA_NIMET, HANKETASON_VAIHTOEHTO_OHJE, LUOTTAMUS_NIMET, VAIHE_NIMET, muotoileLuku } from "@/lib/naytto";
import { haeHanke, haeHankeOhjaus, type HankeListalla } from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";
import { HANKE_VAIHEET, LUOTTAMUSTASOT, type HankeVaihe } from "@/lib/supabase/tietokanta";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

const LUKUKENTAT = new Set([
  "it_teho_mw",
  "teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
  "generaattori_yksikkoteho_mwe",
  "diesel_vuosikulutus_maara",
  "varavoima_paastot_t_co2e",
  "polttoainevarasto_maara",
]);

function nykyinenHankeArvo(hanke: HankeListalla, kentta: PaivitettavaHankeKentta): string {
  if (kentta === "toimija_nimi") return hanke.toimija?.nimi ?? "";
  const arvo = hanke[kentta as Exclude<PaivitettavaHankeKentta, "toimija_nimi">];
  if (arvo == null || arvo === "") return "";
  return String(arvo);
}

function yksikkoTeksti(yksikko: string | null | undefined): string {
  if (yksikko === "m3") return "m³";
  if (yksikko === "mw") return "MW";
  if (yksikko === "litra") return "litraa";
  return "";
}

function naytaNykyinen(kentta: string, arvo: string, yksikko?: string | null): string {
  if (!arvo) return "ei merkitty";
  if (kentta === "vaihe" && arvo in VAIHE_NIMET) {
    return VAIHE_NIMET[arvo as HankeVaihe];
  }
  const teksti = LUKUKENTAT.has(kentta) ? muotoileLuku(arvo) : arvo;
  const yksikkoNimi = yksikkoTeksti(yksikko);
  return yksikkoNimi ? `${teksti} ${yksikkoNimi}` : teksti;
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
  const yksikkoOletus =
    kentta === "diesel_vuosikulutus_maara"
      ? (vaihtoehto?.diesel_vuosikulutus_yksikko ?? hanke.diesel_vuosikulutus_yksikko ?? "litra")
      : kentta === "polttoainevarasto_maara"
        ? (vaihtoehto?.polttoainevarasto_yksikko ?? "m3")
        : "";
  const naytettavaArvo = naytaNykyinen(
    kentta,
    nykyinen,
    kentta === "diesel_vuosikulutus_maara" || kentta === "polttoainevarasto_maara"
      ? yksikkoOletus
      : null,
  );
  const voiTyhjentaa = Boolean(
    !vaihtoehtoTunnus && nykyinen && tyhjennysKenttaLomakkeesta(kentta),
  );

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
          Palaa hankkeeseen
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Päivitä kenttä</h1>

      <dl className="mt-6 space-y-3 rounded border border-border bg-surface px-4 py-4">
        <div>
          <dt className="text-sm text-muted">Hanke</dt>
          <dd className="font-medium">
            {hanke.nimi}
            <span className="font-normal text-muted"> · {hanke.kunta}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Kenttä</dt>
          <dd className="font-medium">
            {kenttaNimi}
            {vaihtoehto ? (
              <span className="font-normal text-muted"> · vaihtoehto {vaihtoehto.tunnus}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Nykyinen arvo</dt>
          <dd className="font-medium">{naytettavaArvo}</dd>
        </div>
      </dl>

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
        <KenttaPaivitysLomake
          action={lahetaKenttapaivitys}
          hankeId={hanke.id}
          kentta={kentta}
          vaihtoehto={vaihtoehto?.tunnus ?? null}
          nykyinenArvo={nykyinen}
          voiTyhjentaa={voiTyhjentaa}
          onVaihe={kentta === "vaihe"}
          vaiheValinnat={HANKE_VAIHEET.map((vaihe) => ({
            arvo: vaihe,
            nimi: VAIHE_NIMET[vaihe],
          }))}
          yksikko={
            kentta === "diesel_vuosikulutus_maara"
              ? "diesel"
              : kentta === "polttoainevarasto_maara"
                ? "polttoaine"
                : null
          }
          yksikkoOletus={yksikkoOletus}
          lainausPakollinen={kentta === "varavoima_paastot_t_co2e"}
          julkaiseSuoraan={julkaiseSuoraan}
          luottamusValinnat={LUOTTAMUSTASOT.map((taso) => ({
            arvo: taso,
            nimi: LUOTTAMUS_NIMET[taso],
          }))}
        />
      )}

      <p className="mt-6 max-w-prose text-sm leading-relaxed text-muted">
        Lähde merkitään samaan tapaan kuin muissakin rekisterin tiedoissa.
        {kentta === "it_teho_mw" || kentta === "teho_mw" ? (
          <>
            {" "}
            IT-teho on datakeskuksen IT-kuorma megawatteina. Teho on koko laitoksen
            sähköteho megawatteina. IT-teho on aina pienempi tai yhtä suuri kuin teho,
            kun molemmat on merkitty. Jos lähde antaa vain yhden erittelemättömän
            megawattiluvun, merkitse se vain toiseen kenttään. Jos lähde sanoo IT
            capacity tai IT load, luku on IT-teho. Muuten teho.
          </>
        ) : null}
        {vaihtoehto ? (
          <> Luku merkitään tälle vaihtoehdolle. Samaa lukua ei merkitä hankkeen yhteiseen kenttään.</>
        ) : [
            "teho_mw",
            "it_teho_mw",
            "pinta_ala_ha",
            "sahkonkaytto_twh_a",
            "generaattorit_lkm",
            "generaattori_polttoaineteho_mw",
            "generaattori_yksikkoteho_mwe",
            "diesel_vuosikulutus_maara",
            "varavoima_paastot_t_co2e",
          ].includes(kentta) ? (
          <> {HANKETASON_VAIHTOEHTO_OHJE}</>
        ) : null}
        {kentta === "generaattori_yksikkoteho_mwe" ? (
          <>
            {" "}
            Sähköteho generaattoria kohden. Ei ole sama kuin generaattoreiden
            yhteenlaskettu polttoaineteho.
          </>
        ) : null}
        {julkaiseSuoraan
          ? " Ylläpitäjänä päivitys julkaistaan heti."
          : " Ilmoitus ei julkaise tietoja suoraan. Ylläpitäjä tarkistaa lähteen."}
      </p>

      {query.valmis || !voiTyhjentaa ? null : (
        <noscript>
          <form action={lahetaKenttaTyhjennys} className="mt-10 space-y-4 border-t border-border pt-8">
            <input type="hidden" name="hanke_id" value={hanke.id} />
            <input type="hidden" name="kentta" value={kentta} />
            <h2 className="text-lg font-semibold">Tyhjennä arvo</h2>
            <p className="flex flex-col gap-1">
              <label htmlFor="noscript-kommentti" className="text-sm font-medium">
                Kommentti
                <PakollinenMerkki />
              </label>
              <textarea
                id="noscript-kommentti"
                name="perustelu"
                required
                minLength={12}
                rows={3}
                className="rounded border border-border bg-surface px-2 py-2"
              />
              <span className="text-sm text-muted">
                Kerro, miksi arvo tyhjennetään. Vähintään 12 merkkiä.
              </span>
            </p>
            {julkaiseSuoraan ? (
              <p className="flex items-start gap-2">
                <input
                  id="noscript-merkitse"
                  name="merkitse_ei_lahdetta"
                  type="checkbox"
                  value="kylla"
                  className="mt-1"
                />
                <label htmlFor="noscript-merkitse" className="text-sm">
                  Merkitse tyhjän kentän tarkistetuksi: julkista lähdettä ei ole
                </label>
              </p>
            ) : null}
            <button
              type="submit"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {julkaiseSuoraan ? "Tyhjennä ja julkaise" : "Lähetä tyhjennys tarkistettavaksi"}
            </button>
          </form>
        </noscript>
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
              Kommentti
            </label>
            <textarea
              id="tarkistus_huomautus"
              name="huomautus"
              rows={3}
              className="rounded border border-border bg-surface px-2 py-2"
            />
            <span className="text-sm text-muted">Vapaaehtoinen. Ei julkaista.</span>
          </p>
          <LomakeLahetysNappi
            valmis={julkaiseSuoraan ? "Merkitse tarkistetuksi" : "Lähetä tarkistus jonoon"}
            odottaa="Lähetetään…"
          />
        </form>
      )}
    </main>
  );
}
