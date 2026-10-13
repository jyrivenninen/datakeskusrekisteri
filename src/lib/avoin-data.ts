import { onKonsulttiSivuRooli } from "@/lib/konsultti-roolit";
import { lahdeVoimassaLaskentaan } from "@/lib/lahde-tila";
import { serialisoiJulkinenOrganisaatio } from "@/lib/organisaatio-julkinen";
import { muotoilePaatosKuvaus } from "@/lib/paatos-kuvaus";
import type { haeHanke } from "@/lib/supabase/kyselyt";
import type {
  Hanke,
  HankeJohto,
  HankeKunta,
  HankeKuva,
  HankeMenettely,
  HankeVaihtoehto,
  KenttaLahde,
  KenttaTarkistus,
  Maaraaja,
  Organisaatio,
} from "@/lib/supabase/tietokanta";
import type { HankeAsiakirja, HankeOrganisaatioNakyma } from "@/lib/supabase/kyselyt";
import type { PaatosNakyma } from "@/lib/supabase/tietokanta";

export const AVOIN_DATA_LISENSSI = {
  nimi: "Creative Commons Attribution 4.0 International",
  lyhenne: "CC BY 4.0",
  url: "https://creativecommons.org/licenses/by/4.0/",
  attribution:
    "Datakeskushankkeiden kansallinen rekisteri (www.datakeskusrekisteri.fi)",
} as const;

export const AVOIN_DATA_VERSIO = "1";

type HankeKysely = Awaited<ReturnType<typeof haeHanke>>;

export type AvoinDataLahde = {
  kentta: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lahde_laji: KenttaLahde["lahde_laji"];
  lahde_tyyppi?: string | null;
  viranomais_lahde?: boolean;
  vahvistettu_pvm: string;
  luottamus: KenttaLahde["luottamus"];
  merkitty: KenttaLahde["merkitty"];
  merkitty_pvm: string;
  lainaus: string | null;
  tila: KenttaLahde["tila"];
  korvaava_dokumentti_id: string | null;
};

const VIRANOMAIS_TYYPIT = new Set(["paatos", "viranomaisasiakirja", "rekisteri"]);

function serialisoiLahde(
  lahde: KenttaLahde,
  urlTyypit?: ReadonlyMap<string, string>,
): AvoinDataLahde {
  const tyyppi = urlTyypit?.get(lahde.lahde_url) ?? null;
  return {
    kentta: lahde.kentta,
    lahde_url: lahde.lahde_url,
    lahde_sivu: lahde.lahde_sivu,
    lahde_laji: lahde.lahde_laji,
    lahde_tyyppi: tyyppi,
    viranomais_lahde: tyyppi != null && VIRANOMAIS_TYYPIT.has(tyyppi),
    vahvistettu_pvm: lahde.vahvistettu_pvm,
    luottamus: lahde.luottamus,
    merkitty: lahde.merkitty,
    merkitty_pvm: lahde.merkitty_pvm,
    lainaus: lahde.lainaus,
    tila: lahde.tila,
    korvaava_dokumentti_id: lahde.korvaava_dokumentti_id,
  };
}

function lahteetRiville(
  lahteet: KenttaLahde[],
  urlTyypit?: ReadonlyMap<string, string>,
): AvoinDataLahde[] {
  return lahteet
    .filter((l) => l.tila === "voimassa" || l.tila === "korvattu")
    .map((l) => serialisoiLahde(l, urlTyypit));
}

/** Kenttäkohtainen: onko vähintään yksi viranomaislähde. */
function kentatViranomaislahde(
  lahteet: KenttaLahde[],
  urlTyypit: ReadonlyMap<string, string>,
): Record<string, boolean> {
  const tulos: Record<string, boolean> = {};
  for (const lahde of lahteet) {
    if (!lahdeVoimassaLaskentaan(lahde.tila) || lahde.tekninen_lahde) continue;
    const tyyppi = urlTyypit.get(lahde.lahde_url);
    const on = tyyppi != null && VIRANOMAIS_TYYPIT.has(tyyppi);
    tulos[lahde.kentta] = Boolean(tulos[lahde.kentta]) || on;
  }
  // JSON v1: avain säilyy, mutta huomautus on rekisterin oma tulkinta — ei viranomaislähde.
  tulos.huomautus = false;
  return tulos;
}

