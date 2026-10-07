import type { SivukatseluYhteenveto } from "@/lib/supabase/sivukatselu-kysely";
import { muotoilePvm } from "@/lib/naytto";

type Props = {
  yhteenveto: SivukatseluYhteenveto;
};

export function SivukatseluYhteenveto({ yhteenveto }: Props) {
  if (yhteenveto.tauluPuuttuu) {
    return (
      <p className="mt-2 text-sm text-muted">
        Sivulatausten loki ei ole vielä käytössä tuotantotietokannassa. Aja migraatio{" "}
        <code className="text-xs">20261007180500_sivukatselut.sql</code> Supabase-projektiin.
      </p>
    );
  }

  if (yhteenveto.yhteensa30pv === 0 && yhteenveto.paivittain.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted">
        Ei kirjattuja sivulatauksia viimeisen 30 päivän aikana. Laskuri alkaa kerätä tietoa
        julkisista sivuista automaattisesti.
      </p>
    );
  }

  const viimeisinPaiva = yhteenveto.paivittain.at(-1);
  const maxPaivaLkm = Math.max(
    1,
    ...yhteenveto.paivittain.map((rivi) => Number(rivi.lkm)),
  );

  return (
    <div className="mt-3 space-y-6">
      <p className="text-sm text-muted">
        Yhteensä {yhteenveto.yhteensa30pv.toLocaleString("fi-FI")} kirjattua sivulatausta
        viimeisen 30 päivän aikana
        {viimeisinPaiva
          ? ` · viimeisin päivä (${muotoilePvm(viimeisinPaiva.paiva)}): ${Number(viimeisinPaiva.lkm).toLocaleString("fi-FI")}`
          : null}
        . Ei IP-osoitteita eikä henkilötietoja.
      </p>

      {yhteenveto.paivittain.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">Päivittäin (30 pv)</h3>
          <ul className="mt-2 flex flex-wrap items-end gap-1" aria-label="Päivittäiset sivulataukset">
            {yhteenveto.paivittain.map((rivi) => {
              const lkm = Number(rivi.lkm);
              const korkeus = Math.max(4, Math.round((lkm / maxPaivaLkm) * 48));
              return (
                <li key={rivi.paiva} className="flex flex-col items-center gap-1">
                  <span
                    className="w-3 rounded-sm bg-foreground/25"
                    style={{ height: `${korkeus}px` }}
                    title={`${muotoilePvm(rivi.paiva)}: ${lkm}`}
                  />
                  <span className="sr-only">
                    {muotoilePvm(rivi.paiva)} {lkm}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {yhteenveto.suosituimmat.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium">Useimmin avatut polut</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1 pr-2 font-normal">Polku</th>
                <th className="py-1 font-normal">Lkm</th>
              </tr>
            </thead>
            <tbody>
              {yhteenveto.suosituimmat.map((rivi) => (
                <tr key={rivi.polku} className="border-b border-border/60">
                  <td className="py-1.5 pr-2 font-mono text-xs">{rivi.polku}</td>
                  <td className="py-1.5 tabular-nums">{Number(rivi.lkm).toLocaleString("fi-FI")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
