import { HankkeetSuodatin } from "@/komponentit/hankkeet-suodatin";
import { SisaltoKaare } from "@/komponentit/sisalto-kaare";
import { HankeLuetteloOsio } from "@/komponentit/hanke-luettelo-jarjestys";
import { HankeLaskurit } from "@/komponentit/hanke-laskurit";
import { KarttaViive } from "@/komponentit/kartta-viive";
import { VaiheMerkki } from "@/komponentit/vaihe-merkki";
import { laskeHankeYhteenveto } from "@/lib/hanke-yhteenveto";
import { hankeVaihtelvalit } from "@/lib/hanke-vaihtelvali";
import { jarjestaHankkeet, parsiHankeJarjestys } from "@/lib/hanke-jarjestys";
import {
  aktiivisetEhdot,
  hankkeetSuodatusPolku,
  karttaSuodatusPolku,
  onAktiivinenSuodatus,
} from "@/lib/haku";
import { haeKarttaTaydennys, kokoaKarttaSivuData } from "@/lib/kartta-sivu";
import { ENERGIA_MAAKUNTA_TUOTANTO } from "@/lib/energiateollisuus-tuotanto";
import { MAARAAJA_NIMET, muotoilePvm, muotoileVaihtelvali } from "@/lib/naytto";
import {
  haeJulkaistutHankkeet,
  haeTulevatMaaraajat,
  parsiSuodatus,
  rajaaHankelista,
} from "@/lib/supabase/kyselyt";
import { haeYllapitaja } from "@/lib/supabase/palvelin";

export const revalidate = 60;

