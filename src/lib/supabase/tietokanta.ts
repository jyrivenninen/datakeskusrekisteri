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
  "lvv",
  "avi",
  "ministerio",
  "jarjesto",
  "muu",
] as const;

export type OrganisaatioTyyppi = (typeof ORGANISAATIO_TYYPIT)[number];

export const MAARAAJA_TYYPIT = [
  "yva_mielipide",
  "yva_ohjelma",
  "yva_selostus",
  "kaavamuistutus",
  "valitusaika",
  "kuulutus",
  "muu",
] as const;

export const SIJAINTI_ALUE_TYYPIT = ["kaava_alue", "tontti", "arvio"] as const;

export type SijaintiAlueTyyppi = (typeof SIJAINTI_ALUE_TYYPIT)[number];

export const HANKE_KUNTA_ROOLIT = [
  "sijaintikunta",
  "vaikutusalue",
  "sahkonsiirto",
] as const;

export type HankeKuntaRooli = (typeof HANKE_KUNTA_ROOLIT)[number];

export const MENETTELY_LAJIT = ["yva", "kaavoitus", "lupamenettely", "muu"] as const;

export type MenettelyLaji = (typeof MENETTELY_LAJIT)[number];

export const MENETTELY_TILAT = ["ei_alkanut", "vireilla", "paattynyt"] as const;

export type MenettelyTila = (typeof MENETTELY_TILAT)[number];

export const HANKE_ORGANISAATIO_ROOLIT = [
  "toimija",
  "yva_konsultti",
  "yhteysviranomainen",
  "kaavoittaja",
  "muu",
] as const;

export type HankeOrganisaatioRooli = (typeof HANKE_ORGANISAATIO_ROOLIT)[number];

export type MaaraajaTyyppi = (typeof MAARAAJA_TYYPIT)[number];

export const LUOTTAMUSTASOT = [
  "vahvistettu",
  "epavarma",
  "ristiriitainen",
] as const;

export type Luottamus = (typeof LUOTTAMUSTASOT)[number];

export const LAHDE_LAJIT = ["dokumentti", "rajapinta", "rss", "html"] as const;

export type LahdeLaji = (typeof LAHDE_LAJIT)[number];

export const MERKINNAT = ["koneen_ehdottama", "ihmisen_vahvistama"] as const;

export type Merkinta = (typeof MERKINNAT)[number];

