import { HANKE_VAIHEET, type HankeVaihe, type LahdeLaji, type Luottamus } from "@/lib/supabase/tietokanta";

export type EhdotettuKentta = {
  arvo: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string | null;
  luottamus?: Luottamus;
  lahde_laji?: LahdeLaji;
};

export type EhdotettuKuva = {
  kuva_url: string;
  kuvateksti: string;
  kuvaaja: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string | null;
  luottamus?: Luottamus;
};

export type EhdotusSisalto = {
  kentat: Record<string, EhdotettuKentta>;
  vaihtoehdot?: Record<string, Record<string, EhdotettuKentta>>;
  kuvat?: EhdotettuKuva[];
  linkki?: {
    url: string;
    http_tila: number | null;
    vaste_ms: number;
    virhe: string | null;
    taulu: string;
    rivi_id: string;
    kentta: string;
  };
  ryhti?: {
    kokoelma: string;
    kokoelma_nimi: string;
    kohde_id: string;
    nimi: string | null;
    kuvaus: string | null;
    kunta_tunnukset: string[];
    kaavatunnus: string | null;
    elinkaari: string | null;
    hakuehto: string;
    muuttunut: boolean;
  };
  ytj?: {
    organisaatio_id: string;
    y_tunnus: string;
    rekisterin_nimi: string;
    ytj_nimi: string | null;
    rekisterointi_pvm: string | null;
    toimiala: string | null;
    kotipaikka: string | null;
    muuttunut: boolean;
    ei_loydy: boolean;
    ehdota_tunnus?: boolean;
  };
  dokumentti?: {
    dokumentti_id: string;
    otsikko: string;
    vanha_tiiviste: string | null;
    uusi_tiiviste: string;
    merkkimaara: number;
    muoto: string | null;
  };
  ristiriita?: {
    saanto: string;
    avain: string;
    ei_uudelleen?: boolean;
    ei_uudelleen_perustelu?: string;
  };
  mml?: {
    nimi: string | null;
    kunta: string | null;
    kiinteistotunnus: string | null;
    muuttunut: boolean;
    ei_loydy: boolean;
  };
  tarkistus?: {
    taulu: "hankkeet";
    rivi_id: string;
    kentta: string;
    tulos: "ei_julkista_lahdetta";
    huomautus?: string | null;
  };
  paatos?: {
    kuvaus: string;
    pvm: string;
    paattava_organisaatio_id?: string | null;
    paattava_organisaatio_nimi?: string | null;
    dokumentti_id?: string | null;
    menettely_id?: string | null;
    lahteet: Array<{
      kentta: string;
      lahde_url: string;
      lahde_sivu: number | null;
      lahde_laji?: LahdeLaji;
      vahvistettu_pvm: string;
      luottamus: Luottamus;
      lainaus: string | null;
      merkitty: "koneen_ehdottama" | "ihmisen_vahvistama";
    }>;
  };
};

const NUMEERISET = new Set([
  "it_teho_mw",
  "teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
  "sijainti_lat",
  "sijainti_lon",
]);

export const LOMAKE_KENTAT = [
  "nimi",
  "kunta",
  "maakunta",
  "vaihe",
  "toimija_nimi",
  "yva_diaarinumero",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
] as const;

/** Hankesivun kortista päivitettävät hanketason kentät. */
export const PAIVITETTAVAT_HANKE_KENTAT = [
  "nimi",
  "kunta",
  "maakunta",
  "vaihe",
  "toimija_nimi",
  "yva_diaarinumero",
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
  "kaavatunnus",
  "kortteli",
  "sijainti_lat",
  "sijainti_lon",
  "sijainti_alue_tyyppi",
] as const;

export type PaivitettavaHankeKentta = (typeof PAIVITETTAVAT_HANKE_KENTAT)[number];

export function onPaivitettavaHankeKentta(
  kentta: string,
): kentta is PaivitettavaHankeKentta {
  return (PAIVITETTAVAT_HANKE_KENTAT as readonly string[]).includes(kentta);
}

/** Kortin tunniste → lomakkeen kenttänimi. */
export function lomakeKenttaKortista(korttiKentta: string): string | null {
  if (korttiKentta === "toimija_organisaatio_id") return "toimija_nimi";
  if (korttiKentta === "sijainti") return "sijainti_lat";
  if (onPaivitettavaHankeKentta(korttiKentta)) return korttiKentta;
  return null;
}

