import type { Metadata } from "next";
import { VAIHE_NIMET } from "@/lib/naytto";

export const metadata: Metadata = {
  title: "Näin teet YVA-mielipiteen – Datakeskushankkeiden kansallinen rekisteri",
  description:
    "Ympäristövaikutusten arviointimenettelyn vaiheet, kuulutusajat ja mallipohja kirjalliseen mielipiteeseen.",
};

const YM_YVA_OSALLISTU =
  "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/hankkeiden-ymparistovaikutusten-arviointimenettely-yva";
const FINLEX_YVA = "https://finlex.fi/fi/lainsaadanto/2017/252";

export default function YvaOpasSivu() {
  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/" className="text-link underline">
          Etusivu
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">
        Näin teet YVA-mielipiteen
      </h1>
      <p className="mt-4 max-w-prose leading-relaxed text-muted">
        Tämä sivu kuvaa ympäristövaikutusten arviointimenettelyn (YVA) julkiset
        vaiheet ja sen, milloin mielipiteen voi jättää. Teksti ei ole
        oikeudellista neuvontaa. Määräajat ja toimitusosoite ovat kunkin hankkeen
        kuulutuksessa.
      </p>
      <p className="mt-3 max-w-prose text-sm leading-relaxed">
        Lähteet:{" "}
        <a href={YM_YVA_OSALLISTU} className="text-link underline" rel="noopener noreferrer">
          ymparisto.fi, hankkeiden YVA-menettely
        </a>
        {" · "}
        <a href={FINLEX_YVA} className="text-link underline" rel="noopener noreferrer">
          laki ympäristövaikutusten arviointimenettelystä 252/2017
        </a>
        . Ympäristöministeriö on päivittänyt ymparisto.fi-sivun 11.6.2026.
      </p>

      <section className="mt-10" aria-labelledby="aikajana-otsikko">
        <h2 id="aikajana-otsikko" className="text-xl font-semibold">
          Aikajana
        </h2>
        <ol className="mt-4 list-decimal space-y-4 pl-6 leading-relaxed">
          <li>
            <strong>Arviointiohjelma.</strong> Hankkeesta vastaava toimittaa
            yhteysviranomaiselle suunnitelman siitä, miten vaikutukset
            selvitetään. Yhteysviranomainen kuuluttaa ohjelman. Mielipiteille on
            aikaa vähintään 30 päivää.
          </li>
          <li>
            <strong>Yhteysviranomaisen lausunto ohjelmasta.</strong> Lausunto
            annetaan kuukauden kuluessa kuulemisen päättymisestä. Siitä ei voi
            valittaa. YVA ei ole lupamenettely.
          </li>
          <li>
            <strong>Arviointiselostus.</strong> Selvitykset kootaan selostukseksi.
            Yhteysviranomainen kuuluttaa sen. Kommentointiaika on 30–60 päivää.
          </li>
          <li>
            <strong>Perusteltu päätelmä.</strong> Yhteysviranomainen antaa sen
            kahden kuukauden kuluessa kuulemisen päättymisestä. Siitä ei voi
            valittaa. Hankkeesta vastaava liittää selostuksen ja päätelmän
            lupahakemuksiin.
          </li>
          <li>
            <strong>Luvat ja kaavoitus.</strong> Lupaviranomainen ottaa
            selostuksen ja perustellun päätelmän huomioon. Osallistuminen
            jatkuu kaava- ja lupamenettelyissä, joista voi olla
            muutoksenhakuoikeus.
          </li>
        </ol>
        <p className="mt-4 max-w-prose leading-relaxed">
          Yhteysviranomainen on 1.1.2026 alkaen Lupa- ja valvontavirasto.
          Sitä ennen tehtävää hoiti ELY-keskus. Ydinenergiahankkeissa
          yhteysviranomainen on työ- ja elinkeinoministeriö.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="vaiheet-otsikko">
        <h2 id="vaiheet-otsikko" className="text-xl font-semibold">
          Mitä tässä rekisterin vaiheessa voi vielä tehdä
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed">
          Rekisterin vaihe on tiivistelmä. Tarkista hankesivun määräajat ja
          kuulutus.
        </p>
        <dl className="mt-4 divide-y divide-border border-y border-border">
          <div className="py-4">
            <dt className="font-medium">{VAIHE_NIMET.esiselvitys}</dt>
            <dd className="mt-1 leading-relaxed">
              YVA-kuulutusta ei välttämättä vielä ole. Seuraa yhteysviranomaisen
              kuulutuksia. Ennakkoneuvottelu on hankkeesta vastaavan ja
              viranomaisten välinen.
            </dd>
          </div>
          <div className="py-4">
            <dt className="font-medium">{VAIHE_NIMET.yva_vireilla}</dt>
            <dd className="mt-1 leading-relaxed">
              Kirjallinen mielipide ohjelmasta tai selostuksesta kuulutuksessa
              ilmoitettuun määräaikaan mennessä. Yleisötilaisuus on tavallinen,
              ei pakollinen osallistumistapa.
            </dd>
          </div>
          <div className="py-4">
            <dt className="font-medium">{VAIHE_NIMET.yva_paattynyt}</dt>
            <dd className="mt-1 leading-relaxed">
              YVA-ohjelmalausunnosta ja perustellusta päätelmästä ei valiteta.
              Osallistuminen siirtyy kaavoitukseen ja lupiin, joissa YVA
              otetaan huomioon.
            </dd>
          </div>
          <div className="py-4">
            <dt className="font-medium">{VAIHE_NIMET.kaavoitus}</dt>
            <dd className="mt-1 leading-relaxed">
              Osallistumis- ja arviointisuunnitelma, kaavan valmisteluaineisto
              ja kaavaehdotus: mielipide tai muistutus kunnan kuuluttamina
              aikoina. YVA ja kaavoitus voidaan yhdistää.
            </dd>
          </div>
          <div className="py-4">
            <dt className="font-medium">{VAIHE_NIMET.lupamenettely}</dt>
            <dd className="mt-1 leading-relaxed">
              Osallistu lupahakemuksen kuulutukseen. Luvasta voi olla
              valitusoikeus. Valitusajat merkitään rekisteriin, jos ne on
              lähteistetty.
            </dd>
          </div>
          <div className="py-4">
            <dt className="font-medium">
              {VAIHE_NIMET.rakenteilla}, {VAIHE_NIMET.toiminnassa},{" "}
              {VAIHE_NIMET.peruttu}
            </dt>
            <dd className="mt-1 leading-relaxed">
              YVA-kuuleminen on ohi, ellei uutta menettelyä kuuluteta.
              Voimassa olevat valitusajat näkyvät hankkeen määräajoissa.
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="laatiminen-otsikko">
        <h2 id="laatiminen-otsikko" className="text-xl font-semibold">
          Mielipiteen laatiminen
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed">
          Ymparisto.fi: toimita vapaamuotoinen kirjallinen mielipide
          yhteysviranomaiselle määräaikaan mennessä. Kirjoita jäsennellysti ja
          perustele. Henkilötiedot poistetaan julkaistavista lausunnoista ja
          mielipiteistä tietosuojalain mukaisesti.
        </p>
        <h3 className="mt-6 text-lg font-semibold">Ohjelmavaiheessa</h3>
        <ul className="mt-2 list-disc space-y-2 pl-6 leading-relaxed">
          <li>Onko hanke ja vaihtoehdot rajattu ymmärrettävästi?</li>
          <li>Ovatko tärkeinä pitämäsi vaikutukset mukana arvioinnissa?</li>
          <li>Onko osallistumisen järjestäminen kuvattu riittävästi?</li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold">Selostusvaiheessa</h3>
        <ul className="mt-2 list-disc space-y-2 pl-6 leading-relaxed">
          <li>Onko arviointi tehty ohjelman ja lausunnon mukaisesti?</li>
          <li>Onko vaihtoehdot ja merkittävät vaikutukset selvitetty?</li>
          <li>Onko vertailu esitetty johdonmukaisesti?</li>
          <li>Onko selostus ymmärrettävä?</li>
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="malli-otsikko">
        <h2 id="malli-otsikko" className="text-xl font-semibold">
          Mallipohja
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed">
          Kopioi teksti, täydennä kuulutuksen tiedot ja poista kohdat, jotka
          eivät koske sinua. Älä lähetä mallia sellaisenaan.
        </p>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded border border-border bg-surface p-4 text-sm leading-relaxed">
          {`Vastaanottaja: [yhteysviranomainen, kuulutuksen osoite]
Diaarinumero: [kuulutuksesta]
Asiakirja: YVA-ohjelma / YVA-selostus
Hanke: [nimi]
Määräaika: [päivämäärä]

Mielipiteen antaja
Nimi:
Yhteystiedot (sähköposti tai postiosoite):
Asema (asukas, järjestö, muu):

Mielipide koskee
[Lyhyt kuvaus, mihin asiakirjan osaan tai vaihtoehtoon mielipide liittyy.]

Havainto
[Kirjaa havainto. Viittaa asiakirjan sivuun, karttaan tai kuulutukseen.]

Kysymys tai tarkennustoive arviointiin
[Mitä selvitystä tai rajausta toivot tarkennettavan. Älä väitä motiiveista.]

Lähteet
[URL, päivämäärä, tarvittaessa sivunumero.]

Paikka ja päiväys
Allekirjoitus`}
        </pre>
      </section>

      <p className="mt-10">
        <a href="/" className="text-link underline">
          Rekisterin hankkeet ja määräajat
        </a>
        {" · "}
        <a href="/hakemisto" className="text-link underline">
          Yhteystiedot
        </a>
      </p>
    </main>
  );
}
