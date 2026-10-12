import Link from "next/link";
import { redirect } from "next/navigation";
import {
  esikatseleUusiHankeLomakeToiminto,
  esikatseleUusiHankeTuontiToiminto,
  peruutaUusiHankeEsikatseluToiminto,
  UUSI_HANKE_ESIKATSELU_AVAIN,
  vahvistaUusiHankeTuontiToiminto,
} from "@/app/toiminnot";
import { LAHDE_TYYPIT, LAHDE_TYYPPI_NIMET } from "@/lib/lahde-metatiedot";
import { HANKE_KENTTA_NIMET, VAIHE_NIMET } from "@/lib/naytto";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";
import { HANKE_VAIHEET, SIJAINTI_ALUE_TYYPIT } from "@/lib/supabase/tietokanta";
import type { UusiHankeTuonti } from "@/lib/uusi-hanke-tuonti";
import type { TuplaOsuma } from "@/lib/uusi-hanke-tuplat";
import type { LahdeTyyppiRistiriita } from "@/lib/uusi-hanke-lahde-tyyppi-ristiriita";
import { haeYllapitoLuonnos } from "@/lib/yllapito-luonnos";

const LOMAKE_KENTTA_RIVIT = [
  "nimi",
  "kunta",
  "vaihe",
  "sijainti_alue_tyyppi",
  "pinta_ala_ha",
  "kaava_ala_ha",
  "teho_mw",
  "it_teho_mw",
  "kaavatunnus",
  "sijainti_lat",
  "sijainti_lon",
] as const;

type EsikatseluTila =
  | {
      vaihe: "virheet";
      json: string;
      virheet: Array<{ polku: string; viesti: string }>;
      varoitukset: Array<{ polku: string; viesti: string }>;
    }
  | {
      vaihe: "esikatselu";
      json: string;
      tuonti: UusiHankeTuonti;
      varoitukset: Array<{ polku: string; viesti: string }>;
      vainHeikotLahteet: boolean;
      tuplat: TuplaOsuma[];
      lahdeTyyppiRistiriidat?: LahdeTyyppiRistiriita[];
    };

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) {
    redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  }
  return { user, supabase };
}

function EsimerkkiJson() {
  return `{
  "nimi": "Esimerkkikampus",
  "kunta": "Esimerkkikunta",
  "vaihe": "kaavoitus",
  "toimija": {
    "nimi": "Esimerkki Oy",
    "y_tunnus": "1234567-8",
    "lahde_url": "https://kunta.fi/kuulutus.pdf",
    "lahde_tyyppi": "viranomaisasiakirja",
    "lainaus": "Esimerkki Oy kehittää datakeskusta."
  },
  "kentat": [
    {
      "kentta": "nimi",
      "arvo": "Esimerkkikampus",
      "lahteet": [{
        "url": "https://kunta.fi/kuulutus.pdf",
        "lahde_tyyppi": "viranomaisasiakirja",
        "julkaisija": "Esimerkkikunta",
        "asiakirjan_nimi": "Kuulutus",
        "paivays": "2026-01-15",
        "sivu": "1 (PDF)",
        "lainaus": "Asemakaavan nimi Esimerkkikampus."
      }]
    },
    {
      "kentta": "kunta",
      "arvo": "Esimerkkikunta",
      "lahteet": [{
        "url": "https://kunta.fi/kuulutus.pdf",
        "lahde_tyyppi": "viranomaisasiakirja",
        "sivu": "1",
        "lainaus": "Sijaintikunta Esimerkkikunta."
      }]
    },
    {
      "kentta": "vaihe",
      "arvo": "kaavoitus",
      "lahteet": [{
        "url": "https://kunta.fi/kuulutus.pdf",
        "lahde_tyyppi": "viranomaisasiakirja",
        "sivu": "1",
        "lainaus": "Asemakaavan muutos vireillä."
      }]
    },
    {
      "kentta": "sijainti_alue_tyyppi",
      "arvo": "kaava_alue",
      "lahteet": [{
        "url": "https://kunta.fi/kuulutus.pdf",
        "lahde_tyyppi": "viranomaisasiakirja",
        "sivu": "2",
        "lainaus": "Suunnittelualue asemakaavan rajauksen mukaan."
      }]
    },
    {
      "kentta": "pinta_ala_ha",
      "arvo": "40",
      "yksikko": "ha",
      "lahteet": [{
        "url": "https://kunta.fi/kuulutus.pdf",
        "lahde_tyyppi": "viranomaisasiakirja",
        "sivu": "3 (PDF)",
        "lainaus": "Hankealueen pinta-ala on noin 40 hehtaaria."
      }]
    }
  ],
  "roolit": [],
  "asiakirjat": [],
  "huomautus": "",
  "ilmoituksen_id": ""
}`;
}

