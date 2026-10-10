import type { Metadata } from "next";
import { AvoinDataLinkki } from "@/komponentit/avoin-data-linkki";
import { RyhtiKattavuus } from "@/komponentit/ryhti-kattavuus";
import { ENERGIA_MAAKUNTA_TUOTANTO } from "@/lib/energiateollisuus-tuotanto";
import { KEHITYSLOKI } from "@/lib/kehitysloki";
import {
  LAHDEAJO_SOVITIN_NIMET,
  LAHDEAJO_TILA_NIMET,
  muotoileAika,
  muotoilePvm,
} from "@/lib/naytto";
import { haeJulkisetLahdeajot } from "@/lib/supabase/kyselyt";
import { ESIVERSIO_TEKSTI, OSALLISTUMINEN_TEKSTI } from "@/lib/esiversio";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const metadata: Metadata = kortinMetatiedot({
  otsikko: `Tietoa palvelusta – ${SIVUSTON_OTSIKKO}`,
  kuvaus:
    "Mikä rekisteri on, mistä tiedot tulevat, mitä palveluun on muutettu ja milloin lähteitä on viimeksi haettu.",
  polku: "/tietoa",
});

export const revalidate = 60;

export default async function TietoaPalvelustaSivu() {
  const { ajot, katkaistu, virhe } = await haeJulkisetLahdeajot();
  const viimeisimmat = new Map<string, (typeof ajot)[number]>();
  for (const ajo of ajot) {
    if (!viimeisimmat.has(ajo.sovitin)) viimeisimmat.set(ajo.sovitin, ajo);
  }

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Tietoa palvelusta</h1>

      <section className="mt-8" aria-labelledby="mika-otsikko">
        <h2 id="mika-otsikko" className="text-xl font-semibold">
          Mikä tämä on
        </h2>
        <div className="mt-3 space-y-3 leading-relaxed">
          <p>{ESIVERSIO_TEKSTI}</p>
          <p>
            {OSALLISTUMINEN_TEKSTI}{" "}
            <a href="/ilmoitus" className="text-link underline">
              Ilmoita hanke tai täydennys
            </a>
            {" · "}
            <a href="/yhteys" className="text-link underline">
              Ota yhteyttä
            </a>
            .
          </p>
          <p>
            Datakeskushankkeiden kansallinen rekisteri on avoin hanketietokanta
            ja prosessiopas. Siihen kootaan Suomessa vireillä olevia
            datakeskushankkeita, niiden etenemistä, määräaikoja ja julkisia
            lähteitä.
          </p>
          <p>
            Sivusto ei ota kantaa yksittäisiin hankkeisiin. Julkaistu tieto
            merkitään lähteineen. Tyhjä kenttä on parempi kuin arvattu.
          </p>
          <p>
            Ilmoitus lomakkeella tai agentin ehdottama havainto ei siirry
            rekisteriin ennen kuin ylläpitäjä on tarkistanut lähteen.
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="yksityisyys-otsikko">
        <h2 id="yksityisyys" className="text-xl font-semibold">
          Yksityisyys
        </h2>
        <div className="mt-3 space-y-3 leading-relaxed">
          <p>
            Palvelu ei kerää käyttäjistä henkilötietoja eikä käytä analytiikkapalveluita,
            mainoksia tai seurantaevästeitä. Lomakkeet eivät kysy nimeä eivätkä
            yhteystietoja. Sivusto käyttää yhtä evästettä, jolla muistetaan esiversiota
            koskevan ilmoituksen kuittaus. Sivulatauksista tallennetaan vain sivun osoite
            ilman kävijään liittyvää tietoa.
          </p>
          <p>
            Rekisterin hanketiedoissa ei nimetä yksityishenkilöitä. Julkaistut tiedot koskevat
            organisaatioita, hankkeita ja viranomaismenettelyjä. Lähdeasiakirjat ovat julkisia
            viranomaisasiakirjoja, joihin viitataan linkillä. Niiden sisältöön palvelu ei vaikuta.
          </p>
          <p>
            Palvelinalusta kirjaa tavanomaisia pyyntölokeja, joissa on muun muassa IP-osoite.
            Lokeja käytetään vain palvelun toiminnan ja väärinkäytösten seurantaan, eikä niitä
            yhdistetä muuhun tietoon. Karttanäkymän karttaruudut haetaan ulkopuoliselta
            palvelimelta{" "}
            <a
              href="https://avoin-karttakuva.maanmittauslaitos.fi/"
              className="text-link underline"
              rel="noopener noreferrer"
            >
              Maanmittauslaitoksen Avoin karttakuva
            </a>
            -palvelusta, jolloin selaimen tekemä pyyntö näkyy sen lokeissa. Palvelu ei välitä
            sinne muuta tietoa.
          </p>
          <p>
            Lomakkeella lähetetyt viestit tallennetaan palvelun tietokantaan ja säilytetään enintään
            kaksitoista kuukautta, minkä jälkeen ne poistetaan. Jos viestiin on kirjoitettu
            henkilötietoja, ne poistetaan samalla. Lomake on tarkoitettu hanketietoja ja palvelua
            koskeviin ilmoituksiin, eikä siihen pidä kirjoittaa arkaluonteisia tietoja.
          </p>
          <p>
            Rekisterinpitäjä on Jyri Venninen yksityishenkilönä. Tieto päivitetään, kun toiminta
            siirtyy perusteilla olevalle yhdistykselle. Yhteydenotot{" "}
            <a href="/yhteys" className="text-link underline">
              lomakkeen kautta
            </a>
            .
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="yllapito-otsikko">
        <h2 id="yllapito-otsikko" className="text-xl font-semibold">
          Kuka ylläpitää
        </h2>
        <div className="mt-3 space-y-3 leading-relaxed">
          <p>
            Palvelun on rakentanut ja sitä ylläpitää Jyri Venninen yksityishenkilönä.
            Verkkotunnus on rekisteröity henkilökohtaisesti.
          </p>
          <p>
            Palvelu sai alkunsa Jokelan datakeskushankkeesta Tuusulassa. Ylläpitäjä asuu
            Tuusulassa ja seuraa hanketta oman kuntansa asukkaana. Tämä ei vaikuta
            siihen, mitä hankkeita rekisteriin otetaan tai miten ne esitetään.
          </p>
          <p>
            Ylläpito on omakustanteista. Kuluja ovat verkkotunnus, palvelinpalvelut ja
            kielimallirajapintojen käyttö. Palvelulla ei ole ulkopuolista rahoitusta,
            mainoksia eikä maksettua sisältöä.
          </p>
          <p>
            Palvelulle ollaan perustamassa yhdistystä, jonka sääntöihin tulee määräykset
            rahoituksen avoimuudesta ja riippumattomuudesta. Tämä tieto päivitetään, kun
            yhdistys on merkitty yhdistysrekisteriin.
          </p>
          <p>
            Yhteydenotot:{" "}
            <a href="/yhteys" className="text-link underline">
              Ota yhteyttä
            </a>
            .
          </p>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="aineistot-otsikko">
        <h2 id="aineistot-otsikko" className="text-xl font-semibold">
          Aineistot ja rajapinnat
        </h2>
        <p className="mt-3 leading-relaxed">
          Rakenteinen viranomaistieto haetaan rajapinnoista, ei kielimallilla.
          Mallia käytetään vain luonnollisen kielen dokumenttien lukemiseen.
          Linkit, dokumenttien muuttuminen, ristiriidat ja vanhentuneet lähteet
          tarkistetaan koodilla. Havainto menee jonoon.
        </p>
        <p className="mt-3 leading-relaxed">
          Kuntien päätösjärjestelmät (CloudNC, Tweb ja vastaavat) eivät kata
          kaikkia julkisia asiakirjoja eikä rakennuslupia. Aineisto voi alkaa
          vasta vuosia sen jälkeen, kun kohde on jo toiminnassa, ja hakusanat
          osuvat usein vain otsikkoihin. Ulkopuoliset lähdeselvitykset
          kirjataan hankkeen hakuhistoriaan; virheelliseksi arvioidut linkit
          eivät muutu automaattisesti kenttälähteiksi.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>Ryhti (SYKE): kaavakohteet, kun aineisto on toimitettu.</li>
          <li>PRH YTJ, avoin data, CC BY 4.0: organisaatioiden Y-tunnukset.</li>
          <li>Maanmittauslaitos, CC BY 4.0: geokoodaus ja taustakartta.</li>
          <li>Tilastokeskus, maakuntarajat (1:4 500 000), CC BY 4.0.</li>
          <li>
            {ENERGIA_MAAKUNTA_TUOTANTO.lahde_nimi}: maakuntien sähköntuotanto
            kartan vertailussa.
          </li>
          <li>
            Fingrid, avoin data, CC BY 4.0: valtakunnallinen sähköntuotanto.
            Luku tallennetaan ja päivitetään kerran tunnissa.
          </li>
          <li>
            OpenStreetMap: nimettyjen sähköasemien sijainnit karttakerroksena.
            Sijainti ei ole Fingridin virallinen liityntätieto.
          </li>
          <li>
            Kuntien julkiset esityslistat ja kuulutukset sekä ympäristöhallinnon
            YVA-sivut, kun osoite on tiedossa.
          </li>
        </ul>
        <RyhtiKattavuus luokka="mt-4" />
      </section>

      <section className="mt-10" aria-labelledby="avoin-data-otsikko">
        <h2 id="avoin-data-otsikko" className="text-xl font-semibold">
          Avoin data
        </h2>
        <p className="mt-3 leading-relaxed">
          Julkaistu rekisteri on ladattavissa koneluettavassa muodossa. Lisenssi:{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            className="text-link underline"
            rel="license"
          >
            Creative Commons Attribution 4.0 (CC BY 4.0)
          </a>
          . Viittaa lähteeseen: Datakeskushankkeiden kansallinen rekisteri.
          Aineisto kootaan lataushetkellä ja pidetään välimuistissa viisi
          minuuttia.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>
            <AvoinDataLinkki
              href="/data/hankkeet.json"
              nimi="Koko rekisteri (JSON)"
              tiedosto="hankkeet.json"
            />
          </li>
          <li>
            <AvoinDataLinkki
              href="/data/hankkeet.csv"
              nimi="Koko rekisteri (CSV)"
              tiedosto="hankkeet.csv"
            />
          </li>
          <li>
            <AvoinDataLinkki
              href="/data/hankkeet.gpkg"
              nimi="Koko rekisteri (GeoPackage)"
              tiedosto="hankkeet.gpkg"
            />
            <span className="text-muted">
              {" "}
              — pisteet, hankealueet ja johtoreitit, EPSG:4326.
            </span>
          </li>
          <li>
            <AvoinDataLinkki
              href="/muutokset/json"
              nimi="Hyväksytyt muutokset (JSON)"
              tiedosto="muutokset.json"
            />
          </li>
          <li>
            <a href="/muutokset/rss" className="text-link underline">
              Hyväksytyt muutokset (RSS)
            </a>
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          Yksittäisen hankkeen JSON: <code className="text-foreground">/hankkeet/[id]/json</code>.
          Asiakirjalista: <code className="text-foreground">/hankkeet/[id]/asiakirjat</code>.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="loki-otsikko">
        <details className="rounded border border-border">
          <summary className="cursor-pointer px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
            <h2 id="loki-otsikko" className="inline text-xl font-semibold">
              Muutosloki
            </h2>
          </summary>
          <div className="border-t border-border px-4 py-4">
            <p className="leading-relaxed text-muted">
              Merkinnät kuvaavat julkaistuja muutoksia palveluun.
            </p>
            {KEHITYSLOKI.map((merkinta) => (
              <article key={merkinta.pvm} className="mt-6">
                <h3 className="text-lg font-semibold">
                  <time dateTime={merkinta.pvm}>{muotoilePvm(merkinta.pvm)}</time>
                  {" · "}
                  {merkinta.otsikko}
                </h3>
                {merkinta.johdanto ? (
                  <p className="mt-2 leading-relaxed">{merkinta.johdanto}</p>
                ) : null}
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
                  {merkinta.kohdat.map((kohta) => (
                    <li key={kohta}>{kohta}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </details>
      </section>

      <section className="mt-10" aria-labelledby="ajot-otsikko">
        <h2 id="ajot-otsikko" className="text-xl font-semibold">
          Lähdeajot
        </h2>
        <p className="mt-3 leading-relaxed text-muted">
          Ajo hakee tai tarkistaa lähteen. Se kirjoittaa ehdotuksen jonoon,
          ei julkaistuun hanketietoon. Osumien määrä on haun tulos, ei
          hyväksyttyjen tietojen määrä. Ajat on merkitty suomen aikaa
          (Europe/Helsinki). GitHubin ajastetut haut käynnistyvät UTC-merkityn
          cronin mukaan (esim. tasatunti UTC ≈ klo 2/3 Suomessa talvi/kesä).
        </p>
        {virhe ? (
          <p className="mt-3">{virhe}</p>
        ) : ajot.length === 0 ? (
          <p className="mt-3">Ei kirjattuja ajoja.</p>
        ) : (
          <>
            <details className="mt-6 rounded border border-border">
              <summary className="cursor-pointer px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
                <h3 className="inline text-lg font-semibold">Viimeisin ajo sovittimittain</h3>
              </summary>
              <div className="border-t border-border px-4 py-3">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Kunkin sovittimen viimeisin lähdeajo</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Sovitin
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Tila
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Alkoi
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Osumia
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...viimeisimmat.values()]
                      .sort((a, b) => a.sovitin.localeCompare(b.sovitin, "fi"))
                      .map((ajo) => (
                        <tr key={ajo.sovitin} className="border-b border-border">
                          <td className="py-2 pr-3">
                            {LAHDEAJO_SOVITIN_NIMET[ajo.sovitin] ?? ajo.sovitin}
                          </td>
                          <td className="py-2 pr-3">
                            {LAHDEAJO_TILA_NIMET[ajo.tila] ?? ajo.tila}
                          </td>
                          <td className="py-2 pr-3">{muotoileAika(ajo.alkoi_pvm)}</td>
                          <td className="py-2">{ajo.osumia}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details className="mt-4 rounded border border-border">
              <summary className="cursor-pointer px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
                <h3 className="inline text-lg font-semibold">Kaikki kirjatut ajot</h3>
              </summary>
              <div className="border-t border-border px-4 py-3">
                {katkaistu ? (
                  <p className="mb-2 text-sm text-muted">
                    Näytetään 500 uusinta riviä.
                  </p>
                ) : null}
                <ul className="divide-y divide-border border-y border-border">
                  {ajot.map((ajo) => (
                    <li key={ajo.id} className="py-3">
                      <p>
                        {LAHDEAJO_SOVITIN_NIMET[ajo.sovitin] ?? ajo.sovitin}
                        {" · "}
                        {LAHDEAJO_TILA_NIMET[ajo.tila] ?? ajo.tila}
                        {ajo.http_tila != null ? ` · HTTP ${ajo.http_tila}` : ""}
                        {` · ${ajo.osumia} osumaa`}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {muotoileAika(ajo.alkoi_pvm)}
                        {ajo.paattyi_pvm ? ` – ${muotoileAika(ajo.paattyi_pvm)}` : ""}
                        {ajo.virhe ? ` · ${ajo.virhe}` : ""}
                      </p>
                      {ajo.kysely_url ? (
                        <p className="mt-1 text-sm">
                          <a
                            href={ajo.kysely_url}
                            className="text-link underline"
                            rel="noopener noreferrer"
                          >
                            {ajo.kysely_url}
                          </a>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