function poistaJulkaisu<T extends { julkaistu?: boolean }>(
  rivi: T,
): Omit<T, "julkaistu"> {
  const { julkaistu: _julkaistu, ...loput } = rivi;
  return loput;
}

function serialisoiHanke(
  hanke: Hanke & { toimija?: Pick<Organisaatio, "id" | "nimi"> | null },
) {
  const {
    julkaistu: _j,
    yhdistetty_kohde_id: _y,
    poistettu_perustelu: _p,
    poistettu_pvm: _pp,
    poistettu_kasittelija: _pk,
    toimija,
    ...julkinen
  } = hanke;
  return {
    ...julkinen,
    toimija: toimija ?? null,
  };
}

function serialisoiTarkistus(rivi: KenttaTarkistus) {
  return {
    kentta: rivi.kentta,
    tulos: rivi.tulos,
    vahvistettu_pvm: rivi.vahvistettu_pvm,
    merkitty: rivi.merkitty,
    merkitty_pvm: rivi.merkitty_pvm,
    huomautus: rivi.huomautus,
  };
}

function serialisoiPaatos(
  rivi: PaatosNakyma,
  paatosLahteet: KenttaLahde[] = [],
) {
  const { julkaistu: _j, ...loput } = rivi;
  const lainaus =
    paatosLahteet.find(
      (l) =>
        l.rivi_id === rivi.id &&
        l.kentta === "kuvaus" &&
        lahdeVoimassaLaskentaan(l.tila),
    )?.lainaus ?? null;
  return {
    ...loput,
    kuvaus: muotoilePaatosKuvaus(rivi.kuvaus, lainaus),
  };
}

function serialisoiOrganisaatioRooli(rivi: HankeOrganisaatioNakyma) {
  const { organisaatio, ...muu } = poistaJulkaisu(rivi);
  const konsultti =
    onKonsulttiSivuRooli(rivi.rooli) && organisaatio?.slug
      ? { konsultti_sivu: `/konsultit/${organisaatio.slug}` }
      : {};
  return {
    ...muu,
    organisaatio: organisaatio
      ? serialisoiJulkinenOrganisaatio(organisaatio)
      : null,
    ...konsultti,
  };
}

function serialisoiAsiakirja(rivi: HankeAsiakirja) {
  return poistaJulkaisu(rivi);
}

export type AvoinDataHanke = {
  hanke: ReturnType<typeof serialisoiHanke> & {
    vanhin_vahvistettu_pvm: string | null;
    viimeisin_paatos: PaatosNakyma | null;
  };
  /** Kenttä → onko sillä vähintään yksi viranomaislähde (paatos/viranomaisasiakirja/rekisteri). */
  kentat_viranomaislahde: Record<string, boolean>;
  lahteet: {
    hankkeet: AvoinDataLahde[];
    maaraajat: AvoinDataLahde[];
    kunnat: AvoinDataLahde[];
    menettelyt: AvoinDataLahde[];
    organisaatiot: AvoinDataLahde[];
    johdot: AvoinDataLahde[];
    vaihtoehdot: AvoinDataLahde[];
    kuvat: AvoinDataLahde[];
    asiakirjat: AvoinDataLahde[];
    paatokset: AvoinDataLahde[];
  };
  kunnat: Omit<HankeKunta, "julkaistu">[];
  menettelyt: Omit<HankeMenettely, "julkaistu">[];
  organisaatiot: ReturnType<typeof serialisoiOrganisaatioRooli>[];
  maaraajat: Omit<Maaraaja, "julkaistu">[];
  johdot: Omit<HankeJohto, "julkaistu">[];
  vaihtoehdot: Omit<HankeVaihtoehto, "julkaistu">[];
  kuvat: Omit<HankeKuva, "julkaistu">[];
  asiakirjat: ReturnType<typeof serialisoiAsiakirja>[];
  paatokset: ReturnType<typeof serialisoiPaatos>[];
  tarkistukset: ReturnType<typeof serialisoiTarkistus>[];
  linkit: {
    html: string;
    json: string;
    asiakirjat: string;
  };
};

