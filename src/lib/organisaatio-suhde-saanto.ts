/**
 * Organisaatioiden välisten omistus-, konserni- ja hallintasuhteiden kirjaussääntö.
 *
 * Omistus-, konserni- tai hallintasuhde kirjataan VAIN, jos se ilmenee nimetystä
 * asiakirjasta. Sitä ei johdeta YTJ:n verkkosivukentästä, samasta
 * rekisteröintipäivästä, samasta osoitteesta eikä muusta välillisestä merkistä.
 *
 * Esimerkki (kirjattava): Regant Oy omistaa Regant DC1 Oy:n — Salon
 * kaupunginhallituksen päätös 10.8.2026 § 260.
 *
 * Esimerkki (ei kirjattava): kaksi yhtiötä, sama YTJ-verkkosivu ja sama
 * rekisteröintipäivä (Newsec-tapaus).
 */
export const ORGANISAATIO_SUHDE_ASIAKIRJASAANTO =
  "Omistus-, konserni- tai hallintasuhde kirjataan vain, jos se ilmenee nimetystä asiakirjasta." as const;

/** Roolirivin kohde: ks. `organisaatio-nimi.ts` — vain organisaatio, ei henkilönimi. */
export { onOrganisaatioNimi, hylkaaHenkilöOrganisaatioViesti } from "@/lib/organisaatio-nimi";
