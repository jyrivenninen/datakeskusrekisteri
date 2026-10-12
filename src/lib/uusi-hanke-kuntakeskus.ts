/**
 * Täydentää uuden hankkeen tuonnin arvioidulla kuntakeskuspisteellä,
 * kun lat/lon puuttuvat. Ei siirrä pistettä suunnan/etäisyyden mukaan.
 * Kirjoittaa pisteen vain jos MML-vastaus täsmää kunnan nimeen/koodiin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  geokoodaaKuntakeskus,
  geokoodausLainaus,
  geokoodausVastaaKuntaa,
  muotoileKoordinaatit,
  type GeokoodausOdotettuKunta,
  type GeokoodausTulos,
} from "@/lib/geokoodaus";
import type { UusiHankeTuonti, UusiHankeTuontiKentta } from "@/lib/uusi-hanke-tuonti";

export type SijaintiEsikatselu = {
  lat: number | null;
  lon: number | null;
  paikka_nimi: string | null;
  kunta_nimi: string | null;
  kunta_koodi: string | null;
  maakunta_nimi: string | null;
  paikka_tyyppi: string | null;
  sanallinen: string | null;
  /** Geokoodaus/piste ei täsmää hankkeen kuntaan → vahvistus estetty. */
  estaa_vahvistuksen: boolean;
  varoitus: string | null;
};

