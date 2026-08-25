import type {
  Hanke,
  HankeKuntaRooli,
  HankeOrganisaatioRooli,
  HankeVaihe,
  JohtoTyyppi,
  Luottamus,
  MaaraajaTyyppi,
  MenettelyLaji,
  MenettelyTila,
  Merkinta,
  OrganisaatioTyyppi,
  SijaintiAlueTyyppi,
  DokumenttiLaji,
  DokumenttiMuoto,
  DokumenttiKieli,
  MuutosehdotusTila,
} from "@/lib/supabase/tietokanta";
import { HANKE_VAIHEET, ORGANISAATIO_TYYPIT } from "@/lib/supabase/tietokanta";

export const VAIHE_NIMET: Record<HankeVaihe, string> = {
  esiselvitys: "Esiselvitys",
  yva_vireilla: "YVA vireillä",
  yva_paattynyt: "YVA päättynyt",
  kaavoitus: "Kaavoitus",
  lupamenettely: "Lupamenettely",
  rakenteilla: "Rakenteilla",
  toiminnassa: "Toiminnassa",
  peruttu: "Peruttu",
};

/** Karttanuppineulan väri. Ei sama kuin lähteen liikennevalo. */
export const VAIHE_VARIT: Record<HankeVaihe, string> = {
  esiselvitys: "#57534e",
  yva_vireilla: "#ca8a04",
  yva_paattynyt: "#a16207",
  kaavoitus: "#0369a1",
  lupamenettely: "#6d28d9",
  rakenteilla: "#c2410c",
  toiminnassa: "#15803d",
  peruttu: "#9f1239",
};

export const MAARAAJA_NIMET: Record<MaaraajaTyyppi, string> = {
  yva_mielipide: "YVA-mielipide",
  yva_ohjelma: "YVA-ohjelma",
  yva_selostus: "YVA-selostus",
  kaavamuistutus: "Kaavamuistutus",
  valitusaika: "Valitusaika",
  kuulutus: "Kuulutus",
  muu: "Muu määräaika",
};

export const LUOTTAMUS_NIMET: Record<Luottamus, string> = {
  vahvistettu: "Vahvistettu",
  epavarma: "Epävarma",
  ristiriitainen: "Ristiriitainen",
};

export const KENTAN_TILAT = ["vahvistettu", "vahvistamaton", "puuttuu"] as const;

export type KentanTila = (typeof KENTAN_TILAT)[number];

export const KENTAN_TILA_NIMET: Record<KentanTila, string> = {
  vahvistettu: "Vahvistettu",
  vahvistamaton: "Vahvistamaton",
  puuttuu: "Puuttuu",
};

/** Kentän tila: arvo ja lähteiden luottamus. Ristiriita tai epävarma → vahvistamaton. */
export function kentanTila(
  arvoOn: boolean,
  lahteet: ReadonlyArray<{ luottamus: Luottamus }>,
): KentanTila {
  if (!arvoOn) return "puuttuu";
  if (lahteet.length === 0) return "vahvistamaton";
  if (lahteet.some((lahde) => lahde.luottamus !== "vahvistettu")) {
    return "vahvistamaton";
  }
  return "vahvistettu";
}

export const MERKINTA_NIMET: Record<Merkinta, string> = {
  koneen_ehdottama: "Koneen ehdottama",
  ihmisen_vahvistama: "Ihmisen vahvistama",
};

export const MUUTOSEHDOTUS_TYYPPI_NIMET: Record<string, string> = {
  uusi_hanke: "Uusi hanke",
  taydennys: "Täydennys",
  korjaus: "Korjaus",
  kuva: "Valokuva",
  linkki_rikki: "Rikkinäinen linkki",
  ryhti_havainto: "Ryhti-havainto",
  kunta_havainto: "Kuntahavainto",
  ytj_havainto: "YTJ-havainto",
  mml_havainto: "MML-havainto",
  dokumentti_muuttunut: "Dokumentti muuttunut",
  ristiriita_havainto: "Ristiriitahavainto",
};

