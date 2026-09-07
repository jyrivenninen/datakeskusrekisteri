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
    "Datakeskushankkeiden kansallinen rekisteri (datakeskusrekisteri.vercel.app)",
} as const;

export const AVOIN_DATA_VERSIO = "1";

type HankeKysely = Awaited<ReturnType<typeof haeHanke>>;

export type AvoinDataLahde = {
  kentta: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lahde_laji: KenttaLahde["lahde_laji"];
  vahvistettu_pvm: string;
  luottamus: KenttaLahde["luottamus"];
  merkitty: KenttaLahde["merkitty"];
  merkitty_pvm: string;
  lainaus: string | null;
};

function serialisoiLahde(lahde: KenttaLahde): AvoinDataLahde {
  return {
    kentta: lahde.kentta,
    lahde_url: lahde.lahde_url,
    lahde_sivu: lahde.lahde_sivu,
    lahde_laji: lahde.lahde_laji,
    vahvistettu_pvm: lahde.vahvistettu_pvm,
    luottamus: lahde.luottamus,
    merkitty: lahde.merkitty,
    merkitty_pvm: lahde.merkitty_pvm,
    lainaus: lahde.lainaus,
  };
}

function lahteetRiville(lahteet: KenttaLahde[]): AvoinDataLahde[] {
  return lahteet.map(serialisoiLahde);
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

function serialisoiPaatos(rivi: PaatosNakyma) {
  const { julkaistu: _j, ...loput } = rivi;
  return loput;
}

function serialisoiOrganisaatioRooli(rivi: HankeOrganisaatioNakyma) {
  return poistaJulkaisu(rivi);
}

function serialisoiAsiakirja(rivi: HankeAsiakirja) {
  return poistaJulkaisu(rivi);
}

export type AvoinDataHanke = {
  hanke: ReturnType<typeof serialisoiHanke> & {
    vanhin_vahvistettu_pvm: string | null;
    viimeisin_paatos: PaatosNakyma | null;
  };
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
  return {
    hanke: {
      ...serialisoiHanke(kysely.hanke),
      vanhin_vahvistettu_pvm: kysely.hanke.vanhin_vahvistettu_pvm,
      viimeisin_paatos: kysely.hanke.viimeisin_paatos,
    },
    lahteet: {
      hankkeet: lahteetRiville(kysely.lahteet),
      maaraajat: lahteetRiville(kysely.maaraajaLahteet),
      kunnat: lahteetRiville(kysely.kuntaLahteet),
      menettelyt: lahteetRiville(kysely.menettelyLahteet),
      organisaatiot: lahteetRiville(kysely.organisaatiorooliLahteet),
      johdot: lahteetRiville(kysely.johtoLahteet),
      vaihtoehdot: lahteetRiville(kysely.vaihtoehtoLahteet),
      kuvat: lahteetRiville(kysely.kuvaLahteet),
      asiakirjat: lahteetRiville(kysely.asiakirjaLahteet),
      paatokset: lahteetRiville(kysely.paatosLahteet),
    },
    kunnat: kysely.kunnat.map(poistaJulkaisu),
    menettelyt: kysely.menettelyt.map(poistaJulkaisu),
    organisaatiot: kysely.organisaatioroolit.map(serialisoiOrganisaatioRooli),
    maaraajat: kysely.maaraajat.map(poistaJulkaisu),
    johdot: kysely.johdot.map(poistaJulkaisu),
    vaihtoehdot: kysely.vaihtoehdot.map(poistaJulkaisu),
    kuvat: kysely.kuvat.map(poistaJulkaisu),
    asiakirjat: kysely.asiakirjat.map(serialisoiAsiakirja),
    paatokset: kysely.paatokset.map(serialisoiPaatos),
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
    },
    hankkeet,
  };
}

export function avoinDataJuuriUrl(pyoeyta: string): string {
  try {
    const url = new URL(pyoeyta);
    return url.origin;
  } catch {
    return "https://datakeskusrekisteri.vercel.app";
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
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "yva_diaarinumero",
  "kaavatunnus",
  "toimija_nimi",
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
        h.sahkonkaytto_twh_a,
        h.generaattorit_lkm,
        h.yva_diaarinumero,
        h.kaavatunnus,
        h.toimija?.nimi ?? null,
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
    "Cache-Control": "public, max-age=60",
    "X-Open-Data-License": AVOIN_DATA_LISENSSI.lyhenne,
    Link: `<${AVOIN_DATA_LISENSSI.url}>; rel="license"`,
  };
}

export function avoinDataCsvOtsikot(): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="hankkeet.csv"',
    "Cache-Control": "public, max-age=60",
    "X-Open-Data-License": AVOIN_DATA_LISENSSI.lyhenne,
    Link: `<${AVOIN_DATA_LISENSSI.url}>; rel="license"`,
  };
}
