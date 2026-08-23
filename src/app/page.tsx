import { Kartta, type Karttamerkki } from "@/komponentit/kartta";
import { Suodatuslomake, parsiSuodatus } from "@/komponentit/suodatuslomake";
import { MAARAAJA_NIMET, VAIHE_NIMET, hankeTehoMw, muotoileLuku, muotoilePvm } from "@/lib/naytto";
import {
  haeJulkaistutHankkeet,
  haeTulevatMaaraajat,
} from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export default async function Etusivu({
  searchParams,
}: {
  searchParams: Promise<{ kunta?: string; vaihe?: string; koko?: string }>;
}) {
  const params = await searchParams;
  const suodatus = parsiSuodatus(params);
  const [{ hankkeet, johdot, virhe: hankeVirhe }, { maaraajat, virhe: maaraajaVirhe }] =
    await Promise.all([haeJulkaistutHankkeet(suodatus), haeTulevatMaaraajat()]);

  const { hankkeet: kaikkiHankkeet } = await haeJulkaistutHankkeet();
  const kunnat = [...new Set(kaikkiHankkeet.map((hanke) => hanke.kunta))].sort((a, b) =>
    a.localeCompare(b, "fi"),
  );

  const merkit: Karttamerkki[] = hankkeet.flatMap((hanke) => {
    const alue = hanke.sijainti_alue?.type === "Polygon" ? hanke.sijainti_alue : null;
    const hankeJohdot = johdot
      .filter((johto) => johto.hanke_id === hanke.id && johto.reitti)
      .map((johto) => ({ id: johto.id, reitti: johto.reitti! }));
    if (hanke.sijainti_lat == null && hanke.sijainti_lon == null && !alue && hankeJohdot.length === 0) {
      return [];
    }
    return [
      {
        id: hanke.id,
        nimi: hanke.nimi,
        vaihe: hanke.vaihe,
        lat: hanke.sijainti_lat != null ? Number(hanke.sijainti_lat) : undefined,
        lon: hanke.sijainti_lon != null ? Number(hanke.sijainti_lon) : undefined,
        alue,
        johdot: hankeJohdot,
      },
    ];
  });

  return (
    <main id="sisalto" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        Datakeskushankkeiden kansallinen rekisteri
      </h1>
      <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
        Avoin hanketietokanta ja prosessiopas. Julkaistu tieto merkitään
        lähteineen.         Rekisteri ei ota kantaa yksittäisiin hankkeisiin.
      </p>
      <p className="mt-3">
        <a href="/opas/yva-mielipide" className="text-link underline">
          Näin teet YVA-mielipiteen
        </a>
        {" · "}
        <a href="/hakemisto" className="text-link underline">
          Organisaatio- ja yhteystietohakemisto
        </a>
      </p>

      <section className="mt-10" aria-labelledby="maaraajat-otsikko">
        <h2 id="maaraajat-otsikko" className="text-xl font-semibold">
          Tulevat määräajat
        </h2>
        {maaraajaVirhe ? (
          <p className="mt-3 text-sm">{maaraajaVirhe}</p>
        ) : maaraajat.length === 0 ? (
          <p className="mt-3 max-w-prose leading-relaxed">
            Ei tulevia määräaikoja. Päättyneet määräajat näkyvät hankkeen
            sivulla.
          </p>
        ) : (
          <table className="mt-4 w-full border-collapse text-left text-sm">
            <caption className="sr-only">Tulevat vaikuttamisen määräajat</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Päättyy
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Tyyppi
                </th>
                <th scope="col" className="py-2 font-medium">
                  Hanke
                </th>
              </tr>
            </thead>
            <tbody>
              {maaraajat.map((maaraaika) => (
                <tr key={maaraaika.id} className="border-b border-border">
                  <td className="py-2 pr-3">{muotoilePvm(maaraaika.paattyy_pvm)}</td>
                  <td className="py-2 pr-3">{MAARAAJA_NIMET[maaraaika.tyyppi]}</td>
                  <td className="py-2">
                    <a href={`/hankkeet/${maaraaika.hanke.id}`} className="text-link underline">
                      {maaraaika.hanke.nimi}
                    </a>
                    <span className="text-muted"> ({maaraaika.hanke.kunta})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10" aria-labelledby="kartta-otsikko">
        <h2 id="kartta-otsikko" className="text-xl font-semibold">
          Kartta
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Nuppineulan väri kertoo hankkeen vaiheen. Lähizoomissa näkyy myös
          hankealue ja sähkönsiirtoreitti, jos ne on merkitty.
        </p>
        <div className="mt-4">
          <Kartta merkit={merkit} />
        </div>
        <noscript>
          <p className="mt-3 text-sm">
            Kartta vaatii JavaScriptin. Hankkeet ovat luettavissa alla olevasta
            listasta.
          </p>
        </noscript>
      </section>

      <section className="mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        <Suodatuslomake suodatus={suodatus} kunnat={kunnat} />
        {hankeVirhe ? (
          <p className="mt-4 text-sm">{hankeVirhe}</p>
        ) : hankkeet.length === 0 ? (
          <p className="mt-4 leading-relaxed">Ei hankkeita valituilla suodattimilla.</p>
        ) : (
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {hankkeet.map((hanke) => {
              const teho = hankeTehoMw(hanke);
              return (
                <li key={hanke.id} className="py-4">
                  <h3 className="text-lg font-semibold">
                    <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                      {hanke.nimi}
                    </a>
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {hanke.kunta}
                    {hanke.maakunta ? `, ${hanke.maakunta}` : ""} · {VAIHE_NIMET[hanke.vaihe]}
                    {teho != null ? ` · ${muotoileLuku(teho)} MW` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
