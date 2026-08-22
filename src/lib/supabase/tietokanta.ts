/**
 * Tietokantatyypit, jotka vastaavat migraatiota
 * supabase/migrations/20260822180000_alkuskeema.sql
 *
 * Hanketietoja ei tallenneta tähän tiedostoon.
 */

export const HANKE_VAIHEET = [
  "esiselvitys",
  "yva_vireilla",
  "yva_paattynyt",
  "kaavoitus",
  "lupamenettely",
  "rakenteilla",
  "toiminnassa",
  "peruttu",
] as const;

export type HankeVaihe = (typeof HANKE_VAIHEET)[number];

export const ORGANISAATIO_TYYPIT = [
  "yritys",
  "kunta",
  "ely",
  "avi",
  "ministerio",
  "jarjesto",
  "muu",
] as const;

export type OrganisaatioTyyppi = (typeof ORGANISAATIO_TYYPIT)[number];

export const MAARAAJA_TYYPIT = [
  "yva_mielipide",
  "kaavamuistutus",
  "valitusaika",
  "kuulutus",
  "muu",
] as const;

export type MaaraajaTyyppi = (typeof MAARAAJA_TYYPIT)[number];

export const LUOTTAMUSTASOT = [
  "vahvistettu",
  "epavarma",
  "ristiriitainen",
] as const;

export type Luottamus = (typeof LUOTTAMUSTASOT)[number];

export const MERKINNAT = ["koneen_ehdottama", "ihmisen_vahvistama"] as const;

export type Merkinta = (typeof MERKINNAT)[number];

export const MUUTOSEHDOTUS_TYYPIT = [
  "uusi_hanke",
  "taydennys",
  "korjaus",
] as const;

export type MuutosehdotusTyyppi = (typeof MUUTOSEHDOTUS_TYYPIT)[number];

export const EHDOTTAJA_TYYPIT = ["lomake", "agentti", "yllapitaja"] as const;

export type EhdottajaTyyppi = (typeof EHDOTTAJA_TYYPIT)[number];

export const MUUTOSEHDOTUS_TILAT = [
  "odottaa",
  "hyvaksytty",
  "hylatty",
] as const;

export type MuutosehdotusTila = (typeof MUUTOSEHDOTUS_TILAT)[number];

/** Pakolliset hankekentät: lähde vaaditaan aina. */
export const HANKE_FAKTAKENTAT_PAKOLLISET = ["nimi", "kunta", "vaihe"] as const;

/**
 * Ehdolliset hankekentät: lähde vaaditaan, jos arvo ei ole tyhjä.
 * Koordinaatit käyttävät lähdekenttää `sijainti`.
 */
export const HANKE_FAKTAKENTAT_EHDOLLISET = [
  "maakunta",
  "sijainti",
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
  "toimija_organisaatio_id",
  "yva_diaarinumero",
] as const;

export type Organisaatio = {
  id: string;
  nimi: string;
  y_tunnus: string | null;
  tyyppi: OrganisaatioTyyppi;
  verkko_osoite: string | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type Hanke = {
  id: string;
  nimi: string;
  kunta: string;
  maakunta: string | null;
  sijainti_lat: number | null;
  sijainti_lon: number | null;
  vaihe: HankeVaihe;
  teho_mw: number | null;
  it_teho_mw: number | null;
  pinta_ala_ha: number | null;
  sahkonkaytto_twh_a: number | null;
  generaattorit_lkm: number | null;
  generaattorit_kaytossa_max_lkm: number | null;
  generaattori_polttoaineteho_mw: number | null;
  toimija_organisaatio_id: string | null;
  yva_diaarinumero: string | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type Maaraaja = {
  id: string;
  hanke_id: string;
  tyyppi: MaaraajaTyyppi;
  alkaa_pvm: string | null;
  paattyy_pvm: string;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type Yhteyshenkilo = {
  id: string;
  nimi: string;
  rooli: string;
  organisaatio_id: string | null;
  hanke_id: string | null;
  sahkoposti: string | null;
  puhelin: string | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type KenttaLahde = {
  id: string;
  taulu: "hankkeet" | "maaraajat" | "organisaatiot" | "yhteyshenkilot";
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  lahde_sivu: number | null;
  vahvistettu_pvm: string;
  luottamus: Luottamus;
  lainaus: string | null;
  merkitty: Merkinta;
  merkitty_pvm: string;
  luotu_pvm: string;
};

export type Muutosehdotus = {
  id: string;
  tyyppi: MuutosehdotusTyyppi;
  hanke_id: string | null;
  ehdottaja_tyyppi: EhdottajaTyyppi;
  ehdottaja_tunniste: string;
  sisalto: Record<string, unknown>;
  tila: MuutosehdotusTila;
  perustelu: string | null;
  huomautus: string | null;
  lahde_url: string | null;
  luotu_pvm: string;
  kasitelty_pvm: string | null;
  kasittelija: string | null;
};
