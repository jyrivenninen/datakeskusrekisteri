import { Kartta } from "@/komponentit/kartta";
import { aktiivisetEhdot, hankkeetSuodatusPolku, onAktiivinenSuodatus } from "@/lib/haku";
import { haeKarttaSivuData } from "@/lib/kartta-sivu";
import { parsiSuodatus } from "@/lib/supabase/kyselyt";

export const revalidate = 60;

export default async function KarttaSivu({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kunta?: string;
    vaihe?: string;
    koko?: string;
    kuvalliset?: string;
  }>;
}) {
  const params = await searchParams;
  const suodatus = parsiSuodatus(params);
  const { merkit, tuotantoVertailu, vaiheLkm, hankeVirhe } = await haeKarttaSivuData(suodatus);

  return (
    <main id="sisalto" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-sm">
        <a href={hankkeetSuodatusPolku(suodatus)} className="text-link underline">
          ← Takaisin hankkeisiin
        </a>
        {onAktiivinenSuodatus(suodatus) ? (
          <ul className="flex flex-wrap gap-2 text-xs text-muted">
            {aktiivisetEhdot(suodatus).map((ehto) => (
              <li key={ehto.avain} className="rounded-full border border-border px-2 py-0.5">
                {ehto.nimi}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {hankeVirhe ? (
        <p className="px-4 py-3 text-sm">{hankeVirhe}</p>
      ) : (
        <div className="flex min-h-[calc(100dvh-7rem)] flex-1 flex-col p-4 pt-3">
          <Kartta
            merkit={merkit}
            sovitaSuomeen
            asettelu="koko"
            kartallaLkm={merkit.length}
            tuotantoVertailu={tuotantoVertailu}
            vaiheLkm={vaiheLkm}
          />
        </div>
      )}
    </main>
  );
}
