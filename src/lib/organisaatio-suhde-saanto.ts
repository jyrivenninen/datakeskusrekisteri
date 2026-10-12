/**
 * Organisaatioiden välisten omistus-, konserni- ja hallintasuhteiden kirjaussääntö.
 *
 * Asiakirjasuhteet (omistus, emoyhtio, hankeyhtio): vain nimetystä asiakirjasta
 * sanatarkalla lainauksella. Ei YTJ-metatietoa, samaa osoitetta eikä mediaa.
 *
 * GLEIF-suhteet (gleif_suora_emo, gleif_ylin_emo): vain GLEIF-tietueesta
 * ehdotusjonon kautta. Vuokralainen, konsultti, hakija ja aloitteen_tekija
 * ovat hanke_organisaatio_roolit, eivät suhteita.
 *
 * Esimerkki (kirjattava): Regant Oy omistaa Regant DC1 Oy:n — Salon
 * kaupunginhallituksen päätös 10.8.2026 § 260.
 *
 * Esimerkki (ei kirjattava): kaksi yhtiötä, sama YTJ-verkkosivu ja sama
 * rekisteröintipäivä (Newsec-tapaus).
 */
export const ORGANISAATIO_SUHDE_ASIAKIRJASAANTO =
  "Omistus-, konserni- tai hallintasuhde kirjataan vain, jos se ilmenee nimetystä asiakirjasta." as const;

export const ORGANISAATIO_SUHDE_ASIAKIRJA_TYYPIT = [
  "omistus",
  "emoyhtio",
  "hankeyhtio",
] as const;

export const ORGANISAATIO_SUHDE_GLEIF_TYYPIT = [
  "gleif_suora_emo",
  "gleif_ylin_emo",
] as const;

/** Roolirivin kohde: ks. `organisaatio-nimi.ts` — vain organisaatio, ei henkilönimi. */
export { onOrganisaatioNimi, hylkaaHenkilöOrganisaatioViesti } from "@/lib/organisaatio-nimi";
