import type { Metadata } from "next";
import { LahdeRivi } from "@/komponentit/ajankohta-lista";
import { HankkeetSuodatin } from "@/komponentit/hankkeet-suodatin";
import { Sivutus } from "@/komponentit/sivutus";
import { muotoilePvm } from "@/lib/naytto";
import {
  muutosYlarivi,
  muutoksetPolku,
  parsiSivu,
  sivujaYhteensa,
  MUUTOS_SIVU_KOKO,
} from "@/lib/muutos-naytto";
import { parsiSuodatus } from "@/lib/suodatus";
import {
  haeJulkaistutHankkeet,
  haeJulkaistutMuutokset,
} from "@/lib/supabase/kyselyt";
import { kortinMetatiedot, SIVUSTON_OTSIKKO } from "@/lib/sivuston-metatiedot";

export const metadata: Metadata = {
  ...kortinMetatiedot({
    otsikko: `Muutokset – ${SIVUSTON_OTSIKKO}`,
    kuvaus: "Hyväksytyt muutokset julkaistuun hanketietoon. Jokaisella rivillä on lähde.",
    polku: "/muutokset",
  }),
  alternates: {
    types: {
      "application/rss+xml": "/muutokset/rss",
      "application/json": "/muutokset/json",
    },
  },
};

export default async function MuutoksetSivu({
  searchParams,
}: {
  searchParams: Promise<{ kunta?: string; vaihe?: string; sivu?: string }>;
}) {
  const params = await searchParams;
  const suodatus = parsiSuodatus(params);
  const sivu = parsiSivu(params.sivu);
  const [{ hankkeet }, tulos] = await Promise.all([
    haeJulkaistutHankkeet(),
    haeJulkaistutMuutokset({
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
    muutoksetPolku({ kunta: suodatus.kunta, vaihe: suodatus.vaihe, sivu: seuraava });

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Muutokset</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Hyväksytyt muutokset julkaistuun hanketietoon. Rivi syntyy, kun tieto
        on hyväksytty lähteineen. Ehdotusjono ei näy tässä.
      </p>
      <p className="mt-3 text-sm">
        <a href="/muutokset/rss" className="text-link underline">
          RSS
        </a>
        {" · "}
        <a href="/muutokset/json" className="text-link underline">
          JSON
        </a>
        <span className="text-muted"> · CC BY 4.0</span>
      </p>

      <HankkeetSuodatin
        suodatus={{ kunta: suodatus.kunta, vaihe: suodatus.vaihe }}
        kunnat={kunnat}
        vainKuntaJaVaihe
        toiminto="/muutokset"
      />

      {tulos.virhe ? (
        <p className="mt-4 text-sm">{tulos.virhe}</p>
      ) : tulos.muutokset.length === 0 ? (
        <p className="mt-6 leading-relaxed">Ei muutoksia valituilla ehdoilla.</p>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {tulos.muutokset.map((muutos) => (
              <li key={muutos.id} className="py-3">
                <p className="text-sm">
                  {muotoilePvm(muutos.hyvaksytty_pvm)}
                  {" · "}
                  {muutosYlarivi(muutos.kentta, muutos.uusi_arvo)}
                </p>
                <p className="mt-1">
                  <a href={`/hankkeet/${muutos.hanke.id}`} className="text-link underline">
                    {muutos.hanke.nimi}
                  </a>
                  <span className="text-muted"> ({muutos.hanke.kunta})</span>
                </p>
                <LahdeRivi url={muutos.lahde_url} otsikko={muutos.lahde_otsikko} />
              </li>
            ))}
          </ul>
          <Sivutus sivu={Math.min(sivu, sivuja)} sivuja={sivuja} polku={polku} />
        </>
      )}
    </main>
  );
}