export const MUUTOSEHDOTUS_TILA_NIMET: Record<MuutosehdotusTila, string> = {
  odottaa: "Odottaa",
  hyvaksytty: "Hyväksytty",
  hylatty: "Hylätty",
};

const MUUTOSEHDOTUS_TILA_JARJESTYS: Record<MuutosehdotusTila, number> = {
  odottaa: 0,
  hyvaksytty: 1,
  hylatty: 2,
};

/** Odottaa ylimpänä, sitten hyväksytyt, alimpana hylätyt. Saman tilan sisällä uusin ensin. */
export function jarjestaMuutosehdotukset<
  T extends { tila: string; luotu_pvm: string },
>(rivit: readonly T[]): T[] {
  return [...rivit].sort((a, b) => {
    const ja =
      MUUTOSEHDOTUS_TILA_JARJESTYS[a.tila as MuutosehdotusTila] ?? 99;
    const jb =
      MUUTOSEHDOTUS_TILA_JARJESTYS[b.tila as MuutosehdotusTila] ?? 99;
    if (ja !== jb) return ja - jb;
    return b.luotu_pvm.localeCompare(a.luotu_pvm);
  });
}

export const ORGANISAATIO_TYYPPI_NIMET: Record<OrganisaatioTyyppi, string> = {
  yritys: "Yritys",
  kunta: "Kunta",
  ely: "ELY-keskus",
  lvv: "Lupa- ja valvontavirasto",
  avi: "AVI",
  ministerio: "Ministeriö",
  jarjesto: "Järjestö",
  muu: "Muu",
};

export function onOrganisaatioTyyppi(arvo: string): arvo is OrganisaatioTyyppi {
  return (ORGANISAATIO_TYYPIT as readonly string[]).includes(arvo);
}

export const HANKE_KENTTA_NIMET: Record<string, string> = {
  nimi: "Nimi",
  kunta: "Kunta",
  maakunta: "Maakunta",
  sijainti: "Sijainti",
  sijainti_lat: "Leveysaste",
  sijainti_lon: "Pituusaste",
  vaihe: "Vaihe",
  teho_mw: "Teho (MW)",
  it_teho_mw: "IT-teho (MW)",
  pinta_ala_ha: "Pinta-ala (ha)",
  sahkonkaytto_twh_a: "Sähkönkäyttö (TWh/a)",
  generaattorit_lkm: "Varavoimageneraattorit (kpl)",
  generaattorit_kaytossa_max_lkm: "Generaattoreita yhtä aikaa enintään (kpl)",
  generaattori_polttoaineteho_mw: "Generaattorin polttoaineteho (MW)",
  toimija_organisaatio_id: "Hankkeesta vastaava",
  toimija_nimi: "Hankkeesta vastaava",
  yva_diaarinumero: "YVA-diaarinumero",
  kaavatunnus: "Kaavatunnus",
  kortteli: "Kortteli",
  sijainti_alue_tyyppi: "Alueen tyyppi",
  tunnus: "Tunnus",
  kuva_url: "Kuvan osoite",
  kuvateksti: "Kuvateksti",
  kuvaaja: "Valokuvaaja",
};

export const SIJAINTI_ALUE_TYYPPI_NIMET: Record<SijaintiAlueTyyppi, string> = {
  kaava_alue: "Kaava-alue",
  tontti: "Tontti",
  arvio: "Arvio",
};

export const HANKE_KUNTA_ROOLI_NIMET: Record<HankeKuntaRooli, string> = {
  sijaintikunta: "Sijaintikunta",
  vaikutusalue: "Vaikutusalue",
  sahkonsiirto: "Sähkönsiirto",
};

export const MENETTELY_LAJI_NIMET: Record<MenettelyLaji, string> = {
  yva: "YVA",
  kaavoitus: "Kaavoitus",
  lupamenettely: "Lupamenettely",
  muu: "Muu menettely",
};

export const MENETTELY_TILA_NIMET: Record<MenettelyTila, string> = {
  ei_alkanut: "Ei alkanut",
  vireilla: "Vireillä",
  paattynyt: "Päättynyt",
};

