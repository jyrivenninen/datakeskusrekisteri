import type { Metadata } from "next";
import { HankkeetSuodatin } from "@/komponentit/hankkeet-suodatin";
import { Sivutus } from "@/komponentit/sivutus";
import { MAARAAJA_NIMET, muotoilePvm } from "@/lib/naytto";
import { maaraajatPolku, parsiSivu, sivujaYhteensa, MUUTOS_SIVU_KOKO } from "@/lib/muutos-naytto";
import { parsiSuodatus } from "@/lib/suodatus";
import { haeJulkaistutHankkeet, haeTulevatMaaraajat } from "@/lib/supabase/kyselyt";

export const metadata: Metadata = {
  title: "Tulevat määräajat – Datakeskushankkeiden kansallinen rekisteri",
  description: "Julkaistujen datakeskushankkeiden tulevat vaikuttamisen määräajat.",
};

export default async function MaaraajatSivu({
  searchParams,
}: {
  searchParams: Promise<{ kunta?: string; vaihe?: string; sivu?: string }>;
}) {
  const params = await searchParams;
  const suodatus = parsiSuodatus(params);
  const sivu = parsiSivu(params.sivu);
  const [{ hankkeet }, tulos] = await Promise.all([
    haeJulkaistutHankkeet(),
    haeTulevatMaaraajat({
      kunta: suodatus.kunta,
      vaihe: suodatus.vaihe,
      alku: (sivu - 1) * MUUTOS_SIVU_KOKO,
      raja: MUUTOS_SIVU_KOKO,
    }),
  ]);
  const kunnat = [...new Set(hankkeet.map((hanke) => hanke.kunta))].sort((a, b) =>
    a.localeCompare(b, "fi"),
  );
  const sivuja = sivujaYhteensa(tulos.maara, MUUTOS_SIVU_KOKO);
  const polku = (seuraava: number) =>
    maaraajatPolku({ kunta: suodatus.kunta, vaihe: suodatus.vaihe, sivu: seuraava });

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Tulevat määräajat</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Julkaistujen hankkeiden avoimet vaikuttamisen määräajat. Päättyneet
        määräajat jäävät hankkeen sivulle.
      </p>

      <HankkeetSuodatin
        suodatus={{ kunta: suodatus.kunta, vaihe: suodatus.vaihe }}
        kunnat={kunnat}
        vainKuntaJaVaihe
        toiminto="/maaraajat"
      />

      {tulos.virhe ? (
        <p className="mt-4 text-sm">{tulos.virhe}</p>
      ) : tulos.maaraajat.length === 0 ? (
        <p className="mt-6 leading-relaxed">Ei tulevia määräaikoja valituilla ehdoilla.</p>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {tulos.maaraajat.map((maaraaika) => (
              <li key={maaraaika.id} className="py-3">
                <p className="text-sm">
                  {muotoilePvm(maaraaika.paattyy_pvm)}
                  {" · "}
                  {MAARAAJA_NIMET[maaraaika.tyyppi]}
                </p>
                <p className="mt-1">
                  <a href={`/hankkeet/${maaraaika.hanke.id}`} className="text-link underline">
                    {maaraaika.hanke.nimi}
                  </a>
                  <span className="text-muted"> ({maaraaika.hanke.kunta})</span>
                </p>
              </li>
            ))}
          </ul>
          <Sivutus sivu={Math.min(sivu, sivuja)} sivuja={sivuja} polku={polku} />
        </>
      )}
    </main>
  );
}