export type KuntakeskusTaydennys = {
  tuonti: UusiHankeTuonti;
  /** true = lat/lon lisättiin kuntakeskuksesta */
  taydennetty: boolean;
  sijainti: SijaintiEsikatselu;
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

function tyhjaSijainti(varoitus: string | null, estaa = false): SijaintiEsikatselu {
  return {
    lat: null,
    lon: null,
    paikka_nimi: null,
    kunta_nimi: null,
    kunta_koodi: null,
    maakunta_nimi: null,
    paikka_tyyppi: null,
    sanallinen: null,
    estaa_vahvistuksen: estaa,
    varoitus,
  };
}

function sijaintiTuloksesta(
  geo: GeokoodausTulos,
  odotettu: GeokoodausOdotettuKunta,
  hankkeenMaakunta: string | null,
): SijaintiEsikatselu {
  const vastaa = geokoodausVastaaKuntaa(geo, odotettu);
  const maakuntaOk =
    !hankkeenMaakunta ||
    !geo.maakunta_nimi ||
    geo.maakunta_nimi.trim().toLocaleLowerCase("fi") ===
      hankkeenMaakunta.trim().toLocaleLowerCase("fi") ||
    // MML voi palauttaa maakuntakoodin (01) eikä nimeä
    /^\d+$/.test(geo.maakunta_nimi.trim());
  const estaa = !vastaa || (!maakuntaOk && Boolean(hankkeenMaakunta && geo.maakunta_nimi));
  const sanallinen = [
    muotoileKoordinaatit(geo.lat, geo.lon),
    geo.maakunta_nimi,
    vastaa
      ? `vastaa kuntaa ${odotettu.nimi}`
      : `ei vastaa kuntaa ${odotettu.nimi} (vastaus: ${geo.kunta_nimi ?? "?"} ${geo.kunta_koodi ?? "?"})`,
  ]
    .filter(Boolean)
    .join(", ");

  let varoitus: string | null = null;
  if (!vastaa) {
    varoitus =
      `Kunnan keskipistettä ei saatu luotettavasti: MML palautti paikan ` +
      `«${geo.paikka_nimi ?? "?"}» kunnassa ${geo.kunta_nimi ?? "?"} (${geo.kunta_koodi ?? "?"}), ` +
      `ei ${odotettu.nimi} (${odotettu.koodi}).`;
  } else if (!maakuntaOk && hankkeenMaakunta && geo.maakunta_nimi) {
    varoitus =
      `Geokoodatun pisteen maakunta (${geo.maakunta_nimi}) ei vastaa hankkeen maakuntaa (${hankkeenMaakunta}).`;
  }

  return {
    lat: geo.lat,
    lon: geo.lon,
    paikka_nimi: geo.paikka_nimi,
    kunta_nimi: geo.kunta_nimi,
    kunta_koodi: geo.kunta_koodi,
    maakunta_nimi: geo.maakunta_nimi,
    paikka_tyyppi: geo.paikka_tyyppi,
    sanallinen,
    estaa_vahvistuksen: estaa,
    varoitus,
  };
}

/**
 * Jos tuonnissa ei ole molempia koordinaatteja, hakee kunnan `kunnat`-taulusta
 * ja geokoodaa keskustan. Asettaa `sijainti_alue_tyyppi = arvio` vain kun
 * kuntatarkistus menee läpi.
 */
export async function taydennaKuntakeskusArvio(
  tuonti: UusiHankeTuonti,
  supabase: SupabaseClient,
  geokoodaa: (
    odotettu: GeokoodausOdotettuKunta,
  ) => Promise<GeokoodausTulos> = geokoodaaKuntakeskus,
): Promise<KuntakeskusTaydennys> {
  const lat = kenttaArvo(tuonti, "sijainti_lat");
  const lon = kenttaArvo(tuonti, "sijainti_lon");
  if (lat && lon) {
    const { data: kunta } = await supabase
      .from("kunnat")
      .select("nimi, koodi, maakunta")
      .ilike("nimi", tuonti.kunta.trim())
      .eq("voimassa", true)
      .maybeSingle();
    // Annetut koordinaatit: esikatselu ilman geokoodausta; ei estetä automaattisesti.
    return {
      tuonti,
      taydennetty: false,
      sijainti: {
        lat: Number(lat),
        lon: Number(lon),
        paikka_nimi: null,
        kunta_nimi: kunta?.nimi ?? tuonti.kunta,
        kunta_koodi: kunta?.koodi ?? null,
        maakunta_nimi: kunta?.maakunta ?? null,
        paikka_tyyppi: null,
        sanallinen: [
          muotoileKoordinaatit(Number(lat), Number(lon)),
          kunta?.maakunta,
          kunta ? `hankkeen kunta ${kunta.nimi}` : null,
        ]
          .filter(Boolean)
          .join(", "),
        estaa_vahvistuksen: false,
        varoitus: null,
      },
    };
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
    .select("nimi, koodi, lahde_url, maakunta")
    .ilike("nimi", kuntaNimi)
    .eq("voimassa", true)
    .maybeSingle();
  if (error) throw new Error(`Kunnan haku epäonnistui: ${error.message}`);
  if (!kunta?.nimi || !kunta.koodi) {
    return {
      tuonti,
      taydennetty: false,
      sijainti: tyhjaSijainti(
        `Kuntaa «${kuntaNimi}» ei löytynyt kunnat-taulusta — kunnan keskipistettä ei saatu luotettavasti.`,
      ),
    };
  }

  const odotettu: GeokoodausOdotettuKunta = {
    nimi: kunta.nimi,
    koodi: kunta.koodi,
  };

  let geo: GeokoodausTulos;
  try {
    geo = await geokoodaa(odotettu);
  } catch (e) {
    return {
      tuonti,
      taydennetty: false,
      sijainti: tyhjaSijainti(
        e instanceof Error
          ? `Kunnan keskipistettä ei saatu luotettavasti: ${e.message}`
          : "Kunnan keskipistettä ei saatu luotettavasti.",
      ),
    };
  }

  const sijainti = sijaintiTuloksesta(geo, odotettu, kunta.maakunta);
  if (sijainti.estaa_vahvistuksen || !geokoodausVastaaKuntaa(geo, odotettu)) {
    // Näytä palautettu paikka esikatselussa, mutta älä kirjoita lat/lon
    // tuontiin; vahvistus estetty.
    return {
      tuonti,
      taydennetty: false,
      sijainti: {
        ...sijainti,
        estaa_vahvistuksen: true,
        varoitus:
          sijainti.varoitus ??
          "Kunnan keskipistettä ei saatu luotettavasti.",
      },
    };
  }

  const lainaus = geokoodausLainaus(
    geo,
    `Piste johdettu kunnan ${kunta.nimi} (${kunta.koodi}) keskustasta` +
      (kunta.lahde_url ? ` (kunnat-taulu: ${kunta.lahde_url})` : "") +
      "; MML-geokoodaus. Ei siirretty suunnan tai etäisyyden mukaan",
  );

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
                  `kunnan ${kunta.nimi} (${kunta.koodi}) keskustasta ilman tarkkaa rajaa.`,
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
          lainaus: `Kuntakeskusarvio kunnalle ${kunta.nimi} (${kunta.koodi}).`,
        },
      ],
    });
  }

  return {
    tuonti: { ...tuonti, kentat },
    taydennetty: true,
    sijainti,
  };
}