/** Tyhjän hankekentän tarkistus ilman julkista lähdettä. */
export function tarkistusKenttaLomakkeesta(kentta: string): string | null {
  if (kentta === "toimija_nimi") return "toimija_organisaatio_id";
  if (
    kentta === "sijainti_lat" ||
    kentta === "sijainti_lon" ||
    kentta === "sijainti_alue_tyyppi"
  ) {
    return "sijainti";
  }
  if (["nimi", "kunta", "vaihe"].includes(kentta)) return null;
  if (onPaivitettavaHankeKentta(kentta)) return kentta;
  return null;
}

function onHttpsUrl(arvo: string): boolean {
  return /^https?:\/\//.test(arvo);
}

function sivunumero(lahdeSivu: string): { sivu: number | null; virhe: string | null } {
  if (lahdeSivu.trim() === "") return { sivu: null, virhe: null };
  const sivu = Number(lahdeSivu);
  if (!Number.isInteger(sivu) || sivu < 1) {
    return { sivu: null, virhe: "Sivunumero ei ole kelvollinen." };
  }
  return { sivu, virhe: null };
}

export type IlmoitusKentanLahde = {
  lahde_url: string;
  lahde_sivu: string;
  lainaus: string;
  luottamus: string;
};

/** Ilmoituksen luottamusvalinnat. Ristiriita käsitellään jonossa, ei tällä lomakkeella. */
export const ILMOITUS_LUOTTAMUKSET = ["vahvistettu", "epavarma"] as const;

export function rakennaSisalto(
  kentat: Record<string, string>,
  lahdeUrl: string,
  lahdeSivu: string,
  lainaus: string,
): { sisalto: EhdotusSisalto; virhe: string | null } {
  if (!onHttpsUrl(lahdeUrl)) {
    return { sisalto: { kentat: {} }, virhe: "Lähteen osoitteen pitää alkaa http:// tai https://." };
  }
  const { sivu, virhe: sivuVirhe } = sivunumero(lahdeSivu);
  if (sivuVirhe) return { sisalto: { kentat: {} }, virhe: sivuVirhe };

  const tulos: Record<string, EhdotettuKentta> = {};
  for (const [kentta, raaka] of Object.entries(kentat)) {
    const arvo = raaka.trim();
    if (!arvo) continue;
    if (kentta === "vaihe" && !(HANKE_VAIHEET as readonly string[]).includes(arvo)) {
      return { sisalto: { kentat: {} }, virhe: "Vaihe ei ole sallittu." };
    }
    tulos[kentta] = {
      arvo,
      lahde_url: lahdeUrl.trim(),
      lahde_sivu: sivu,
      lainaus: lainaus.trim() || null,
    };
  }

  return { sisalto: { kentat: tulos }, virhe: null };
}

