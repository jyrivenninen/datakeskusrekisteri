import type { Metadata } from "next";
import { RyhtiKattavuus } from "@/komponentit/ryhti-kattavuus";
import {
  LAHDEAJO_SOVITIN_NIMET,
  LAHDEAJO_TILA_NIMET,
  muotoileAika,
} from "@/lib/naytto";
import { haeJulkisetLahdeajot } from "@/lib/supabase/kyselyt";
import { ESIVERSIO_TEKSTI, OSALLISTUMINEN_TEKSTI } from "@/lib/esiversio";
import { Yhteistyokumppanit } from "@/komponentit/yhteistyokumppanit";

export const metadata: Metadata = {
  title: "Tietoa palvelusta – Datakeskushankkeiden kansallinen rekisteri",
  description:
    "Mikä rekisteri on, kuka sen tuottaa, mistä tiedot tulevat ja milloin lähteitä on viimeksi haettu.",
};

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
            Palvelun tuottaa Kansallisdata ry. Ilmoitus lomakkeella tai agentin
            ehdottama havainto ei siirry rekisteriin ennen kuin ylläpitäjä on
            tarkistanut lähteen.
          </p>
        </div>
      </section>

      <div className="mt-10">
        <Yhteistyokumppanit />
      </div>

      <section className="mt-10" aria-labelledby="aineistot-otsikko">
        <h2 id="aineistot-otsikko" className="text-xl font-semibold">
          Aineistot ja rajapinnat
        </h2>
        <p className="mt-3 leading-relaxed">
          Rakenteinen viranomaistieto haetaan rajapinnoista, ei kielimallilla.
          Mallia käytetään vain luonnollisen kielen dokumenttien lukemiseen.
          Ristiriidat, linkit ja dokumenttien muuttuminen tarkistetaan koodilla.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>Ryhti (SYKE): kaavakohteet, kun aineisto on toimitettu.</li>
          <li>PRH YTJ, avoin data, CC BY 4.0: organisaatioiden Y-tunnukset.</li>
          <li>Maanmittauslaitos, CC BY 4.0: geokoodaus ja taustakartta.</li>
          <li>Kuntien julkiset esityslistat ja kuulutukset, kun osoite on tiedossa.</li>
        </ul>
        <RyhtiKattavuus luokka="mt-4" />
      </section>

      <section className="mt-10" aria-labelledby="ajot-otsikko">
        <h2 id="ajot-otsikko" className="text-xl font-semibold">
          Lähdeajot
        </h2>
        <p className="mt-3 leading-relaxed text-muted">
          Ajo hakee tai tarkistaa lähteen. Se kirjoittaa ehdotuksen jonoon,
          ei julkaistuun hanketietoon. Osumien määrä on haun tulos, ei
          hyväksyttyjen tietojen määrä.
        </p>
        {virhe ? (
          <p className="mt-3">{virhe}</p>
        ) : ajot.length === 0 ? (
          <p className="mt-3">Ei kirjattuja ajoja.</p>
        ) : (
          <>
            <h3 className="mt-6 text-lg font-semibold">Viimeisin ajo sovittimittain</h3>
            <table className="mt-3 w-full border-collapse text-left text-sm">
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

            <h3 className="mt-8 text-lg font-semibold">Kaikki kirjatut ajot</h3>
            {katkaistu ? (
              <p className="mt-2 text-sm text-muted">
                Näytetään 500 uusinta riviä.
              </p>
            ) : null}
            <ul className="mt-3 divide-y divide-border border-y border-border">
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
          </>
        )}
      </section>
    </main>
  );
}
