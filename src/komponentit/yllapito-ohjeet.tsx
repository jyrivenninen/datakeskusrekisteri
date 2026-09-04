import type { ReactNode } from "react";

function OhjeKohta({
  otsikko,
  id,
  children,
}: {
  otsikko: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded border border-border">
      <summary
        id={id}
        className="cursor-pointer px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
      >
        {otsikko}
      </summary>
      <div className="border-t border-border px-3 py-3">
        <ul className="list-disc space-y-1 pl-5">{children}</ul>
      </div>
    </details>
  );
}

export function YllapitoOhjeet({ massahyvaksynta = false }: { massahyvaksynta?: boolean }) {
  return (
    <details className="mt-6 rounded border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
        Ohjeet
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4 text-sm leading-relaxed">
        <p>
          Jonossa on kolmenlaisia rivejä.{" "}
          <span className="rounded-sm border border-teal-800 bg-teal-100 px-1.5 py-0.5 font-medium text-teal-950 dark:border-teal-300 dark:bg-teal-950 dark:text-teal-50">
            Täydennys
          </span>{" "}
          (sinivihreä) julkaisee tietoja rekisteriin. Agentti voi julkaista uutta
          tietoa automaattisesti; se näkyy «Odottaa kuittausta» -listassa, kunnes
          merkitset sen varmennetuksi.{" "}
          <span className="rounded-sm border border-sky-800 bg-sky-100 px-1.5 py-0.5 font-medium text-sky-950 dark:border-sky-300 dark:bg-sky-950 dark:text-sky-50">
            Kenttämuutos
          </span>{" "}
          (sininen) merkitsee tyhjän kentän tarkistetuksi tai poistaa virheellisen
          arvon — ei uutta lukua.{" "}
          <span className="rounded-sm border border-violet-800 bg-violet-100 px-1.5 py-0.5 font-medium text-violet-950 dark:border-violet-300 dark:bg-violet-950 dark:text-violet-50">
            Havainto
          </span>{" "}
          (violetti) merkitsee asian nähdyksi; se ei yleensä muuta hankesivua.
          Avaa rivi aina ennen päätöstä. Kirjaa havainto ja lähde; älä päättele
          toimijoiden aikeita.
        </p>

        <div className="space-y-2">
          <OhjeKohta otsikko="Kentän merkintä ja tyhjennys" id="ohje-kentta">
            <li>
              <strong className="font-medium">Kenttä tarkistettu ilman lähdettä</strong>{" "}
              merkitsee tyhjän kentän tarkistetuksi. Hyväksyntä ei täytä arvoa.
              Toimii vain, jos kenttä on jo tyhjä rekisterissä.
            </li>
            <li>
              <strong className="font-medium">Kentän tyhjennys</strong> poistaa
              virheellisen julkaistun arvon ja lähteet. Käytä, jos arvoa ei voi
              korvata uudella lähteellä.
            </li>
            <li>
              Jos kentässä on jo arvo, älä hyväksy «ei julkista lähdettä» -tarkistusta —
              hylkää ja tee tyhjennys tai korjaus.
            </li>
          </OhjeKohta>

          <OhjeKohta otsikko="Täydennys, korjaus, uusi hanke ja valokuva" id="ohje-taydennys">
            <li>
              Avaa ehdotus. Vertaa jokaista kenttää sen omaan lähdeosoitteeseen
              ja lainaukseen (osoite voi olla yhteinen tai kenttäkohtainen).
              Sivunumero tarvitaan, jos lähde on dokumentti. Luottamus
              (vahvistettu / epävarma) tulee ehdotuksesta; älä hyväksy
              epävarmaa lukua vahvistettuna.
            </li>
            <li>
              Jos kenttä on tyhjä sen jälkeen kun se on käyty läpi, merkitse
              päivityslomakkeella ettei julkista lähdettä ole. Hyväksyntä ei
              täytä arvoa. Lähdepakko arvollisille kentille pysyy.
            </li>
            <li>
              Kirjautuneen ylläpitäjän ilmoitus tai täydennys{" "}
              <code className="text-xs">/ilmoitus</code>-lomakkeelta, kentän
              päivitys ja valokuva julkaistaan heti. Ulkopuolisen ilmoitus jää
              jonoon.
            </li>
            <li>
              <strong className="font-medium">Hyväksy ja julkaise</strong>{" "}
              kirjoittaa jonossa odottavat tiedot hankkeeseen ja merkitsee ne
              ihmisen vahvistamiksi. Muutos samalla luottamustasolla vaatii tämän.
            </li>
            <li>
              <strong className="font-medium">Määräaika</strong> julkaisee
              vaikuttamisen määräajan etusivulle ja hankesivulle. Tarkista päivämäärät
              ja lainaus lähteestä ennen hyväksyntää.
            </li>
            <li>
              Automaattijulkaistu tieto (agentti) odottaa erikseen{" "}
              <strong className="font-medium">kuittausta</strong>{" "}
              <a href="/yllapito/kuittaus" className="text-link underline">
                kuittausnäkymässä
              </a>
              . Kuittaus ei tarkista arvoa uudelleen — valitse ensin suodatin, merkitse
              kuittattavat rivit ja tallenna. Luottamus voi muuttua erikseen ilman kuittausta.
            </li>
            <li>
              <strong className="font-medium">Massakuittaus</strong> vaatii vähintään yhden
              suodattimen. Käytä esimerkiksi «Vain täydennykset» + «Valitse kaikki näkyvät
              kuittaukseen» tyhjien kenttien eräkuittaukseen.
            </li>
            <li>
              Kenttä, jossa jo on arvo, ei merkitä «ei julkista lähdettä» -tarkistukseksi.
              Käytä «Poista virheellinen arvo» hankesivun päivityslomakkeella tai odota
              kentta_tyhjennys-ehdotusta.
            </li>
            <li>Hylkäys jättää julkaisematta. Perustelu jää lokiin.</li>
            {massahyvaksynta ? (
              <li>
                <strong className="font-medium">Hyväksy kaikki odottavat</strong>{" "}
                julkaisee nämä rivit (ristiriitahavainto, kenttämuutos, päätös ja
                määräaika jäävät jonoon). Käytä vain, kun olet käynyt sisällön läpi.
              </li>
            ) : null}
          </OhjeKohta>

          <OhjeKohta otsikko="Rikkinäinen linkki" id="ohje-linkki">
            <li>
              Avaa osoite selaimessa. HTTP 401, 403 ja 429 tarkoittavat
              kiellettyä tai rajoitettua pyyntöä, ei kadonnutta osoitetta.
              Uudet tällaiset havainnot eivät nouse jonoon.
            </li>
            <li>
              Tilapäinen katko: hylkää, jotta tarkistus voi nostaa osoitteen
              uudelleen, tai merkitse käsitellyksi jos osoite avautuu sinulle.
            </li>
            <li>
              Pysyvästi kadonnut lähde: etsi korvaava osoite hankkeen omilta
              sivuilta tai viranomaiskuulutuksesta. Julkaise uusi lähde hankkeen
              päivityslomakkeella. Älä arvaa osoitetta.
            </li>
            <li>
              <strong className="font-medium">Merkitse käsitellyksi</strong> ei
              vaihda linkkiä rekisterissä. Seuraava ajo voi nostaa saman
              osoitteen uudelleen, jos se on yhä rikki.
            </li>
          </OhjeKohta>

          <OhjeKohta otsikko="Dokumentti muuttunut" id="ohje-dokumentti">
            <li>
              Tiiviste on uutettusta tekstistä. Kuvamuotoinen PDF voi näyttää
              tyhjältä tekstiltä ilman että tiedosto olisi kadonnut.
            </li>
            <li>
              Avaa dokumentti. Jos hankesivun luvut tai vaiheet eivät enää täsmää
              asiakirjaan, korjaa kentät päivityslomakkeella lähteineen.
            </li>
            <li>
              Merkitse havainto käsitellyksi, kun olet tarkistanut, tarvitaanko
              kenttäpäivitys. Käsittely ei muuta hankekenttiä.
            </li>
          </OhjeKohta>

          <OhjeKohta otsikko="Ristiriitahavainto" id="ohje-ristiriita">
            <li>
              Avaa rivi ja lue sääntö sekä huomautus
              {massahyvaksynta ? ". Massakäsittely ohittaa nämä rivit" : ""}
              . Kirjaa mitä lähteissä lukee, älä miksi.
            </li>
            <li>
              <strong className="font-medium">Sama Y-tunnus, eri nimet</strong> /
              <strong className="font-medium"> sama nimi, eri Y-tunnukset</strong>
              : avaa YTJ-tietue. Jos rekisterin nimi on vanhentunut, korjaa
              organisaation tiedot erikseen. Jos kyse on kahdesta toimijasta,
              merkitse käsitellyksi ja kerro miksi ei nouse uudelleen.
            </li>
            <li>
              <strong className="font-medium">Generaattoriteho ja ilmoitettu teho</strong>
              : suhde on laskettu samoista julkaistuista kentistä. Tarkista, onko
              polttoaineteho sekoitettu IT-tehoon. Älä muuta lukua ilman lähdettä.
            </li>
            <li>
              <strong className="font-medium">Sijainti Suomen alueen ulkopuolella</strong>
              : tarkista koordinaatit lähteestä. Korjaa päivityslomakkeella, jos
              luku on väärin.
            </li>
            <li>
              <strong className="font-medium">Vanhempi määräaika yhä julkaistu</strong>
              : uudempi saman tyypin määräaika on voimassa. Päivitä tai piilota
              vanhentunut määräaika hankesivun kautta, jos se ei enää kuulu
              julkaisuun.
            </li>
            <li>
              <strong className="font-medium">Lähekkäiset hankkeet</strong>: avaa
              molemmat kortit. Jos kyse on samasta kokonaisuudesta, valitse
              säilytettävä ja yhdistä (puuttuvat kentät siirtyvät, vanha osoite
              ohjaa uuteen, rivejä ei poisteta). Jos kyse on kahdesta hankkeesta,
              merkitse käsitellyksi ja perustele.
            </li>
            <li>
              <strong className="font-medium">Merkitse käsitellyksi</strong>{" "}
              vaatii perustelun (vähintään 12 merkkiä). Sama havainto ei nouse
              uudelleen. Hylkäys poistaa jonosta, mutta havainto voi palata
              seuraavassa ajossa.
            </li>
          </OhjeKohta>

          <OhjeKohta otsikko="Ryhti-, YTJ-, MML- ja kuntahavainto" id="ohje-rajapinta">
            <li>
              Hyväksyntä merkitsee rivin nähdyksi. Se ei päivitä hankkeen
              faktakenttiä, paitsi YTJ-havainto jossa ehdotetaan Y-tunnusta:
              hyväksyntä tallentaa tunnuksen organisaatiolle.
            </li>
            <li>
              Ryhti: puuttuva kaavakohde ei ole todiste siitä, ettei hanketta
              ole. Jos aineistossa on uusi kohde, lisää tiedot täydennyksenä
              lähteineen.
            </li>
            <li>
              YTJ: vertaa rekisterin nimeä ja YTJ:n toiminimeä. Tallenna
              Y-tunnus vain, jos tietue vastaa organisaatiota. Lähde on PRH:n
              tietue, ei rajapinnan juuri.
            </li>
            <li>
              MML: geokoodaus ei siirry sijaintikenttiin. Jos sijainti pitää
              korjata, käytä päivityslomaketta ja merkitse lähde.
            </li>
            <li>
              Hylkäys poistaa jonosta; sama havainto voi nousta uudelleen.
            </li>
          </OhjeKohta>
        </div>
      </div>
    </details>
  );
}