export function rakennaIlmoitusSisalto(
  kentat: Record<string, string>,
  yhteinenLahdeUrl: string,
  yhteinenLahdeSivu: string,
  yhteinenLainaus: string,
  kohdat: Record<string, IlmoitusKentanLahde>,
): { sisalto: EhdotusSisalto; virhe: string | null } {
  const yhteinenUrl = yhteinenLahdeUrl.trim();
  if (yhteinenUrl && !onHttpsUrl(yhteinenUrl)) {
    return {
      sisalto: { kentat: {} },
      virhe: "Yhteisen lähteen osoitteen pitää alkaa http:// tai https://.",
    };
  }
  const yhteinenSivu = sivunumero(yhteinenLahdeSivu);
  if (yhteinenSivu.virhe) return { sisalto: { kentat: {} }, virhe: yhteinenSivu.virhe };

  const tulos: Record<string, EhdotettuKentta> = {};
  for (const [kentta, raaka] of Object.entries(kentat)) {
    const arvo = raaka.trim();
    if (!arvo) continue;
    if (kentta === "vaihe" && !(HANKE_VAIHEET as readonly string[]).includes(arvo)) {
      return { sisalto: { kentat: {} }, virhe: "Vaihe ei ole sallittu." };
    }

    const kohta = kohdat[kentta];
    const omaUrl = kohta?.lahde_url.trim() ?? "";
    if (omaUrl && !onHttpsUrl(omaUrl)) {
      return {
        sisalto: { kentat: {} },
        virhe: `Kentän lähteen osoitteen pitää alkaa http:// tai https://.`,
      };
    }
    const lahdeUrl = omaUrl || yhteinenUrl;
    if (!lahdeUrl) {
      return {
        sisalto: { kentat: {} },
        virhe: "Jokaisella täytetyllä kentällä pitää olla lähteen osoite.",
      };
    }

    const omaSivu = sivunumero(kohta?.lahde_sivu ?? "");
    if (omaSivu.virhe) return { sisalto: { kentat: {} }, virhe: omaSivu.virhe };

    const luottamusRaaka = (kohta?.luottamus ?? "").trim();
    const luottamus: Luottamus = (ILMOITUS_LUOTTAMUKSET as readonly string[]).includes(
      luottamusRaaka,
    )
      ? (luottamusRaaka as (typeof ILMOITUS_LUOTTAMUKSET)[number])
      : "epavarma";

    const lainaus =
      (kohta?.lainaus.trim() || yhteinenLainaus.trim()) || null;

    tulos[kentta] = {
      arvo,
      lahde_url: lahdeUrl,
      lahde_sivu: omaSivu.sivu ?? (omaUrl ? null : yhteinenSivu.sivu),
      lainaus,
      luottamus,
    };
  }

  return { sisalto: { kentat: tulos }, virhe: null };
}

export function tarkistaUusiHanke(sisalto: EhdotusSisalto): string | null {
  for (const pakollinen of ["nimi", "kunta", "vaihe"] as const) {
    if (!sisalto.kentat[pakollinen]?.arvo) {
      return "Uudessa hankkeessa tarvitaan nimi, kunta, vaihe ja lähde.";
    }
  }
  return null;
}

function luku(arvo: unknown): number | null {
  if (arvo == null || arvo === "") return null;
  const korjattu = String(arvo).trim().replace(",", ".");
  const n = Number(korjattu);
  return Number.isFinite(n) ? n : null;
}

export function kenttaArvoksi(
  kentta: string,
  arvo: unknown,
): string | number | HankeVaihe | null {
  if (arvo == null || arvo === "") return null;
  if (NUMEERISET.has(kentta)) return luku(arvo);
  return String(arvo);
}

const LUOTTAMUKSET = new Set<Luottamus>(["vahvistettu", "epavarma", "ristiriitainen"]);

export function kentanLuottamus(
  tieto: EhdotettuKentta,
  oletus: Luottamus,
): Luottamus {
  if (tieto.luottamus && LUOTTAMUKSET.has(tieto.luottamus)) return tieto.luottamus;
  return oletus;
}

export const VAIHTOEHTO_KENTAT = [
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
] as const;

export type VaihtoehtoKentta = (typeof VAIHTOEHTO_KENTAT)[number];

export function onVaihtoehtoKentta(kentta: string): kentta is VaihtoehtoKentta {
  return (VAIHTOEHTO_KENTAT as readonly string[]).includes(kentta);
}