export const HANKE_ORGANISAATIO_ROOLI_NIMET: Record<HankeOrganisaatioRooli, string> = {
  toimija: "Hankkeesta vastaava",
  yva_konsultti: "YVA-konsultti",
  yhteysviranomainen: "Yhteysviranomainen",
  kaavoittaja: "Kaavoittaja",
  muu: "Muu",
};

export const DOKUMENTTI_LAJI_NIMET: Record<DokumenttiLaji, string> = {
  verkkosivu: "Verkkosivu",
  kuulutus: "Kuulutus",
  yva_ohjelma: "YVA-ohjelma",
  yva_selostus: "YVA-selostus",
  asemakaava: "Asemakaava",
  kaavamaaraykset: "Kaavamääräykset",
  kartta_aineisto: "Kartta-aineisto",
  muu: "Muu asiakirja",
};

export const DOKUMENTTI_MUOTO_NIMET: Record<DokumenttiMuoto, string> = {
  html: "HTML",
  pdf: "PDF",
  wfs: "WFS",
  muu: "Muu muoto",
};

export const DOKUMENTTI_KIELI_NIMET: Record<DokumenttiKieli, string> = {
  fi: "suomi",
  sv: "ruotsi",
  en: "englanti",
};

export const JOHTO_TYYPPI_NIMET: Record<JohtoTyyppi, string> = {
  ilmajohto: "Ilmajohto",
  maakaapeli: "Maakaapeli",
};

export const KOKO_LUOKAT = [
  { arvo: "pieni", nimi: "Alle 50 MW" },
  { arvo: "keski", nimi: "50–200 MW" },
  { arvo: "suuri", nimi: "Yli 200 MW" },
  { arvo: "ei_ilmoitettu", nimi: "Tehoa ei merkitty" },
] as const;

export type KokoLuokka = (typeof KOKO_LUOKAT)[number]["arvo"];

export function onHankeVaihe(arvo: string): arvo is HankeVaihe {
  return (HANKE_VAIHEET as readonly string[]).includes(arvo);
}

export function onKokoLuokka(arvo: string): arvo is KokoLuokka {
  return KOKO_LUOKAT.some((luokka) => luokka.arvo === arvo);
}

export function hankeTehoMw(hanke: Pick<Hanke, "it_teho_mw" | "teho_mw">): number | null {
  if (hanke.it_teho_mw != null) return Number(hanke.it_teho_mw);
  if (hanke.teho_mw != null) return Number(hanke.teho_mw);
  return null;
}

export function hankeKokoLuokka(hanke: Pick<Hanke, "it_teho_mw" | "teho_mw">): KokoLuokka {
  const teho = hankeTehoMw(hanke);
  if (teho == null) return "ei_ilmoitettu";
  if (teho < 50) return "pieni";
  if (teho <= 200) return "keski";
  return "suuri";
}

export function muotoilePvm(arvo: string): string {
  const pvm = arvo.slice(0, 10);
  const [vuosi, kuukausi, paiva] = pvm.split("-");
  if (!vuosi || !kuukausi || !paiva) return arvo;
  return `${Number(paiva)}.${Number(kuukausi)}.${vuosi}`;
}

export function kenttaNayttonimi(taulu: string, kentta: string): string {
  if (HANKE_KENTTA_NIMET[kentta]) return HANKE_KENTTA_NIMET[kentta];
  return `${taulu}.${kentta}`;
}

export function muotoileLuku(arvo: number | string): string {
  const luku = typeof arvo === "number" ? arvo : Number(arvo);
  if (Number.isNaN(luku)) return String(arvo);
  return new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 3 }).format(luku);
}

export function muotoileVaihtelvali(
  min: number,
  max: number,
  yksikko: string,
): string {
  if (min === max) return `${muotoileLuku(min)} ${yksikko}`;
  return `${muotoileLuku(min)}–${muotoileLuku(max)} ${yksikko}`;
}
