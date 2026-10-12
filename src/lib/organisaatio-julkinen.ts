import type { Organisaatio } from "@/lib/supabase/tietokanta";

/** Julkinen teksti, kun GLEIF ilmoittaa poikkeuksen (esim. NATURAL_PERSONS). */
export const GLEIF_EI_EMOYHTIOTIETOA = "ei emoyhtiötietoa GLEIF:ssä";

const POIKKEUS_KENTAT = [
  "gleif_suora_emo_poikkeus",
  "gleif_ylin_emo_poikkeus",
] as const;

/** Poistaa GLEIF-poikkeuskoodit julkisesta / avoimen datan näkymästä. */
export function ilmanGleifPoikkeuksia<T extends Partial<Organisaatio>>(
  organisaatio: T,
): Omit<T, (typeof POIKKEUS_KENTAT)[number]> {
  const {
    gleif_suora_emo_poikkeus: _s,
    gleif_ylin_emo_poikkeus: _y,
    ...julkinen
  } = organisaatio;
  return julkinen;
}

/** Avoimen datan sallitut organisaatiokentät (ei poikkeuskoodeja eikä sisäisiä). */
export function serialisoiJulkinenOrganisaatio(
  organisaatio: Pick<Organisaatio, "id" | "nimi" | "slug"> &
    Partial<Organisaatio>,
): {
  id: string;
  nimi: string;
  slug: string;
  y_tunnus?: string | null;
  tyyppi?: Organisaatio["tyyppi"];
  verkko_osoite?: string | null;
  lei?: string | null;
  maa?: string | null;
  rekisterinumero?: string | null;
  rekisteriviranomainen?: string | null;
} {
  const pohja = {
    id: organisaatio.id,
    nimi: organisaatio.nimi,
    slug: organisaatio.slug,
  };
  const lisat: Record<string, unknown> = {};
  if ("y_tunnus" in organisaatio) lisat.y_tunnus = organisaatio.y_tunnus ?? null;
  if ("tyyppi" in organisaatio) lisat.tyyppi = organisaatio.tyyppi;
  if ("verkko_osoite" in organisaatio) {
    lisat.verkko_osoite = organisaatio.verkko_osoite ?? null;
  }
  if ("lei" in organisaatio) lisat.lei = organisaatio.lei ?? null;
  if ("maa" in organisaatio) lisat.maa = organisaatio.maa ?? null;
  if ("rekisterinumero" in organisaatio) {
    lisat.rekisterinumero = organisaatio.rekisterinumero ?? null;
  }
  if ("rekisteriviranomainen" in organisaatio) {
    lisat.rekisteriviranomainen = organisaatio.rekisteriviranomainen ?? null;
  }
  return { ...pohja, ...lisat } as ReturnType<typeof serialisoiJulkinenOrganisaatio>;
}