export default async function UusiHankeSivu({
  searchParams,
}: {
  searchParams: Promise<{
    nakyma?: string;
    vaihe?: string;
    virhe?: string;
    ilmoituksen_id?: string;
  }>;
}) {
  const { user, supabase } = await vaadiYllapitaja();
  const params = await searchParams;
  const nakyma = params.nakyma === "lomake" ? "lomake" : "json";
  const ilmoituksenId = (params.ilmoituksen_id ?? "").trim();
  const navIlmoitus = ilmoituksenId
    ? `&ilmoituksen_id=${encodeURIComponent(ilmoituksenId)}`
    : "";
  // Tila tietokannassa: eväste (~4 kt) ei riitä Grokin tuonti-JSON:lle.
  const tila = await haeYllapitoLuonnos<EsikatseluTila>(
    supabase,
    user.id,
    UUSI_HANKE_ESIKATSELU_AVAIN,
  );

  const esimerkkJson = (() => {
    const pohja = JSON.parse(EsimerkkiJson()) as Record<string, unknown>;
    if (ilmoituksenId) pohja.ilmoituksen_id = ilmoituksenId;
    return JSON.stringify(pohja, null, 2);
  })();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-sm">
        <Link href="/yllapito" className="text-link underline">
          ← Ylläpito
        </Link>
        {ilmoituksenId ? (
          <>
            {" · "}
            <Link
              href={`/yllapito/${ilmoituksenId}`}
              className="text-link underline"
            >
              Takaisin ilmoitukseen
            </Link>
          </>
        ) : null}
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Uusi hanke</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Luo hanke lähteistettynä JSON-tuontina (ensisijainen) tai
        kenttäkohtaisella lomakkeella. Sama validointi, tuplatarkistus ja
        vahvistus ennen kirjoitusta. Ei automaattista julkaisua ilman
        vahvistusta.
      </p>

      {ilmoituksenId ? (
        <p className="mt-4 rounded border border-border bg-surface px-3 py-2 text-sm">
          Ilmoituksen id{" "}
          <code className="text-xs">{ilmoituksenId}</code> täytetään
          tuontiin. Vahvistus sulkee ilmoituksen hyväksytyksi ja liittää uuden
          hankkeen.
        </p>
      ) : null}

      {!supabasePalvelinAvainAsetettu() ? (
        <p className="mt-4 rounded border border-border bg-surface px-3 py-2 text-sm">
          Palvelinavain puuttuu — kirjoitus ei onnistu.
        </p>
      ) : null}

      {params.virhe ? (
        <p className="mt-4 rounded border border-border px-3 py-2 text-sm" role="alert">
          {params.virhe}
        </p>
      ) : null}

      <nav className="mt-6 flex gap-4 text-sm" aria-label="Tuontitapa">
        <Link
          href={`/yllapito/uusi-hanke?nakyma=json${navIlmoitus}`}
          className={
            nakyma === "json"
              ? "font-semibold underline"
              : "text-link underline"
          }
        >
          JSON-tuonti
        </Link>
        <Link
          href={`/yllapito/uusi-hanke?nakyma=lomake${navIlmoitus}`}
          className={
            nakyma === "lomake"
              ? "font-semibold underline"
              : "text-link underline"
          }
        >
          Kenttäkohtainen lomake
        </Link>
      </nav>

      {tila?.vaihe === "virheet" ? (
        <section className="mt-6 rounded border border-border bg-surface px-4 py-4">
          <h2 className="text-lg font-semibold">Validointivirheet</h2>
          <p className="mt-1 text-sm text-muted">
            Korjaa kaikki alla olevat — yhtään kenttää ei pudoteta hiljaa.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {tila.virheet.map((v, i) => (
              <li key={`${v.polku}-${i}`}>
                {v.polku ? (
                  <code className="text-xs">{v.polku}</code>
                ) : null}{" "}
                {v.viesti}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tila?.vaihe === "esikatselu" ? (
        <section className="mt-6 space-y-6 rounded border border-border bg-surface px-4 py-4">
          <h2 className="text-lg font-semibold">Esikatselu</h2>
          <p className="text-sm text-muted">
            Vahvista vasta kun olet tarkistanut kentät, lähteet ja
            tuplaosumat. Kirjoitus menee RPC:n kautta.
          </p>

          {tila.vainHeikotLahteet ? (
            <p className="rounded border border-border px-3 py-2 text-sm" role="status">
              Kaikki lähteet ovat media tai hankkeen_oma — vahvistus luo
              hankevinkin ja jättää ehdotuksen odottaa-tilaan (ei julkaisua).
            </p>
          ) : null}

          {tila.varoitukset.length > 0 ? (
            <div>
              <h3 className="font-medium">Varoitukset</h3>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {tila.varoitukset.map((v, i) => (
                  <li key={i}>{v.viesti}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {(tila.lahdeTyyppiRistiriidat?.length ?? 0) > 0 ? (
            <div
              className="rounded border border-border px-3 py-3"
              role="group"
              aria-labelledby="lahde-tyyppi-ristiriita-otsikko"
            >
              <h3
                id="lahde-tyyppi-ristiriita-otsikko"
                className="font-medium"
              >
                Lähdetyyppiristiriidat
              </h3>
              <p className="mt-1 text-sm text-muted">
                Sama URL on jo dokumentit-taulussa eri lähdetyypillä. Valitse
                ennen vahvistusta — tyyppiä ei ylikirjoiteta eikä ohiteta
                hiljaa. Nosto (esim. media → päätös) vaikuttaa
                varmistusmerkintään.
              </p>
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-medium">Tuotava hanke</h3>
              <dl className="mt-2 space-y-2 text-sm">
                <div>
                  <dt className="text-muted">Nimi</dt>
                  <dd className="font-medium">{tila.tuonti.nimi}</dd>
                </div>
                <div>
                  <dt className="text-muted">Kunta</dt>
                  <dd>{tila.tuonti.kunta}</dd>
                </div>
                <div>
                  <dt className="text-muted">Vaihe</dt>
                  <dd>
                    {VAIHE_NIMET[tila.tuonti.vaihe as keyof typeof VAIHE_NIMET] ??
                      tila.tuonti.vaihe}
                  </dd>
                </div>
                {tila.tuonti.toimija ? (
                  <div>
                    <dt className="text-muted">Toimija</dt>
                    <dd>
                      {tila.tuonti.toimija.nimi}
                      <span className="mt-0.5 block text-muted">
                        {LAHDE_TYYPPI_NIMET[
                          tila.tuonti.toimija
                            .lahde_tyyppi as keyof typeof LAHDE_TYYPPI_NIMET
                        ] ?? tila.tuonti.toimija.lahde_tyyppi}
                        {" — "}
                        <a
                          href={tila.tuonti.toimija.lahde_url}
                          className="text-link underline break-all"
                          rel="noreferrer"
                        >
                          {tila.tuonti.toimija.lahde_url}
                        </a>
                      </span>
                      <span className="mt-0.5 block">
                        «{tila.tuonti.toimija.lainaus}»
                      </span>
                    </dd>
                  </div>
                ) : null}
                {tila.tuonti.huomautus ? (
                  <div>
                    <dt className="text-muted">Huomautus</dt>
                    <dd className="whitespace-pre-wrap">{tila.tuonti.huomautus}</dd>
                  </div>
                ) : null}
                {tila.tuonti.ilmoituksen_id ? (
                  <div>
                    <dt className="text-muted">Ilmoituksen id</dt>
                    <dd className="break-all font-mono text-xs">
                      {tila.tuonti.ilmoituksen_id}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <h4 className="mt-4 font-medium">Kentät ja lähteet</h4>
              <ul className="mt-2 space-y-3 text-sm">
                {tila.tuonti.kentat.map((k) => (
                  <li key={k.kentta} className="border-t border-border pt-2">
                    <span className="font-medium">
                      {HANKE_KENTTA_NIMET[k.kentta] ?? k.kentta}
                    </span>
                    : {k.arvo}
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {k.lahteet.map((l, i) => (
                        <li key={i}>
                          {LAHDE_TYYPPI_NIMET[
                            l.lahde_tyyppi as keyof typeof LAHDE_TYYPPI_NIMET
                          ] ?? l.lahde_tyyppi}{" "}
                          —{" "}
                          <a
                            href={l.url}
                            className="text-link underline break-all"
                            rel="noreferrer"
                          >
                            {l.url}
                          </a>
                          {l.sivu ? ` s. ${l.sivu}` : null}
                          <span className="mt-0.5 block text-foreground">
                            «{l.lainaus}»
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {(tila.tuonti.asiakirjat?.length ?? 0) > 0 ? (
                <>
                  <h4 className="mt-4 font-medium">Asiakirjat</h4>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {tila.tuonti.asiakirjat!.map((a) => (
                      <li key={a.url}>
                        {a.otsikko} ({a.lahde_tyyppi})
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {(tila.tuonti.roolit?.length ?? 0) > 0 ? (
                <>
                  <h4 className="mt-4 font-medium">Roolit</h4>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {tila.tuonti.roolit!.map((r, i) => (
                      <li key={i}>
                        {r.rooli}: {r.organisaatio}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>

            <div>
              <h3 className="font-medium">Tuplaosumat (varoitus)</h3>
              {tila.tuplat.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Ei osumia rekisterissä.</p>
              ) : (
                <ul className="mt-2 space-y-3 text-sm">
                  {tila.tuplat.map((t) => (
                    <li
                      key={t.hanke_id}
                      className="rounded border border-border px-3 py-2"
                    >
                      <Link
                        href={`/hankkeet/${t.hanke_id}`}
                        className="font-medium text-link underline"
                      >
                        {t.nimi}
                      </Link>
                      <span className="text-muted"> · {t.kunta}</span>
                      <ul className="mt-1 list-disc pl-5 text-muted">
                        {t.syyt.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                      {t.vahva ? (
                        <p className="mt-2 font-medium">
                          Vahva osuma — täydennä olemassa olevaa hanketta uuden
                          luonnin sijaan.{" "}
                          <Link
                            href={`/hankkeet/${t.hanke_id}/paivita`}
                            className="text-link underline"
                          >
                            Avaa päivitys
                          </Link>
                        </p>
                      ) : (
                        <p className="mt-1 text-muted">
                          Sijaintiosumaa ei ehdoteta yhdistettäväksi.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <form action={vahvistaUusiHankeTuontiToiminto} className="space-y-4">
            <input type="hidden" name="json" value={tila.json} />
            {(tila.tuonti.ilmoituksen_id || ilmoituksenId) ? (
              <input
                type="hidden"
                name="ilmoituksen_id"
                value={tila.tuonti.ilmoituksen_id || ilmoituksenId}
              />
            ) : null}
            {(tila.lahdeTyyppiRistiriidat?.length ?? 0) > 0 ? (
              <fieldset className="space-y-4 rounded border border-border px-3 py-3">
                <legend className="px-1 text-sm font-medium">
                  Valitse lähdetyyppi jokaiselle ristiriidalle
                </legend>
                {tila.lahdeTyyppiRistiriidat!.map((r, i) => (
                  <div
                    key={r.url}
                    className="space-y-2 border-t border-border pt-3 text-sm first:border-t-0 first:pt-0"
                  >
                    <input
                      type="hidden"
                      name={`lahde_tyyppi_ristiriita_url_${i}`}
                      value={r.url}
                    />
                    <p className="break-all">
                      <a
                        href={r.url}
                        className="text-link underline"
                        rel="noreferrer"
                      >
                        {r.url}
                      </a>
                    </p>
                    <p>
                      Rekisterissä:{" "}
                      <strong>
                        {LAHDE_TYYPPI_NIMET[r.nykyinen_tyyppi] ??
                          r.nykyinen_tyyppi}
                      </strong>
                      {" → "}
                      JSON:{" "}
                      <strong>
                        {LAHDE_TYYPPI_NIMET[r.json_tyyppi] ?? r.json_tyyppi}
                      </strong>
                      {r.on_nosto ? (
                        <span className="mt-0.5 block text-muted">
                          Nosto varmistavaan tyyppiin — suositus: käytä JSON:n
                          tyyppiä, jos asiakirja sen tukee.
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lahde_tyyppi_ristiriita_valinta_${i}`}
                          value="json"
                          required
                          className="mt-1"
                          defaultChecked={r.on_nosto}
                        />
                        <span>
                          Käytä JSON:n tyyppiä (
                          {LAHDE_TYYPPI_NIMET[r.json_tyyppi] ?? r.json_tyyppi})
                          {r.on_nosto ? " — nosto" : null}
                        </span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lahde_tyyppi_ristiriita_valinta_${i}`}
                          value="nykyinen"
                          required
                          className="mt-1"
                        />
                        <span>
                          Säilytä rekisterin tyyppi (
                          {LAHDE_TYYPPI_NIMET[r.nykyinen_tyyppi] ??
                            r.nykyinen_tyyppi}
                          )
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </fieldset>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                {tila.vainHeikotLahteet
                  ? "Vahvista → hankevinkki + odottaa"
                  : "Vahvista ja luo hanke"}
              </button>
            </div>
          </form>
          <form action={peruutaUusiHankeEsikatseluToiminto}>
            {(tila.tuonti.ilmoituksen_id || ilmoituksenId) ? (
              <input
                type="hidden"
                name="ilmoituksen_id"
                value={tila.tuonti.ilmoituksen_id || ilmoituksenId}
              />
            ) : null}
            <button
              type="submit"
              className="rounded border border-border px-4 py-2 text-sm"
            >
              Muokkaa
            </button>
          </form>
        </section>
      ) : null}

      {nakyma === "json" && tila?.vaihe !== "esikatselu" ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">JSON-tuonti</h2>
          <p className="mt-1 text-sm text-muted">
            Vaihe 1: validointi → vaihe 2: esikatselu → vaihe 3: vahvistus.
            Rakenne on dokumentoitu GROK-OHJEET.md:ssä ja ylläpito-ohjeissa.
          </p>
          <form action={esikatseleUusiHankeTuontiToiminto} className="mt-4 space-y-3">
            {ilmoituksenId ? (
              <input type="hidden" name="ilmoituksen_id" value={ilmoituksenId} />
            ) : null}
            {ilmoituksenId ? (
              <p className="rounded border border-border px-3 py-2 text-sm" role="status">
                Tuonti liittyy ilmoitukseen{" "}
                <code className="text-xs">{ilmoituksenId}</code>. Jos JSON:ssa
                on tyhjä <code className="text-xs">ilmoituksen_id</code>, se
                täytetään tällä tunnisteella.
              </p>
            ) : null}
            <label htmlFor="json" className="block text-sm font-medium">
              Hankkeen JSON
            </label>
            <textarea
              id="json"
              name="json"
              rows={22}
              required
              defaultValue={
                tila?.vaihe === "virheet" ? tila.json : esimerkkJson
              }
              className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs"
              spellCheck={false}
            />
            <button
              type="submit"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Tarkista ja esikatsele
            </button>
          </form>
        </section>
      ) : null}

      {nakyma === "lomake" && tila?.vaihe !== "esikatselu" ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Kenttäkohtainen lomake</h2>
          <p className="mt-1 text-sm text-muted">
            Toissijainen tapa. Jokaisella rivillä arvo, lähde-URL, lähdetyyppi
            ja lainaus. Sama validointi ja esikatselu kuin JSON:lla.
          </p>
          <form
            action={esikatseleUusiHankeLomakeToiminto}
            className="mt-4 space-y-6"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nimi" className="text-sm font-medium">
                  Nimi (juuri)
                </label>
                <input
                  id="nimi"
                  name="nimi"
                  required
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="kunta" className="text-sm font-medium">
                  Kunta (juuri)
                </label>
                <input
                  id="kunta"
                  name="kunta"
                  required
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="vaihe" className="text-sm font-medium">
                  Vaihe (juuri)
                </label>
                <select
                  id="vaihe"
                  name="vaihe"
                  required
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                  defaultValue="kaavoitus"
                >
                  {HANKE_VAIHEET.map((v) => (
                    <option key={v} value={v}>
                      {VAIHE_NIMET[v] ?? v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ilmoituksen_id" className="text-sm font-medium">
                  Ilmoituksen id (valinnainen)
                </label>
                <input
                  id="ilmoituksen_id"
                  name="ilmoituksen_id"
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                  placeholder="muutosehdotukset.id"
                  defaultValue={ilmoituksenId}
                />
              </div>
            </div>

            <fieldset className="space-y-2 rounded border border-border px-3 py-3">
              <legend className="px-1 text-sm font-medium">Toimija</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  name="toimija_nimi"
                  placeholder="Organisaation nimi"
                  className="rounded border border-border px-2 py-1.5 text-sm"
                />
                <input
                  name="toimija_y_tunnus"
                  placeholder="Y-tunnus"
                  className="rounded border border-border px-2 py-1.5 text-sm"
                />
                <input
                  name="toimija_lahde_url"
                  placeholder="Lähde-URL"
                  className="rounded border border-border px-2 py-1.5 text-sm sm:col-span-2"
                />
                <select
                  name="toimija_lahde_tyyppi"
                  className="rounded border border-border px-2 py-1.5 text-sm"
                  defaultValue="viranomaisasiakirja"
                >
                  {LAHDE_TYYPIT.map((t) => (
                    <option key={t} value={t}>
                      {LAHDE_TYYPPI_NIMET[t]}
                    </option>
                  ))}
                </select>
                <textarea
                  name="toimija_lainaus"
                  placeholder="Lainaus"
                  rows={2}
                  className="rounded border border-border px-2 py-1.5 text-sm sm:col-span-2"
                />
              </div>
            </fieldset>

            <div className="space-y-4">
              <h3 className="font-medium">Kentät</h3>
              {LOMAKE_KENTTA_RIVIT.map((kentta) => (
                <fieldset
                  key={kentta}
                  className="space-y-2 rounded border border-border px-3 py-3"
                >
                  <legend className="px-1 text-sm font-medium">
                    {HANKE_KENTTA_NIMET[kentta] ?? kentta}
                  </legend>
                  <input type="hidden" name="kentta_nimi" value={kentta} />
                  {kentta === "vaihe" ? (
                    <select
                      name="kentta_arvo"
                      className="w-full rounded border border-border px-2 py-1.5 text-sm"
                      defaultValue=""
                    >
                      <option value="">—</option>
                      {HANKE_VAIHEET.map((v) => (
                        <option key={v} value={v}>
                          {VAIHE_NIMET[v] ?? v}
                        </option>
                      ))}
                    </select>
                  ) : kentta === "sijainti_alue_tyyppi" ? (
                    <select
                      name="kentta_arvo"
                      className="w-full rounded border border-border px-2 py-1.5 text-sm"
                      defaultValue=""
                      required
                    >
                      <option value="">—</option>
                      {SIJAINTI_ALUE_TYYPIT.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name="kentta_arvo"
                      className="w-full rounded border border-border px-2 py-1.5 text-sm"
                      required={kentta === "nimi" || kentta === "kunta"}
                    />
                  )}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      name="kentta_lahde_url"
                      placeholder="Lähde-URL"
                      required={
                        kentta === "nimi" ||
                        kentta === "kunta" ||
                        kentta === "vaihe" ||
                        kentta === "sijainti_alue_tyyppi"
                      }
                      className="rounded border border-border px-2 py-1.5 text-sm sm:col-span-2"
                    />
                    <select
                      name="kentta_lahde_tyyppi"
                      className="rounded border border-border px-2 py-1.5 text-sm"
                      defaultValue="viranomaisasiakirja"
                      required={
                        kentta === "nimi" ||
                        kentta === "kunta" ||
                        kentta === "vaihe" ||
                        kentta === "sijainti_alue_tyyppi"
                      }
                    >
                      {LAHDE_TYYPIT.map((t) => (
                        <option key={t} value={t}>
                          {LAHDE_TYYPPI_NIMET[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      name="kentta_sivu"
                      placeholder="Sivu"
                      className="rounded border border-border px-2 py-1.5 text-sm"
                    />
                    <textarea
                      name="kentta_lainaus"
                      placeholder="Lainaus"
                      rows={2}
                      required={
                        kentta === "nimi" ||
                        kentta === "kunta" ||
                        kentta === "vaihe" ||
                        kentta === "sijainti_alue_tyyppi"
                      }
                      className="rounded border border-border px-2 py-1.5 text-sm sm:col-span-3"
                    />
                  </div>
                </fieldset>
              ))}
            </div>

            <div>
              <label htmlFor="huomautus" className="text-sm font-medium">
                Huomautus
              </label>
              <textarea
                id="huomautus"
                name="huomautus"
                rows={3}
                className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
              />
            </div>

            <button
              type="submit"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Tarkista ja esikatsele
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-10 border-t border-border pt-6 text-sm leading-relaxed">
        <h2 className="font-semibold">Säännöt lyhyesti</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Jokaisella täytetyllä kentällä lähde-URL, lähdetyyppi ja lainaus.</li>
          <li>kaava_ala_ha ja pinta_ala_ha eri kenttiin.</li>
          <li>
            teho_mw / it_teho_mw: jos lähde ei erottele, vain toinen; monitoimi →
            teho tyhjä + huomautus.
          </li>
          <li>Organisaatiokenttiin vain organisaatio (ei henkilönimeä).</li>
          <li>sijainti_alue_tyyppi pakollinen; nimestä johdetut koordinaatit → arvio.</li>
          <li>
            Pelkät media / hankkeen_oma -lähteet → hankevinkki + odottaa, ei
            julkaisua.
          </li>
        </ul>
      </section>
    </main>
  );
}