export function rakennaAvoinDataHanke(
  kysely: HankeKysely,
  juuriUrl: string,
): AvoinDataHanke | null {
  if (!kysely.hanke) return null;
  const polku = `/hankkeet/${kysely.hanke.id}`;
  const urlTyypit = new Map<string, string>(
    kysely.asiakirjat.map((a) => [a.url, a.lahde_tyyppi]),
  );
  const kaikkiHankeLahteet = [
    ...kysely.lahteet,
    ...kysely.maaraajaLahteet,
    ...kysely.kuntaLahteet,
    ...kysely.menettelyLahteet,
    ...kysely.organisaatiorooliLahteet,
    ...kysely.johtoLahteet,
    ...kysely.vaihtoehtoLahteet,
    ...kysely.kuvaLahteet,
    ...kysely.paatosLahteet,
  ];
  return {
    hanke: {
      ...serialisoiHanke(kysely.hanke),
      vanhin_vahvistettu_pvm: kysely.hanke.vanhin_vahvistettu_pvm,
      viimeisin_paatos: kysely.hanke.viimeisin_paatos,
    },
    kentat_viranomaislahde: kentatViranomaislahde(kaikkiHankeLahteet, urlTyypit),
    lahteet: {
      hankkeet: lahteetRiville(kysely.lahteet, urlTyypit),
      maaraajat: lahteetRiville(kysely.maaraajaLahteet, urlTyypit),
      kunnat: lahteetRiville(kysely.kuntaLahteet, urlTyypit),
      menettelyt: lahteetRiville(kysely.menettelyLahteet, urlTyypit),
      organisaatiot: lahteetRiville(kysely.organisaatiorooliLahteet, urlTyypit),
      johdot: lahteetRiville(kysely.johtoLahteet, urlTyypit),
      vaihtoehdot: lahteetRiville(kysely.vaihtoehtoLahteet, urlTyypit),
      kuvat: lahteetRiville(kysely.kuvaLahteet, urlTyypit),
      asiakirjat: lahteetRiville(kysely.asiakirjaLahteet, urlTyypit),
      paatokset: lahteetRiville(kysely.paatosLahteet, urlTyypit),
    },
    kunnat: kysely.kunnat.map(poistaJulkaisu),
    menettelyt: kysely.menettelyt.map(poistaJulkaisu),
    organisaatiot: kysely.organisaatioroolit.map(serialisoiOrganisaatioRooli),
    maaraajat: kysely.maaraajat.map(poistaJulkaisu),
    johdot: kysely.johdot.map(poistaJulkaisu),
    vaihtoehdot: kysely.vaihtoehdot.map(poistaJulkaisu),
    kuvat: kysely.kuvat.map(poistaJulkaisu),
    asiakirjat: kysely.asiakirjat.map(serialisoiAsiakirja),
    paatokset: kysely.paatokset.map((p) =>
      serialisoiPaatos(p, kysely.paatosLahteet),
    ),
    tarkistukset: kysely.tarkistukset.map(serialisoiTarkistus),
    linkit: {
      html: `${juuriUrl}${polku}`,
      json: `${juuriUrl}${polku}/json`,
      asiakirjat: `${juuriUrl}${polku}/asiakirjat`,
    },
  };
}

export type AvoinDataRekisteri = {
  versio: string;
  lisenssi: typeof AVOIN_DATA_LISENSSI;
  paivitetty_pvm: string;
  hankkeita: number;
  linkit: {
    csv: string;
    json: string;
    gpkg: string;
  };
  hankkeet: AvoinDataHanke[];
};

