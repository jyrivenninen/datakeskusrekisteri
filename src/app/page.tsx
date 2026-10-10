import { AjankohtaKohta, AjankohtaLista } from "@/komponentit/ajankohta-lista";
import { HankkeetSuodatin } from "@/komponentit/hankkeet-suodatin";
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
  ETUSIVU_RIVEJA,
  muotoilePvmLyhyt,
  muutosYlarivi,
  yhteensaLause,
} from "@/lib/muutos-naytto";
import {
  haeJulkaistutHankkeet,
  haeJulkaistutMuutokset,
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
    { maaraajat, maara: maaraajaMaara, virhe: maaraajaVirhe },
    { muutokset, maara: muutosMaara, virhe: muutosVirhe },
    taydennys,
  ] = await Promise.all([
    haeYllapitaja(),
    haeJulkaistutHankkeet(),
    haeTulevatMaaraajat({ raja: ETUSIVU_RIVEJA }),
    haeJulkaistutMuutokset({ raja: ETUSIVU_RIVEJA }),
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

      <section className="mt-10" aria-label="Ajankohtaista">
        <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] sm:gap-8">
          <section aria-labelledby="maaraajat-otsikko">
            <h2 id="maaraajat-otsikko" className="text-xl font-semibold">
              Tulevat määräajat
            </h2>
            {maaraajaVirhe ? (
              <p className="mt-3 text-sm">{maaraajaVirhe}</p>
            ) : (
              <AjankohtaLista>
                {maaraajat.length === 0 ? (
                  <li className="flex h-14 items-center text-sm leading-snug">
                    Ei tulevia määräaikoja. Päättyneet näkyvät hankkeen sivulla.
                  </li>
                ) : (
                  maaraajat.map((maaraaika, indeksi) => (
                    <AjankohtaKohta
                      key={maaraaika.id}
                      piilotaKapealla={indeksi >= 3}
                      ylarivi={`${muotoilePvmLyhyt(maaraaika.paattyy_pvm)} · ${MAARAAJA_NIMET[maaraaika.tyyppi]}`}
                      href={`/hankkeet/${maaraaika.hanke.id}`}
                      nimi={maaraaika.hanke.nimi}
                      kunta={maaraaika.hanke.kunta}
                    />
                  ))
                )}
              </AjankohtaLista>
            )}
            {maaraajaMaara > 0 ? (
              <p className="mt-3 text-sm">
                {yhteensaLause(maaraajaMaara, "tuleva määräaika", "tulevaa määräaikaa")}{" "}
                <a href="/maaraajat" className="text-link underline">
                  Katso kaikki.
                </a>
              </p>
            ) : null}
          </section>

          <section aria-labelledby="muutokset-otsikko">
            <h2 id="muutokset-otsikko" className="text-xl font-semibold">
              Viimeksi päivitetty
            </h2>
            {muutosVirhe ? (
              <p className="mt-3 text-sm">{muutosVirhe}</p>
            ) : (
              <AjankohtaLista>
                {muutokset.map((muutos, indeksi) => (
                  <AjankohtaKohta
                    key={muutos.id}
                    piilotaKapealla={indeksi >= 3}
                    ylarivi={`${muotoilePvmLyhyt(muutos.hyvaksytty_pvm)} · ${muutosYlarivi(muutos.kentta, muutos.uusi_arvo)}`}
                    href={`/hankkeet/${muutos.hanke.id}`}
                    nimi={muutos.hanke.nimi}
                    kunta={muutos.hanke.kunta}
                  />
                ))}
              </AjankohtaLista>
            )}
            {muutosMaara > 0 ? (
              <p className="mt-3 text-sm">
                {yhteensaLause(muutosMaara, "muutos", "muutosta")}{" "}
                <a href="/muutokset" className="text-link underline">
                  Katso kaikki.
                </a>
              </p>
            ) : null}
          </section>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="hankkeet-otsikko">
        <h2 id="hankkeet-otsikko" className="text-xl font-semibold">
          Hankkeet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Suodatin päivittää laskurit, kartan ja luettelon valinnoista.
          Kokoluokka osuu hankkeeseen, jos hanketason teho tai jokin merkitty
          YVA-vaihtoehto osuu luokkaan.
        </p>
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
        <div className="mt-4 h-[calc(100dvh-17rem)] min-h-[22rem] max-sm:h-[min(72dvh,34rem)]">
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
            <ul className="mt-4 divide-y divide-border border-y border-border">
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
      </section>
    </main>
  );
}
