/**
 * Ylläpidon uuden hankkeen JSON-tuonti: skeema, validointi ja muunnos
 * muutosehdotuksen sisällöksi. Ei kirjoita tietokantaan.
 */

import { lahdeUrlKieltoViesti } from "@/lib/lahde-url-kielto";
import { LAHDE_TYYPIT, type LahdeTyyppi } from "@/lib/lahde-metatiedot";
import {
  hylkaaHenkilöOrganisaatioViesti,
  onOrganisaatioNimi,
} from "@/lib/organisaatio-nimi";
import {
  HANKE_ORGANISAATIO_ROOLIT,
  HANKE_VAIHEET,
  SIJAINTI_ALUE_TYYPIT,
  type HankeVaihe,
  type LahdeLaji,
  type SijaintiAlueTyyppi,
} from "@/lib/supabase/tietokanta";
import type { EhdotettuKentta, EhdotusSisalto } from "@/lib/ehdotus";

export type UusiHankeTuontiLahde = {
  url: string;
  lahde_tyyppi: string;
  julkaisija?: string;
  asiakirjan_nimi?: string;
  paivays?: string;
  sivu?: string;
  lainaus: string;
};

export type UusiHankeTuontiKentta = {
  kentta: string;
  arvo: string;
  yksikko?: string;
  lahteet: UusiHankeTuontiLahde[];
};

export type UusiHankeTuontiRooli = {
  rooli: string;
  organisaatio: string;
  lahde_url: string;
  lainaus: string;
};

export type UusiHankeTuontiAsiakirja = {
  url: string;
  lahde_tyyppi: string;
  julkaisija?: string;
  otsikko: string;
  paivays?: string;
};

export type UusiHankeTuontiToimija = {
  nimi: string;
  y_tunnus?: string;
  lahde_url: string;
  /** Sama pakollinen lähdetyyppi kuin kenttien lähteillä (dokumentit.lahde_tyyppi). */
  lahde_tyyppi: string;
  lainaus: string;
};

/** Grok / ylläpito -tuonnin hankkeen JSON. */
export type UusiHankeTuonti = {
  nimi: string;
  kunta: string;
  vaihe: string;
  toimija?: UusiHankeTuontiToimija | null;
  kentat: UusiHankeTuontiKentta[];
  roolit?: UusiHankeTuontiRooli[];
  asiakirjat?: UusiHankeTuontiAsiakirja[];
  huomautus?: string;
  ilmoituksen_id?: string;
};

export type TuontiVirhe = {
  polku: string;
  viesti: string;
};

export type TuontiVaroitus = {
  polku: string;
  viesti: string;
};

export type TuontiValidointi = {
  ok: boolean;
  virheet: TuontiVirhe[];
  varoitukset: TuontiVaroitus[];
  tuonti: UusiHankeTuonti | null;
  /** Kaikki lähteet media tai hankkeen_oma → ei suoraan julkaisuun. */
  vainHeikotLahteet: boolean;
};

/** Kentat-taulukon sallitut `kentta`-nimet (ylläpidon tuonti-JSON). */
export const UUSI_HANKE_TUONTI_KENTAT = [
  "nimi",
  "kunta",
  "maakunta",
  "vaihe",
  "toimija_nimi",
  "yva_diaarinumero",
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "kaava_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
  "generaattori_yksikkoteho_mwe",
  "diesel_vuosikulutus_maara",
  "varavoima_paastot_t_co2e",
  "polttoainevarasto_maara",
  "kaavatunnus",
  "kortteli",
  "sijainti_lat",
  "sijainti_lon",
  "sijainti_alue_tyyppi",
  "sijaintiperustelu",
  "muut_sijainnit",
  "kiinteistotunnus",
  "huomautus",
] as const;

const SALLITUT_KENTAT = new Set<string>(UUSI_HANKE_TUONTI_KENTAT);

function sallitutKentatViesti(): string {
  return UUSI_HANKE_TUONTI_KENTAT.join(", ");
}

const ORGANISAATIO_KENTAT = new Set(["toimija_nimi"]);

const ROOLIT = new Set<string>(HANKE_ORGANISAATIO_ROOLIT);

function onHttpsUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function onLahdeTyyppi(v: string): v is LahdeTyyppi {
  return (LAHDE_TYYPIT as readonly string[]).includes(v);
}

/** Logo ilman nimeä tai hakutulosote eivät kelpaa organisaation / laatijan lähteeksi. */
export function onKelvotonLaatijaLahde(url: string, lainaus: string): string | null {
  const u = url.toLowerCase();
  const l = lainaus.toLowerCase();
  if (
    /google\.[^/]+\/search|bing\.[^/]+\/search|duckduckgo\.com\/\?|yahoo\.[^/]+\/search/.test(
      u,
    )
  ) {
    return "Hakutulosote ei kelpaa lähteeksi.";
  }
  if (
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) ||
    /\/logo[s]?(\/|\.|$)/i.test(url) ||
    /\blogo\b/.test(l)
  ) {
    if (!/[a-zåäö]{3,}/i.test(lainaus.replace(/\blogo\b/gi, "").trim())) {
      return "Logo ilman kirjoitettua nimeä ei kelpaa lähteeksi.";
    }
  }
  return null;
}

export function parsiSivuNumeroksi(sivu: string | undefined): number | null {
  if (!sivu?.trim()) return null;
  const m = sivu.trim().match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function lahdeLajiSivusta(sivu: string | undefined): LahdeLaji {
  return parsiSivuNumeroksi(sivu) != null ? "dokumentti" : "html";
}

export function sitovuusLahdeTyypista(tyyppi: LahdeTyyppi): string {
  if (tyyppi === "paatos") return "sitova";
  if (tyyppi === "viranomaisasiakirja" || tyyppi === "rekisteri") return "virallinen";
  return "epavirallinen";
}

function parsiLahde(raaka: unknown, polku: string, virheet: TuontiVirhe[]): UusiHankeTuontiLahde | null {
  if (!raaka || typeof raaka !== "object") {
    virheet.push({ polku, viesti: "Lähde puuttuu tai on väärää muotoa." });
    return null;
  }
  const o = raaka as Record<string, unknown>;
  const url = trimStr(o.url);
  const lahde_tyyppi = trimStr(o.lahde_tyyppi);
  const lainaus = trimStr(o.lainaus);
  if (!url) virheet.push({ polku: `${polku}.url`, viesti: "Lähde-URL puuttuu." });
  else if (!onHttpsUrl(url)) {
    virheet.push({
      polku: `${polku}.url`,
      viesti: "Lähde-URL:n pitää alkaa http:// tai https://.",
    });
  } else {
    const kielto = lahdeUrlKieltoViesti(url);
    if (kielto) virheet.push({ polku: `${polku}.url`, viesti: kielto });
  }
  if (!lahde_tyyppi) {
    virheet.push({ polku: `${polku}.lahde_tyyppi`, viesti: "Lähdetyyppi puuttuu." });
  } else if (!onLahdeTyyppi(lahde_tyyppi)) {
    virheet.push({
      polku: `${polku}.lahde_tyyppi`,
      viesti: `Lähdetyyppi ei ole sallittu (${LAHDE_TYYPIT.join(", ")}).`,
    });
  }
  if (!lainaus) {
    virheet.push({
      polku: `${polku}.lainaus`,
      viesti: "Lainaus puuttuu — kenttää ilman lainausta ei hyväksytä.",
    });
  }
  return {
    url,
    lahde_tyyppi,
    julkaisija: trimStr(o.julkaisija) || undefined,
    asiakirjan_nimi: trimStr(o.asiakirjan_nimi) || undefined,
    paivays: trimStr(o.paivays) || undefined,
    sivu: trimStr(o.sivu) || undefined,
    lainaus,
  };
}

/** Parsii raa'an JSON-objektin; kerää kaikki virheet. */
export function parsiJaValidoiUusiHankeTuonti(raaka: unknown): TuontiValidointi {
  const virheet: TuontiVirhe[] = [];
  const varoitukset: TuontiVaroitus[] = [];

  if (raaka == null || typeof raaka !== "object" || Array.isArray(raaka)) {
    return {
      ok: false,
      virheet: [{ polku: "", viesti: "JSON:n juuren pitää olla objekti." }],
      varoitukset: [],
      tuonti: null,
      vainHeikotLahteet: false,
    };
  }

  const juuri = raaka as Record<string, unknown>;
  const nimi = trimStr(juuri.nimi);
  const kunta = trimStr(juuri.kunta);
  const vaihe = trimStr(juuri.vaihe);
  const huomautus = trimStr(juuri.huomautus);
  const ilmoituksen_id = trimStr(juuri.ilmoituksen_id) || undefined;

  if (!nimi) virheet.push({ polku: "nimi", viesti: "Nimi on pakollinen." });
  if (!kunta) virheet.push({ polku: "kunta", viesti: "Kunta on pakollinen." });
  if (!vaihe) virheet.push({ polku: "vaihe", viesti: "Vaihe on pakollinen." });
  else if (!(HANKE_VAIHEET as readonly string[]).includes(vaihe)) {
    virheet.push({
      polku: "vaihe",
      viesti: `Vaihe ei ole sallittu (${HANKE_VAIHEET.join(", ")}).`,
    });
  }

  let toimija: UusiHankeTuontiToimija | null = null;
  if (juuri.toimija != null) {
    if (typeof juuri.toimija !== "object" || Array.isArray(juuri.toimija)) {
      virheet.push({ polku: "toimija", viesti: "toimija:n pitää olla objekti." });
    } else {
      const t = juuri.toimija as Record<string, unknown>;
      const tnimi = trimStr(t.nimi);
      const turl = trimStr(t.lahde_url);
      const ttyyppi = trimStr(t.lahde_tyyppi);
      const tlainaus = trimStr(t.lainaus);
      if (!tnimi) virheet.push({ polku: "toimija.nimi", viesti: "Toimijan nimi puuttuu." });
      else if (!onOrganisaatioNimi(tnimi)) {
        virheet.push({
          polku: "toimija.nimi",
          viesti: hylkaaHenkilöOrganisaatioViesti(tnimi),
        });
      }
      if (!turl) {
        virheet.push({ polku: "toimija.lahde_url", viesti: "Toimijan lähde-URL puuttuu." });
      } else if (!onHttpsUrl(turl)) {
        virheet.push({
          polku: "toimija.lahde_url",
          viesti: "Toimijan lähde-URL:n pitää alkaa http:// tai https://.",
        });
      }
      if (!ttyyppi) {
        virheet.push({
          polku: "toimija.lahde_tyyppi",
          viesti: "Toimijan lähdetyyppi puuttuu.",
        });
      } else if (!onLahdeTyyppi(ttyyppi)) {
        virheet.push({
          polku: "toimija.lahde_tyyppi",
          viesti: `Toimijan lähdetyyppi ei ole sallittu (${LAHDE_TYYPIT.join(", ")}).`,
        });
      }
      if (!tlainaus) {
        virheet.push({ polku: "toimija.lainaus", viesti: "Toimijan lainaus puuttuu." });
      }
      if (tnimi && turl && tlainaus) {
        const kelvoton = onKelvotonLaatijaLahde(turl, tlainaus);
        if (kelvoton) {
          virheet.push({ polku: "toimija.lahde_url", viesti: kelvoton });
        }
      }
      toimija = {
        nimi: tnimi,
        y_tunnus: trimStr(t.y_tunnus) || undefined,
        lahde_url: turl,
        lahde_tyyppi: ttyyppi,
        lainaus: tlainaus,
      };
    }
  }

  const kentatRaaka = juuri.kentat;
  const kentat: UusiHankeTuontiKentta[] = [];
  if (!Array.isArray(kentatRaaka)) {
    virheet.push({ polku: "kentat", viesti: "kentat:n pitää olla taulukko." });
  } else {
    kentatRaaka.forEach((rivi, i) => {
      const polku = `kentat[${i}]`;
      if (!rivi || typeof rivi !== "object") {
        virheet.push({ polku, viesti: "Kenttärivi on väärää muotoa." });
        return;
      }
      const k = rivi as Record<string, unknown>;
      const kentta = trimStr(k.kentta);
      const arvo = trimStr(k.arvo);
      if (!kentta) {
        virheet.push({ polku: `${polku}.kentta`, viesti: "Kentän nimi puuttuu." });
        return;
      }
      if (!SALLITUT_KENTAT.has(kentta)) {
        virheet.push({
          polku: `${polku}.kentta`,
          viesti: `Tuntematon kenttä «${kentta}». Sallitut: ${sallitutKentatViesti()}.`,
        });
        return;
      }
      if (!arvo) {
        virheet.push({
          polku: `${polku}.arvo`,
          viesti: `Kenttä «${kentta}» on listassa ilman arvoa — jätä rivi pois tai anna arvo.`,
        });
        return;
      }
      if (kentta === "vaihe" && !(HANKE_VAIHEET as readonly string[]).includes(arvo)) {
        virheet.push({ polku: `${polku}.arvo`, viesti: "Vaiheen arvo ei ole sallittu." });
      }
      if (
        kentta === "sijainti_alue_tyyppi" &&
        !(SIJAINTI_ALUE_TYYPIT as readonly string[]).includes(arvo)
      ) {
        virheet.push({
          polku: `${polku}.arvo`,
          viesti: `sijainti_alue_tyyppi ∈ ${SIJAINTI_ALUE_TYYPIT.join(", ")}.`,
        });
      }
      if (ORGANISAATIO_KENTAT.has(kentta) && !onOrganisaatioNimi(arvo)) {
        virheet.push({
          polku: `${polku}.arvo`,
          viesti: hylkaaHenkilöOrganisaatioViesti(arvo),
        });
      }

      const lahteetRaaka = k.lahteet;
      const lahteet: UusiHankeTuontiLahde[] = [];
      if (!Array.isArray(lahteetRaaka) || lahteetRaaka.length === 0) {
        virheet.push({
          polku: `${polku}.lahteet`,
          viesti: `Kentällä «${kentta}» ei ole lähdettä — arvoa ei pudoteta hiljaa.`,
        });
      } else {
        lahteetRaaka.forEach((l, j) => {
          const pl = parsiLahde(l, `${polku}.lahteet[${j}]`, virheet);
          if (pl) {
            if (ORGANISAATIO_KENTAT.has(kentta) || kentta === "nimi") {
              const kelvoton = onKelvotonLaatijaLahde(pl.url, pl.lainaus);
              if (kelvoton) {
                virheet.push({
                  polku: `${polku}.lahteet[${j}]`,
                  viesti: kelvoton,
                });
              }
            }
            lahteet.push(pl);
          }
        });
      }

      kentat.push({
        kentta,
        arvo,
        yksikko: trimStr(k.yksikko) || undefined,
        lahteet,
      });
    });
  }

  const roolit: UusiHankeTuontiRooli[] = [];
  if (juuri.roolit != null) {
    if (!Array.isArray(juuri.roolit)) {
      virheet.push({ polku: "roolit", viesti: "roolit:n pitää olla taulukko." });
    } else {
      juuri.roolit.forEach((rivi, i) => {
        const polku = `roolit[${i}]`;
        if (!rivi || typeof rivi !== "object") {
          virheet.push({ polku, viesti: "Roolirivi on väärää muotoa." });
          return;
        }
        const r = rivi as Record<string, unknown>;
        const rooli = trimStr(r.rooli);
        const organisaatio = trimStr(r.organisaatio);
        const lahde_url = trimStr(r.lahde_url);
        const lainaus = trimStr(r.lainaus);
        if (!rooli) virheet.push({ polku: `${polku}.rooli`, viesti: "Rooli puuttuu." });
        else if (!ROOLIT.has(rooli)) {
          virheet.push({
            polku: `${polku}.rooli`,
            viesti: `Tuntematon rooli «${rooli}».`,
          });
        }
        if (!organisaatio) {
          virheet.push({
            polku: `${polku}.organisaatio`,
            viesti: "Organisaation nimi puuttuu.",
          });
        } else if (!onOrganisaatioNimi(organisaatio)) {
          virheet.push({
            polku: `${polku}.organisaatio`,
            viesti: hylkaaHenkilöOrganisaatioViesti(organisaatio),
          });
        }
        if (!lahde_url) {
          virheet.push({ polku: `${polku}.lahde_url`, viesti: "Roolin lähde-URL puuttuu." });
        } else if (!onHttpsUrl(lahde_url)) {
          virheet.push({
            polku: `${polku}.lahde_url`,
            viesti: "Roolin lähde-URL:n pitää alkaa http:// tai https://.",
          });
        } else {
          const kelvoton = onKelvotonLaatijaLahde(lahde_url, lainaus);
          if (kelvoton) {
            virheet.push({ polku: `${polku}.lahde_url`, viesti: kelvoton });
          }
        }
        if (!lainaus) {
          virheet.push({ polku: `${polku}.lainaus`, viesti: "Roolin lainaus puuttuu." });
        }
        roolit.push({ rooli, organisaatio, lahde_url, lainaus });
      });
    }
  }

  const asiakirjat: UusiHankeTuontiAsiakirja[] = [];
  if (juuri.asiakirjat != null) {
    if (!Array.isArray(juuri.asiakirjat)) {
      virheet.push({ polku: "asiakirjat", viesti: "asiakirjat:n pitää olla taulukko." });
    } else {
      juuri.asiakirjat.forEach((rivi, i) => {
        const polku = `asiakirjat[${i}]`;
        if (!rivi || typeof rivi !== "object") {
          virheet.push({ polku, viesti: "Asiakirjarivi on väärää muotoa." });
          return;
        }
        const a = rivi as Record<string, unknown>;
        const url = trimStr(a.url);
        const lahde_tyyppi = trimStr(a.lahde_tyyppi);
        const otsikko = trimStr(a.otsikko);
        if (!url) virheet.push({ polku: `${polku}.url`, viesti: "Asiakirjan URL puuttuu." });
        else if (!onHttpsUrl(url)) {
          virheet.push({
            polku: `${polku}.url`,
            viesti: "Asiakirjan URL:n pitää alkaa http:// tai https://.",
          });
        }
        if (!lahde_tyyppi) {
          virheet.push({
            polku: `${polku}.lahde_tyyppi`,
            viesti: "Asiakirjan lähdetyyppi puuttuu.",
          });
        } else if (!onLahdeTyyppi(lahde_tyyppi)) {
          virheet.push({
            polku: `${polku}.lahde_tyyppi`,
            viesti: "Asiakirjan lähdetyyppi ei ole sallittu.",
          });
        }
        if (!otsikko) {
          virheet.push({ polku: `${polku}.otsikko`, viesti: "Asiakirjan otsikko puuttuu." });
        }
        asiakirjat.push({
          url,
          lahde_tyyppi,
          julkaisija: trimStr(a.julkaisija) || undefined,
          otsikko,
          paivays: trimStr(a.paivays) || undefined,
        });
      });
    }
  }

  // Pakolliset kentät myös kentat-taulukossa tai juuressa
  const kenttaMap = new Map(kentat.map((k) => [k.kentta, k]));
  if (nimi && !kenttaMap.has("nimi")) {
    // Juuren nimi kelpaa, mutta tarvitsee lähteen — jos ei kentissä, virhe
    virheet.push({
      polku: "kentat",
      viesti:
        "Kenttä «nimi» puuttuu kentat-taulukosta (juuren nimi ei riitä ilman lähdettä).",
    });
  }
  if (kunta && !kenttaMap.has("kunta")) {
    virheet.push({
      polku: "kentat",
      viesti: "Kenttä «kunta» puuttuu kentat-taulukosta.",
    });
  }
  if (vaihe && !kenttaMap.has("vaihe")) {
    virheet.push({
      polku: "kentat",
      viesti: "Kenttä «vaihe» puuttuu kentat-taulukosta.",
    });
  }

  // sijainti_alue_tyyppi pakollinen
  if (!kenttaMap.has("sijainti_alue_tyyppi")) {
    virheet.push({
      polku: "kentat",
      viesti:
        "sijainti_alue_tyyppi on pakollinen (kaava_alue | tontti | arvio). Jos koordinaatit tulevat paikan nimestä, käytä arvoa «arvio».",
    });
  }

  // teho_mw / it_teho_mw
  const teho = kenttaMap.get("teho_mw");
  const itTeho = kenttaMap.get("it_teho_mw");
  const monitoimi =
    /monitoimi/i.test(huomautus) ||
    /monitoimi/i.test(kenttaMap.get("huomautus")?.arvo ?? "");

  if (monitoimi) {
    if (teho) {
      virheet.push({
        polku: "kentat",
        viesti:
          "Monitoimihankkeella teho_mw jätetään tyhjäksi; kirjaa selite huomautukseen.",
      });
    }
    if (!huomautus && !kenttaMap.has("huomautus")) {
      virheet.push({
        polku: "huomautus",
        viesti: "Monitoimihankkeella huomautus on pakollinen.",
      });
    }
  } else if (teho && itTeho) {
    const tehoUrl = teho.lahteet[0]?.url ?? "";
    const itUrl = itTeho.lahteet[0]?.url ?? "";
    const tehoLainaus = (teho.lahteet[0]?.lainaus ?? "").toLowerCase();
    const itLainaus = (itTeho.lahteet[0]?.lainaus ?? "").toLowerCase();
    const samaLahde = tehoUrl && tehoUrl === itUrl;
    const erottelee =
      (/it[\s-]?teho|it[\s-]?load|it[\s-]?capacity|tietotekniikka/i.test(itLainaus) &&
        /teho|power|mw(?!\s*it)/i.test(tehoLainaus)) ||
      tehoLainaus !== itLainaus;
    if (samaLahde && !erottelee) {
      virheet.push({
        polku: "kentat",
        viesti:
          "teho_mw ja it_teho_mw: jos lähde ei erottele suuretta, täytä vain toinen kenttä.",
      });
    }
  }

  // Kaikki lähdetyypit
  const kaikkiTyypit: string[] = [];
  for (const k of kentat) {
    for (const l of k.lahteet) {
      if (l.lahde_tyyppi) kaikkiTyypit.push(l.lahde_tyyppi);
    }
  }
  for (const a of asiakirjat) {
    if (a.lahde_tyyppi) kaikkiTyypit.push(a.lahde_tyyppi);
  }
  if (toimija?.lahde_tyyppi) kaikkiTyypit.push(toimija.lahde_tyyppi);

  const heikot = new Set(["media", "hankkeen_oma"]);
  const vainHeikotLahteet =
    kaikkiTyypit.length > 0 &&
    kaikkiTyypit.every((t) => heikot.has(t));

  if (vainHeikotLahteet) {
    varoitukset.push({
      polku: "lahteet",
      viesti:
        "Kaikki lähteet ovat tyyppiä media tai hankkeen_oma — hanke ei mene suoraan julkaistuksi (hankevinkki / odottaa).",
    });
  }

  // Juuren nimi/kunta/vaihe vs kentät
  if (kenttaMap.has("nimi") && nimi && kenttaMap.get("nimi")!.arvo !== nimi) {
    varoitukset.push({
      polku: "nimi",
      viesti: "Juuren nimi ja kentat[].nimi eroavat — käytetään kentät-taulukon arvoa.",
    });
  }

  const tuonti: UusiHankeTuonti = {
    nimi: kenttaMap.get("nimi")?.arvo || nimi,
    kunta: kenttaMap.get("kunta")?.arvo || kunta,
    vaihe: (kenttaMap.get("vaihe")?.arvo || vaihe) as HankeVaihe | string,
    toimija,
    kentat,
    roolit,
    asiakirjat,
    huomautus: huomautus || kenttaMap.get("huomautus")?.arvo || undefined,
    ilmoituksen_id,
  };

  return {
    ok: virheet.length === 0,
    virheet,
    varoitukset,
    tuonti: virheet.length === 0 ? tuonti : tuonti,
    vainHeikotLahteet,
  };
}

export function parsiTuontiJsonTekstista(teksti: string): TuontiValidointi {
  let raaka: unknown;
  try {
    raaka = JSON.parse(teksti);
  } catch (e) {
    return {
      ok: false,
      virheet: [
        {
          polku: "",
          viesti: `JSON ei kelpaa: ${e instanceof Error ? e.message : "parse-virhe"}`,
        },
      ],
      varoitukset: [],
      tuonti: null,
      vainHeikotLahteet: false,
    };
  }
  return parsiJaValidoiUusiHankeTuonti(raaka);
}

function lahdeEhdotukseksi(lahde: UusiHankeTuontiLahde): {
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string;
  luottamus: "vahvistettu";
  lahde_laji: ReturnType<typeof lahdeLajiSivusta>;
} {
  return {
    lahde_url: lahde.url,
    lahde_sivu: parsiSivuNumeroksi(lahde.sivu),
    lainaus: lahde.lainaus,
    luottamus: "vahvistettu",
    lahde_laji: lahdeLajiSivusta(lahde.sivu),
  };
}

/**
 * Muuntaa validoidun tuonnin muutosehdotuksen kentiksi.
 * Kaikki lähteet kirjoitetaan: ensimmäinen kentän päälähteeksi,
 * loput `lisalahteet`-taulukkoon (hyväksyntä tallentaa kaikki).
 */
export function tuontiEhdotusSisalloksi(tuonti: UusiHankeTuonti): EhdotusSisalto {
  const kentat: Record<string, EhdotettuKentta> = {};

  for (const rivi of tuonti.kentat) {
    if (rivi.kentta === "huomautus" || rivi.kentta === "kiinteistotunnus") {
      // huomautus menee rivin huomautus-kenttään; kiinteistötunnus ei ole hankekenttä DB:ssä vielä
      continue;
    }
    if (rivi.lahteet.length === 0) continue;
    const [ensi, ...loput] = rivi.lahteet;
    const paa = lahdeEhdotukseksi(ensi!);
    kentat[rivi.kentta] = {
      arvo: rivi.arvo,
      ...paa,
      lisalahteet:
        loput.length > 0
          ? loput.map((l) => {
              const x = lahdeEhdotukseksi(l);
              return {
                lahde_url: x.lahde_url,
                lahde_sivu: x.lahde_sivu,
                lainaus: x.lainaus,
                luottamus: x.luottamus,
                lahde_laji: x.lahde_laji,
              };
            })
          : undefined,
    };
  }

  if (tuonti.toimija && !kentat.toimija_nimi) {
    kentat.toimija_nimi = {
      arvo: tuonti.toimija.nimi,
      lahde_url: tuonti.toimija.lahde_url,
      lahde_sivu: null,
      lainaus: tuonti.toimija.lainaus,
      luottamus: "vahvistettu",
      lahde_laji: "html",
    };
  }

  return { kentat };
}

/** Kaikki tuonnin lähde-URL:t lähdetyypeineen (kentät, toimija, asiakirjat). */
export function tuonninLahdeTyypit(
  tuonti: UusiHankeTuonti,
): Array<{ url: string; lahde_tyyppi: LahdeTyyppi; otsikko?: string }> {
  const rivit: Array<{ url: string; lahde_tyyppi: LahdeTyyppi; otsikko?: string }> = [];
  const nayhty = new Set<string>();
  const lisaa = (url: string, tyyppi: string, otsikko?: string) => {
    const u = url.trim();
    if (!u || !onLahdeTyyppi(tyyppi) || nayhty.has(u)) return;
    nayhty.add(u);
    rivit.push({ url: u, lahde_tyyppi: tyyppi, otsikko });
  };
  for (const k of tuonti.kentat) {
    for (const l of k.lahteet) {
      lisaa(l.url, l.lahde_tyyppi, l.asiakirjan_nimi);
    }
  }
  if (tuonti.toimija) {
    lisaa(tuonti.toimija.lahde_url, tuonti.toimija.lahde_tyyppi);
  }
  for (const a of tuonti.asiakirjat ?? []) {
    lisaa(a.url, a.lahde_tyyppi, a.otsikko);
  }
  return rivit;
}

export function onSijaintiAlueTyyppi(v: string): v is SijaintiAlueTyyppi {
  return (SIJAINTI_ALUE_TYYPIT as readonly string[]).includes(v);
}