export function rakennaKuvaEhdotus(
  kuvaUrl: string,
  kuvateksti: string,
  kuvaaja: string,
  lahdeUrl: string,
  lahdeSivu: string,
  lainaus: string,
): { kuva: EhdotettuKuva; virhe: string | null } {
  const osoite = kuvaUrl.trim();
  const teksti = kuvateksti.trim();
  const kuvaajaTrim = kuvaaja.trim();
  const lahde = (lahdeUrl.trim() || osoite);
  if (!/^https:\/\//.test(osoite)) {
    return {
      kuva: {
        kuva_url: "",
        kuvateksti: "",
        kuvaaja: "",
        lahde_url: "",
        lahde_sivu: null,
        lainaus: null,
      },
      virhe: "Kuvan osoitteen pitää alkaa https://.",
    };
  }
  if (!/^https?:\/\//.test(lahde)) {
    return {
      kuva: {
        kuva_url: "",
        kuvateksti: "",
        kuvaaja: "",
        lahde_url: "",
        lahde_sivu: null,
        lainaus: null,
      },
      virhe: "Lähteen osoitteen pitää alkaa http:// tai https://.",
    };
  }
  if (!teksti) {
    return {
      kuva: {
        kuva_url: "",
        kuvateksti: "",
        kuvaaja: "",
        lahde_url: "",
        lahde_sivu: null,
        lainaus: null,
      },
      virhe: "Kuvatekstin on oltava merkitty.",
    };
  }
  if (!kuvaajaTrim) {
    return {
      kuva: {
        kuva_url: "",
        kuvateksti: "",
        kuvaaja: "",
        lahde_url: "",
        lahde_sivu: null,
        lainaus: null,
      },
      virhe: "Valokuvaajan on oltava merkitty.",
    };
  }
  const sivu = lahdeSivu.trim() === "" ? null : Number(lahdeSivu);
  if (sivu != null && (!Number.isInteger(sivu) || sivu < 1)) {
    return {
      kuva: {
        kuva_url: "",
        kuvateksti: "",
        kuvaaja: "",
        lahde_url: "",
        lahde_sivu: null,
        lainaus: null,
      },
      virhe: "Sivunumero ei ole kelvollinen.",
    };
  }
  return {
    kuva: {
      kuva_url: osoite,
      kuvateksti: teksti,
      kuvaaja: kuvaajaTrim,
      lahde_url: lahde,
      lahde_sivu: sivu,
      lainaus: lainaus.trim() || null,
    },
    virhe: null,
  };
}

const PAATOS_KENTAT = ["kuvaus", "pvm", "paattava_organisaatio_id"] as const;

type PaatosLahdeRivi = NonNullable<EhdotusSisalto["paatos"]>["lahteet"][number];

function paatosLahdeRivi(
  kentta: string,
  lahdeUrl: string,
  lahdeSivu: string,
  lainaus: string,
  luottamus: Luottamus,
): PaatosLahdeRivi | null {
  const url = lahdeUrl.trim();
  if (!/^https?:\/\//.test(url)) return null;
  const sivu = lahdeSivu.trim() === "" ? null : Number(lahdeSivu);
  if (sivu != null && (!Number.isInteger(sivu) || sivu < 1)) return null;
  return {
    kentta,
    lahde_url: url,
    lahde_sivu: sivu,
    vahvistettu_pvm: new Date().toISOString().slice(0, 10),
    luottamus,
    lainaus: lainaus.trim() || null,
    merkitty: "ihmisen_vahvistama",
  };
}

export function rakennaPaatosSisalto(
  kuvaus: string,
  pvm: string,
  organisaatioNimi: string,
  lahdeUrl: string,
  lahdeSivu: string,
  lainaus: string,
  luottamus: Luottamus = "vahvistettu",
): { paatos: NonNullable<EhdotusSisalto["paatos"]>; virhe: string | null } {
  const kuvausTrim = kuvaus.trim();
  const pvmTrim = pvm.trim();
  const orgTrim = organisaatioNimi.trim();
  if (!kuvausTrim) {
    return { paatos: { kuvaus: "", pvm: "", lahteet: [] }, virhe: "Kuvaus puuttuu." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pvmTrim)) {
    return { paatos: { kuvaus: "", pvm: "", lahteet: [] }, virhe: "Päivämäärän muoto on YYYY-MM-DD." };
  }
  if (!orgTrim) {
    return { paatos: { kuvaus: "", pvm: "", lahteet: [] }, virhe: "Päättävä elin puuttuu." };
  }
  if (!/^https?:\/\//.test(lahdeUrl.trim())) {
    return {
      paatos: { kuvaus: "", pvm: "", lahteet: [] },
      virhe: "Lähteen osoitteen pitää alkaa http:// tai https://.",
    };
  }
  const lahteet = [];
  for (const kentta of PAATOS_KENTAT) {
    const rivi = paatosLahdeRivi(kentta, lahdeUrl, lahdeSivu, lainaus, luottamus);
    if (!rivi) {
      return {
        paatos: { kuvaus: "", pvm: "", lahteet: [] },
        virhe: "Lähde tai sivunumero ei ole kelvollinen.",
      };
    }
    lahteet.push(rivi);
  }
  return {
    paatos: {
      kuvaus: kuvausTrim,
      pvm: pvmTrim,
      paattava_organisaatio_nimi: orgTrim,
      lahteet,
    },
    virhe: null,
  };
}
