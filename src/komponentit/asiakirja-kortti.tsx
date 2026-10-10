import {
  asiakirjaHaettuSarake,
  asiakirjaTyyppiSarake,
} from "@/lib/asiakirja-naytto";
import { kenttaNayttonimi } from "@/lib/naytto";
import type { HankeAsiakirja } from "@/lib/supabase/kyselyt";
import { naytaDokumenttiOtsikko } from "@/lib/lahde-metatiedot";

function kentatSarake(asiakirja: HankeAsiakirja): string {
  if (asiakirja.kattaa.length === 0) return "—";
  return asiakirja.kattaa
    .map((kaytto) => {
      const nimi = kenttaNayttonimi(kaytto.taulu, kaytto.kentta);
      const sivut = kaytto.sivut.length > 0 ? ` (s. ${kaytto.sivut.join(", ")})` : "";
      return `${nimi}${sivut}`;
    })
    .join("; ");
}

export function AsiakirjaTaulukko({ asiakirjat }: { asiakirjat: HankeAsiakirja[] }) {
  return (
    <div className="mt-3 overflow-x-auto border-y border-border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">
          Hankkeen asiakirjat: otsikko, tyyppi, viimeisin haku ja rekisterin kentät
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Asiakirja
            </th>
            <th scope="col" className="w-[11rem] py-2 pr-4 font-medium">
              Tyyppi
            </th>
            <th scope="col" className="w-[6.5rem] py-2 pr-4 font-medium whitespace-nowrap">
              Haettu
            </th>
            <th scope="col" className="py-2 font-medium">
              Kentät
            </th>
          </tr>
        </thead>
        <tbody>
          {asiakirjat.map((asiakirja) => {
            const otsikko = naytaDokumenttiOtsikko(asiakirja);
            const otsikkoOnUrl = otsikko === asiakirja.url;
            return (
              <tr key={asiakirja.id} className="border-b border-border align-top last:border-b-0">
                <td className="py-2 pr-4">
                  <a
                    href={asiakirja.url}
                    className="font-medium text-link underline"
                    rel="noopener noreferrer"
                    title={!otsikkoOnUrl ? asiakirja.url : undefined}
                  >
                    {otsikko}
                  </a>
                </td>
                <td className="py-2 pr-4 text-muted">{asiakirjaTyyppiSarake(asiakirja)}</td>
                <td className="py-2 pr-4 text-muted whitespace-nowrap">
                  {asiakirjaHaettuSarake(asiakirja.viimeisin_haku_pvm)}
                </td>
                <td className="py-2 text-muted">{kentatSarake(asiakirja)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
