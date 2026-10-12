import { naytaLahdeLinkkiTeksti } from "@/lib/lahde-metatiedot";
import type { KenttaLahde } from "@/lib/supabase/tietokanta";
import { HANKE_KENTTA_NIMET, LUOTTAMUS_NIMET, MERKINTA_NIMET, muotoilePvm } from "@/lib/naytto";

export type KorvaavaDokumentti = { otsikko: string; url: string };

export function Lahdeluettelo({
  lahteet,
  linkkiTekstit,
  korvaavat,
  naytaKentta = false,
}: {
  lahteet: KenttaLahde[];
  linkkiTekstit?: ReadonlyMap<string, string>;
  korvaavat?: ReadonlyMap<string, KorvaavaDokumentti>;
  naytaKentta?: boolean;
}) {
  if (lahteet.length === 0) {
    return <p className="mt-3 text-sm text-muted">Lähdettä ei ole merkitty.</p>;
  }

  const jarjestys = [...lahteet].sort((a, b) => {
    const aPassiivinen = a.tila === "korvattu" || a.tila === "ei_tue" ? 1 : 0;
    const bPassiivinen = b.tila === "korvattu" || b.tila === "ei_tue" ? 1 : 0;
    return aPassiivinen - bPassiivinen;
  });

  return (
    <ul className="mt-3 space-y-2 text-sm">
      {jarjestys.map((lahde) => {
        const teksti = naytaLahdeLinkkiTeksti(lahde.lahde_url, linkkiTekstit);
        const korvattu = lahde.tila === "korvattu";
        const eiTue = lahde.tila === "ei_tue";
        const passiivinen = korvattu || eiTue;
        const korvaava = lahde.korvaava_dokumentti_id
          ? korvaavat?.get(lahde.korvaava_dokumentti_id)
          : undefined;
        return (
        <li
          key={lahde.id}
          className={
            passiivinen
              ? "rounded border border-dashed border-muted bg-background px-3 py-2"
              : "rounded border border-border bg-background px-3 py-2"
          }
        >
          {korvattu ? <p className="font-medium">Korvattu</p> : null}
          {eiTue ? <p className="font-medium">Ei tue arvoa</p> : null}
          {naytaKentta ? (
            <p className="text-muted">{HANKE_KENTTA_NIMET[lahde.kentta] ?? lahde.kentta}</p>
          ) : null}
          <p>
            <a
              href={lahde.lahde_url}
              className="text-link underline"
              rel="noopener noreferrer"
              title={teksti !== lahde.lahde_url ? lahde.lahde_url : undefined}
            >
              {teksti}
            </a>
            {lahde.lahde_sivu != null ? ` (s. ${lahde.lahde_sivu})` : ""}
          </p>
          {passiivinen ? (
            <p className="mt-1 text-muted">tarkistettu {muotoilePvm(lahde.vahvistettu_pvm)}</p>
          ) : (
            <p className="mt-1 text-muted">
              {LUOTTAMUS_NIMET[lahde.luottamus]} · {MERKINTA_NIMET[lahde.merkitty]} ·
              tarkistettu {muotoilePvm(lahde.vahvistettu_pvm)}
            </p>
          )}
          {korvattu && korvaava ? (
            <p className="mt-1">
              Korvaava asiakirja:{" "}
              <a href={korvaava.url} className="text-link underline" rel="noopener noreferrer">
                {korvaava.otsikko}
              </a>
            </p>
          ) : null}
          {lahde.lainaus ? (
            <blockquote className="mt-1 border-l-2 border-border pl-3 text-foreground">
              {lahde.lainaus}
            </blockquote>
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}