export const MUUTOSEHDOTUS_TYYPIT = [
  "uusi_hanke",
  "taydennys",
  "korjaus",
  "kuva",
  "linkki_rikki",
  "ryhti_havainto",
  "kunta_havainto",
  "ytj_havainto",
  "mml_havainto",
  "dokumentti_muuttunut",
  "ristiriita_havainto",
  "kentta_tarkistus",
  "kentta_tyhjennys",
  "paatos",
  "maaraaja",
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
  "kaavatunnus",
  "kortteli",
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

export type SijaintiAlue = {
  type: "Polygon";
  coordinates: number[][][];
};

export type SijaintiViiva = {
  type: "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][];
};

export type Hanke = {
  id: string;
  nimi: string;
  kunta: string;
  kunta_id: string | null;
  maakunta: string | null;
  sijainti_lat: number | null;
  sijainti_lon: number | null;
  sijainti_alue: SijaintiAlue | null;
  sijainti_alue_tyyppi: SijaintiAlueTyyppi | null;
  kaavatunnus: string | null;
  kortteli: string | null;
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
  menettely_id: string | null;
  tyyppi: MaaraajaTyyppi;
  alkaa_pvm: string | null;
  paattyy_pvm: string;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type HankeKunta = {
  id: string;
  hanke_id: string;
  kunta: string;
  rooli: HankeKuntaRooli;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type HankeMenettely = {
  id: string;
  hanke_id: string;
  laji: MenettelyLaji;
  tila: MenettelyTila;
  tunnus: string | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export const JOHTO_TYYPIT = ["ilmajohto", "maakaapeli"] as const;

export type JohtoTyyppi = (typeof JOHTO_TYYPIT)[number];

export type HankeJohto = {
  id: string;
  hanke_id: string;
  menettely_id: string | null;
  tyyppi: JohtoTyyppi;
  jannite_kv: number | null;
  pituus_km: number | null;
  vaihtoehto: string | null;
  liittymispiste: string | null;
  reitti: SijaintiViiva | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type HankeKuva = {
  id: string;
  hanke_id: string;
  kuva_url: string;
  kuvateksti: string;
  kuvaaja: string;
  jarjestys: number;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type HankeVaihtoehto = {
  id: string;
  hanke_id: string;
  menettely_id: string | null;
  tunnus: string;
  teho_mw: number | null;
  it_teho_mw: number | null;
  pinta_ala_ha: number | null;
  sahkonkaytto_twh_a: number | null;
  generaattorit_lkm: number | null;
  generaattorit_kaytossa_max_lkm: number | null;
  generaattori_polttoaineteho_mw: number | null;
  sijainti_alue: SijaintiAlue | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type HankeOrganisaatio = {
  id: string;
  hanke_id: string;
  organisaatio_id: string;
  rooli: HankeOrganisaatioRooli;
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

export const DOKUMENTTI_LAJIT = [
  "verkkosivu",
  "kuulutus",
  "yva_ohjelma",
  "yva_selostus",
  "asemakaava",
  "kaavamaaraykset",
  "kartta_aineisto",
  "muu",
] as const;

export type DokumenttiLaji = (typeof DOKUMENTTI_LAJIT)[number];

export const DOKUMENTTI_MUODOT = ["html", "pdf", "wfs", "muu"] as const;

export type DokumenttiMuoto = (typeof DOKUMENTTI_MUODOT)[number];

export const DOKUMENTTI_KIELET = ["fi", "sv", "en"] as const;

export type DokumenttiKieli = (typeof DOKUMENTTI_KIELET)[number];

export type Paatos = {
  id: string;
  hanke_id: string;
  kuvaus: string;
  pvm: string;
  paattava_organisaatio_id: string;
  dokumentti_id: string | null;
  menettely_id: string | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type PaatosNakyma = Paatos & {
  paattava_organisaatio: Pick<Organisaatio, "id" | "nimi">;
};

export type Dokumentti = {
  id: string;
  hanke_id: string | null;
  url: string;
  otsikko: string;
  laji: DokumenttiLaji;
  muoto: DokumenttiMuoto | null;
  kieli: DokumenttiKieli | null;
  julkaisija: string | null;
  julkaistu_pvm: string | null;
  tunnus: string | null;
  sivumaara: number | null;
  menettely_id: string | null;
  julkaistu: boolean;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type KenttaLahde = {
  id: string;
  taulu:
    | "hankkeet"
    | "maaraajat"
    | "organisaatiot"
    | "yhteyshenkilot"
    | "hanke_kunnat"
    | "hanke_menettelyt"
    | "hanke_organisaatiot"
    | "dokumentit"
    | "hanke_johdot"
    | "hanke_vaihtoehdot"
    | "hanke_kuvat"
    | "paatokset";
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lahde_laji: LahdeLaji;
  dokumentti_id: string | null;
  vahvistettu_pvm: string;
  luottamus: Luottamus;
  lainaus: string | null;
  merkitty: Merkinta;
  merkitty_pvm: string;
  luotu_pvm: string;
};

export const KENTTA_TARKISTUS_TULOKSET = ["ei_julkista_lahdetta"] as const;

export type KenttaTarkistusTulos = (typeof KENTTA_TARKISTUS_TULOKSET)[number];

export type KenttaTarkistus = {
  id: string;
  taulu: "hankkeet" | "hanke_vaihtoehdot";
  rivi_id: string;
  kentta: string;
  tulos: KenttaTarkistusTulos;
  vahvistettu_pvm: string;
  merkitty: Merkinta;
  merkitty_pvm: string;
  huomautus: string | null;
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

export const ESITYSLISTA_JARJESTELMAT = [
  "casem",
  "dynasty",
  "tweb",
  "rss",
  "ical",
  "avoindata",
  "muu",
] as const;

export type EsityslistaJarjestelma = (typeof ESITYSLISTA_JARJESTELMAT)[number];

export type Kunta = {
  id: string;
  koodi: string;
  nimi: string;
  nimi_sv: string | null;
  maakunta: string | null;
  ely: string | null;
  voimassa: boolean;
  lahde_url: string | null;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export type KuntaEsityslistaLahde = {
  id: string;
  kunta_id: string;
  jarjestelma: EsityslistaJarjestelma;
  perus_url: string;
  seurannassa: boolean;
  huomautus: string | null;
  luotu_pvm: string;
  paivitetty_pvm: string;
};

export const PALAUTE_AIHEET = ["palaute", "kysymys", "muu"] as const;

export type PalauteAihe = (typeof PALAUTE_AIHEET)[number];

export const PALAUTE_TILAT = ["odottaa", "kasitelty"] as const;

export type PalauteTila = (typeof PALAUTE_TILAT)[number];

export type Palaute = {
  id: string;
  aihe: PalauteAihe;
  nimi: string | null;
  sahkoposti: string | null;
  viesti: string;
  tila: PalauteTila;
  luotu_pvm: string;
  kasitelty_pvm: string | null;
  kasittelija: string | null;
  huomautus: string | null;
};