export function rakennaAvoinDataRekisteri(
  hankkeet: AvoinDataHanke[],
  juuriUrl: string,
): AvoinDataRekisteri {
  const paivitetty = hankkeet.reduce((uusin, rivi) => {
    const pvm = rivi.hanke.paivitetty_pvm;
    return pvm > uusin ? pvm : uusin;
  }, "1970-01-01T00:00:00.000Z");

  return {
    versio: AVOIN_DATA_VERSIO,
    lisenssi: AVOIN_DATA_LISENSSI,
    paivitetty_pvm: paivitetty,
    hankkeita: hankkeet.length,
    linkit: {
      json: `${juuriUrl}/data/hankkeet.json`,
      csv: `${juuriUrl}/data/hankkeet.csv`,
      gpkg: `${juuriUrl}/data/hankkeet.gpkg`,
    },
    hankkeet,
  };
}

export function avoinDataJuuriUrl(pyoeyta: string): string {
  try {
    const url = new URL(pyoeyta);
    return url.origin;
  } catch {
    return "https://www.datakeskusrekisteri.fi";
  }
}

export const CSV_SARAKKEET = [
  "id",
  "nimi",
  "kunta",
  "maakunta",
  "vaihe",
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "kaava_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "yva_diaarinumero",
  "kaavatunnus",
  "toimija_nimi",
  "huomautus",
  "sijaintiperustelu",
  "muut_sijainnit",
  "konsultit",
  "paivitetty_pvm",
  "json_url",
] as const;

export function csvSolu(arvo: string | number | null | undefined): string {
  if (arvo == null) return "";
  const teksti = String(arvo);
  if (/[",\n\r]/.test(teksti)) {
    return `"${teksti.replace(/"/g, '""')}"`;
  }
  return teksti;
}

export function csvRivi(solut: (string | number | null | undefined)[]): string {
  return solut.map(csvSolu).join(",");
}

export function hankkeetCsv(hankkeet: AvoinDataHanke[]): string {
  const rivit = [CSV_SARAKKEET.join(",")];
  for (const rivi of hankkeet) {
    const h = rivi.hanke;
    const konsultit = rivi.organisaatiot
      .filter((o) => onKonsulttiSivuRooli(o.rooli))
      .map((o) => o.organisaatio?.nimi)
      .filter((nimi): nimi is string => Boolean(nimi))
      .join("; ");
    rivit.push(
      csvRivi([
        h.id,
        h.nimi,
        h.kunta,
        h.maakunta,
        h.vaihe,
        h.teho_mw,
        h.it_teho_mw,
        h.pinta_ala_ha,
        h.kaava_ala_ha,
        h.sahkonkaytto_twh_a,
        h.generaattorit_lkm,
        h.yva_diaarinumero,
        h.kaavatunnus,
        h.toimija?.nimi ?? null,
        h.huomautus,
        h.sijaintiperustelu,
        h.muut_sijainnit,
        konsultit || null,
        h.paivitetty_pvm,
        rivi.linkit.json,
      ]),
    );
  }
  return `${rivit.join("\n")}\n`;
}

export function avoinDataOtsikot(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Open-Data-License": AVOIN_DATA_LISENSSI.lyhenne,
    Link: `<${AVOIN_DATA_LISENSSI.url}>; rel="license"`,
  };
}

export function avoinDataGpkgOtsikot(): Record<string, string> {
  return {
    "Content-Type": "application/geopackage+sqlite3",
    "Content-Disposition": 'attachment; filename="hankkeet.gpkg"',
    "Cache-Control": "public, max-age=300",
    "X-Open-Data-License": AVOIN_DATA_LISENSSI.lyhenne,
    Link: `<${AVOIN_DATA_LISENSSI.url}>; rel="license"`,
  };
}

export function avoinDataCsvOtsikot(): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="hankkeet.csv"',
    "Cache-Control": "public, max-age=300",
    "X-Open-Data-License": AVOIN_DATA_LISENSSI.lyhenne,
    Link: `<${AVOIN_DATA_LISENSSI.url}>; rel="license"`,
  };
}
