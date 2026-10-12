/**
 * Täydentää uuden hankkeen tuonnin arvioidulla kuntakeskuspisteellä,
 * kun lat/lon puuttuvat. Ei siirrä pistettä suunnan/etäisyyden mukaan.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { geokoodaaKuntakeskus, type GeokoodausTulos } from "@/lib/geokoodaus";
import type { UusiHankeTuonti, UusiHankeTuontiKentta } from "@/lib/uusi-hanke-tuonti";

export type KuntakeskusTaydennys = {
  tuonti: UusiHankeTuonti;
  /** true = lat/lon lisättiin kuntakeskuksesta */
  taydennetty: boolean;
};

function kenttaArvo(tuonti: UusiHankeTuonti, nimi: string): string | undefined {
  return tuonti.kentat.find((k) => k.kentta === nimi)?.arvo?.trim() || undefined;
}

function asetaTaiLisaaKentta(
  kentat: UusiHankeTuontiKentta[],
  rivi: UusiHankeTuontiKentta,
): UusiHankeTuontiKentta[] {
  const i = kentat.findIndex((k) => k.kentta === rivi.kentta);
  if (i < 0) return [...kentat, rivi];
  const kopio = [...kentat];
  kopio[i] = rivi;
  return kopio;
}

/**
 * Jos tuonnissa ei ole molempia koordinaatteja, hakee kunnan `kunnat`-taulusta
 * ja geokoodaa keskustan. Asettaa `sijainti_alue_tyyppi = arvio`.
 */
export async function taydennaKuntakeskusArvio(
  tuonti: UusiHankeTuonti,
  supabase: SupabaseClient,
  geokoodaa: (nimi: string) => Promise<GeokoodausTulos> = geokoodaaKuntakeskus,
): Promise<KuntakeskusTaydennys> {
  const lat = kenttaArvo(tuonti, "sijainti_lat");
  const lon = kenttaArvo(tuonti, "sijainti_lon");
  if (lat && lon) {
    return { tuonti, taydennetty: false };
  }
  if (lat || lon) {
    throw new Error(
      "Anna sekä sijainti_lat että sijainti_lon, tai jätä molemmat pois (kuntakeskusarvio).",
    );
  }

  const kuntaNimi = (tuonti.kunta || kenttaArvo(tuonti, "kunta") || "").trim();
  if (!kuntaNimi) {
    throw new Error("Kuntakeskusarviota ei voi tehdä ilman kuntaa.");
  }

  const { data: kunta, error } = await supabase
    .from("kunnat")
    .select("nimi, lahde_url")
    .ilike("nimi", kuntaNimi)
    .eq("voimassa", true)
    .maybeSingle();
  if (error) throw new Error(`Kunnan haku epäonnistui: ${error.message}`);
  if (!kunta?.nimi) {
    throw new Error(
      `Kuntaa «${kuntaNimi}» ei löytynyt kunnat-taulusta — lisää koordinaatit JSONiin tai korjaa kunnan nimi.`,
    );
  }

  const geo = await geokoodaa(kunta.nimi);
  const lainaus =
    `Piste johdettu kunnan ${kunta.nimi} keskustasta (kunnat-taulu` +
    (kunta.lahde_url ? `, ${kunta.lahde_url}` : "") +
    `; MML-geokoodaus${geo.label ? `: ${geo.label}` : ""}). ` +
    `Ei siirretty suunnan tai etäisyyden mukaan.`;

  const menetelmaLahde = {
    url: geo.lahde_url,
    lahde_tyyppi: "menetelma",
    lainaus,
  };

  let kentat = [...tuonti.kentat];
  kentat = asetaTaiLisaaKentta(kentat, {
    kentta: "sijainti_lat",
    arvo: String(geo.lat),
    lahteet: [menetelmaLahde],
  });
  kentat = asetaTaiLisaaKentta(kentat, {
    kentta: "sijainti_lon",
    arvo: String(geo.lon),
    lahteet: [menetelmaLahde],
  });

  const tyyppiRivi = kentat.find((k) => k.kentta === "sijainti_alue_tyyppi");
  if (tyyppiRivi) {
    kentat = asetaTaiLisaaKentta(kentat, {
      ...tyyppiRivi,
      arvo: "arvio",
      lahteet:
        tyyppiRivi.arvo === "arvio"
          ? tyyppiRivi.lahteet
          : [
              {
                url: geo.lahde_url,
                lahde_tyyppi: "menetelma",
                lainaus:
                  `sijainti_alue_tyyppi = arvio, koska koordinaatit johdettiin ` +
                  `kunnan ${kunta.nimi} keskustasta ilman tarkkaa rajaa.`,
              },
            ],
    });
  } else {
    kentat = asetaTaiLisaaKentta(kentat, {
      kentta: "sijainti_alue_tyyppi",
      arvo: "arvio",
      lahteet: [
        {
          url: geo.lahde_url,
          lahde_tyyppi: "menetelma",
          lainaus: `Kuntakeskusarvio kunnalle ${kunta.nimi}.`,
        },
      ],
    });
  }

  return {
    tuonti: { ...tuonti, kentat },
    taydennetty: true,
  };
}