export default async function Etusivu({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kunta?: string;
    vaihe?: string;
    koko?: string;
    kuvalliset?: string;
    jarjestys?: string;
  }>;
}) {
  const params = await searchParams;
  const suodatus = parsiSuodatus(params);
  const jarjestys = parsiHankeJarjestys(suodatus.jarjestys);
  const [
    { user: yllapitaja },
    lista,
    { maaraajat, virhe: maaraajaVirhe },
    taydennys,
  ] = await Promise.all([
    haeYllapitaja(),
    haeJulkaistutHankkeet(),
    haeTulevatMaaraajat(),
    haeKarttaTaydennys(),
  ]);
  const { hankkeet, johdot, virhe: hankeVirhe } = await rajaaHankelista(lista, suodatus);
  const { merkit, tuotantoVertailu, liityntapisteet, vaiheLkm } = kokoaKarttaSivuData(
    { hankkeet, johdot, virhe: hankeVirhe },
    taydennys,
  );
  const jarjestetytHankkeet = jarjestaHankkeet(hankkeet, jarjestys);

  const { hankkeet: kaikkiHankkeet } = lista;
  const kunnat = [...new Set(kaikkiHankkeet.map((hanke) => hanke.kunta))].sort((a, b) =>
    a.localeCompare(b, "fi"),
  );

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <SisaltoKaare>
      <h1 className="text-3xl font-semibold tracking-tight">
        Datakeskushankkeiden kansallinen rekisteri
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        Avoin hanketietokanta ja prosessiopas. Julkaistu tieto merkitään
        lähteineen. Rekisteri ei ota kantaa yksittäisiin hankkeisiin.
      </p>
      <p className="mt-3">
        <a href="/tietoa" className="text-link underline">
          Tietoa palvelusta
        </a>
        {" · "}
        <a href="/opas/yva-mielipide" className="text-link underline">
          Näin teet YVA-mielipiteen
        </a>
        {yllapitaja ? (
          <>
            {" · "}
            <a href="/hakemisto" className="text-link underline">
              Organisaatio- ja yhteystietohakemisto
            </a>
          </>
        ) : null}
      </p>

      <section className="mt-10" aria-labelledby="maaraajat-otsikko">
        <h2 id="maaraajat-otsikko" className="text-xl font-semibold">
          Tulevat määräajat
        </h2>
        {maaraajaVirhe ? (
          <p className="mt-3 text-sm">{maaraajaVirhe}</p>
        ) : maaraajat.length === 0 ? (
          <p className="mt-3 leading-relaxed">
            Ei tulevia määräaikoja. Päättyneet määräajat näkyvät hankkeen
            sivulla.
          </p>
        ) : (
          <div className="sisalto-levea">
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
          </div>
        )}
      </section>

      <section className="sisalto-levea mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Suodatin päivittää laskurit, kartan ja luettelon valinnoista.
          Kokoluokka osuu hankkeeseen, jos hanketason teho tai jokin merkitty
          YVA-vaihtoehto osuu luokkaan.
        </p>
        <div className="sisalto-levea">
        <HankkeetSuodatin
          key={hankkeetSuodatusPolku(suodatus)}
          suodatus={suodatus}
          kunnat={kunnat}
        />
        {hankeVirhe ? (
          <p className="mt-4 text-sm">{hankeVirhe}</p>
        ) : (
          <HankeLaskurit yhteenveto={laskeHankeYhteenveto(hankkeet)} />
        )}

        <h3 id="kartta-otsikko" className="mt-10 text-lg font-semibold">
          Kartta
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Loitolla näkyy piste, lähellä nuppineula (vaiheen väri). Keltainen halo
          kuvaa IT-tehoa (tai kokonaistehoa). Maakuntaväri näyttää oletuksena
          hankkeiden lukumäärän; valittavissa myös IT-teho, hankkeiden sähkönkäyttö
          tai maakunnan sähköntuotanto (Energiateollisuus {ENERGIA_MAAKUNTA_TUOTANTO.vuosi}).
          Lähizoomissa näkyy hankealue ja sähkönsiirtoreitti, jos merkitty.
        </p>
        <div className="sisalto-levea sisalto-levea-taysi mt-4 h-[calc(100dvh-17rem)] min-h-[22rem] max-sm:h-[min(72dvh,34rem)]">
          <KarttaViive
            merkit={merkit}
            sovitaSuomeen
            sovitaIkkunaan
            kartallaLkm={merkit.length}
            tuotantoVertailu={tuotantoVertailu}
            liityntapisteet={liityntapisteet}
            vaiheLkm={vaiheLkm}
            taydennNayttoHref={karttaSuodatusPolku(suodatus)}
          />
        </div>
        <noscript>
          <p className="mt-3 text-sm">
            Kartta vaatii JavaScriptin. Hankkeet ovat luettavissa alla olevasta
            luettelosta.
          </p>
        </noscript>

        <HankeLuetteloOsio suodatus={suodatus}>
          {hankeVirhe ? (
            <p className="mt-4 text-sm">{hankeVirhe}</p>
          ) : jarjestetytHankkeet.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-surface p-4">
              <p className="leading-relaxed">Ei hankkeita valituilla ehdoilla.</p>
              {onAktiivinenSuodatus(suodatus) ? (
                <>
                  <ul className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
                    {aktiivisetEhdot(suodatus).map((ehto) => (
                      <li key={ehto.avain} className="rounded-full border border-border px-2 py-0.5">
                        {ehto.nimi}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4">
                    <a href={hankkeetSuodatusPolku({})} className="text-link underline">
                      Tyhjennä haku ja suodattimet
                    </a>
                  </p>
                </>
              ) : null}
            </div>
          ) : (
            <ul className="sisalto-levea mt-4 divide-y divide-border border-y border-border">
              {jarjestetytHankkeet.map((hanke) => {
                const teho = hankeVaihtelvalit(hanke, hanke.vaihtoehdot).teho;
                return (
                  <li key={hanke.id} className="py-4">
                    <h4 className="text-lg font-semibold">
                      <a href={`/hankkeet/${hanke.id}`} className="text-link underline">
                        {hanke.nimi}
                      </a>
                    </h4>
                    <p className="mt-1 text-sm text-muted">
                      {hanke.kunta}
                      {hanke.maakunta ? `, ${hanke.maakunta}` : ""} ·{" "}
                      <VaiheMerkki vaihe={hanke.vaihe} />
                      {teho
                        ? ` · ${muotoileVaihtelvali(teho.min, teho.max, "MW")}`
                        : ""}
                      {hanke.vanhin_vahvistettu_pvm
                        ? ` · vanhin tarkistettu ${muotoilePvm(hanke.vanhin_vahvistettu_pvm)}`
                        : ""}
                      {hanke.viimeisin_paatos
                        ? ` · ${hanke.viimeisin_paatos.kuvaus} · ${muotoilePvm(hanke.viimeisin_paatos.pvm)}`
                        : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </HankeLuetteloOsio>
        </div>
      </section>
      </SisaltoKaare>
    </main>
  );
}
