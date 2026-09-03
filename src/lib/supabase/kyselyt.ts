import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";
import type {
  Hanke,
  HankeJohto,
  HankeKuva,
  HankeVaihtoehto,
  HankeKunta,
  HankeMenettely,
  HankeOrganisaatio,
  HankeOrganisaatioRooli,
  HankeVaihe,
  KenttaLahde,
  Dokumentti,
  Maaraaja,
  Organisaatio,
  OrganisaatioTyyppi,
} from "@/lib/supabase/tietokanta";
import { hankeOsuvatKokoLuokkaan } from "@/lib/hanke-vaihtelvali";
import { onHankeVaihe, onKokoLuokka, vanhinVahvistettuPvm, type KokoLuokka } from "@/lib/naytto";

/** Vanha tunniste yhdistämisen jälkeen. Julkinen ohjaustaulu. */
export async function haeHankeOhjaus(vanhaId: string): Promise<string | null> {
  if (!supabaseYmparistoAsetettu()) return null;
  const supabase = await luoPalvelinAsiakas();
  const { data } = await supabase
    .from("hanke_ohjaukset")
    .select("uusi_id")
    .eq("vanha_id", vanhaId)
    .maybeSingle();
  return data?.uusi_id ?? null;
}

export type HankeListalla = Hanke & {
  toimija: Pick<Organisaatio, "id" | "nimi"> | null;
  vaihtoehdot: HankeVaihtoehto[];
  vanhin_vahvistettu_pvm: string | null;
};

export type HankeSuodatus = {
  kunta?: string;
  vaihe?: HankeVaihe;
  koko?: KokoLuokka;
  kuvalliset?: boolean;
};

export function parsiSuodatus(params: {
  kunta?: string;
  vaihe?: string;
  koko?: string;
  kuvalliset?: string;
}): HankeSuodatus {
  return {
    kunta: params.kunta || undefined,
    vaihe: params.vaihe && onHankeVaihe(params.vaihe) ? params.vaihe : undefined,
    koko: params.koko && onKokoLuokka(params.koko) ? params.koko : undefined,
    kuvalliset: params.kuvalliset === "1",
  };
}

export type TulevaMaaraaika = Maaraaja & {
  hanke: Pick<Hanke, "id" | "nimi" | "kunta">;
};

function virheViesti(syy: unknown): string {
  if (syy instanceof Error) return syy.message;
  return "Tietokantakysely epäonnistui.";
}

export async function haeJulkaistutHankkeet(
  suodatus: HankeSuodatus = {},
): Promise<{ hankkeet: HankeListalla[]; johdot: HankeJohto[]; virhe: string | null }> {
  if (!supabaseYmparistoAsetettu()) {
    return { hankkeet: [], johdot: [], virhe: "Julkaistuja hankkeita ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    let kysely = supabase
      .from("hankkeet")
      .select("*, toimija:toimija_organisaatio_id(id, nimi)")
      .eq("julkaistu", true)
      .order("nimi", { ascending: true });

    if (suodatus.kunta) {
      kysely = kysely.eq("kunta", suodatus.kunta);
    }
    if (suodatus.vaihe) {
      kysely = kysely.eq("vaihe", suodatus.vaihe);
    }

    const { data, error } = await kysely;
    if (error) return { hankkeet: [], johdot: [], virhe: error.message };

    const pohjat = (data ?? []) as Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm">[];
    const suodatetutIdt = pohjat.map((hanke) => hanke.id);
    let vaihtoehdot: HankeVaihtoehto[] = [];
    if (suodatetutIdt.length > 0) {
      const { data: veData } = await supabase
        .from("hanke_vaihtoehdot")
        .select("*")
        .in("hanke_id", suodatetutIdt)
        .eq("julkaistu", true)
        .order("tunnus");
      vaihtoehdot = (veData ?? []) as HankeVaihtoehto[];
    }

    let hankkeet: HankeListalla[] = pohjat.map((hanke) => ({
      ...hanke,
      vaihtoehdot: vaihtoehdot.filter((rivi) => rivi.hanke_id === hanke.id),
      vanhin_vahvistettu_pvm: null,
    }));
    const kokoLuokka = suodatus.koko;
    if (kokoLuokka) {
      hankkeet = hankkeet.filter((hanke) =>
        hankeOsuvatKokoLuokkaan(hanke, hanke.vaihtoehdot, kokoLuokka),
      );
    }
    if (suodatus.kuvalliset && hankkeet.length > 0) {
      const { data: kuvaRivit, error: kuvaVirhe } = await supabase
        .from("hanke_kuvat")
        .select("hanke_id")
        .eq("julkaistu", true)
        .in(
          "hanke_id",
          hankkeet.map((hanke) => hanke.id),
        );
      if (kuvaVirhe) return { hankkeet: [], johdot: [], virhe: kuvaVirhe.message };
      const kuvalliset = new Set((kuvaRivit ?? []).map((rivi) => rivi.hanke_id));
      hankkeet = hankkeet.filter((hanke) => kuvalliset.has(hanke.id));
    }

    const idt = hankkeet.map((hanke) => hanke.id);
    let johdot: HankeJohto[] = [];
    if (idt.length > 0) {
      const { data: johtoData } = await supabase
        .from("hanke_johdot")
        .select("*")
        .in("hanke_id", idt)
        .eq("julkaistu", true);
      johdot = (johtoData ?? []) as HankeJohto[];
      const { data: vahvistukset } = await supabase
        .from("kentta_lahteet")
        .select("rivi_id, vahvistettu_pvm")
        .eq("taulu", "hankkeet")
        .in("rivi_id", idt);
      const vanhimmat = new Map<string, string>();
      for (const rivi of vahvistukset ?? []) {
        const pvm = vanhinVahvistettuPvm([rivi]);
        if (!pvm) continue;
        const aiempi = vanhimmat.get(rivi.rivi_id);
        if (!aiempi || pvm < aiempi) vanhimmat.set(rivi.rivi_id, pvm);
      }
      hankkeet = hankkeet.map((hanke) => ({
        ...hanke,
        vanhin_vahvistettu_pvm: vanhimmat.get(hanke.id) ?? null,
      }));
    }

    return { hankkeet, johdot, virhe: null };
  } catch (syy) {
    return { hankkeet: [], johdot: [], virhe: virheViesti(syy) };
  }
}

export type HankeOrganisaatioNakyma = HankeOrganisaatio & {
  organisaatio: Pick<Organisaatio, "id" | "nimi"> | null;
};

export type OrganisaationHanke = HankeListalla & {
  roolit: HankeOrganisaatioRooli[];
};

export type AsiakirjanKaytto = {
  taulu: KenttaLahde["taulu"];
  kentta: string;
  sivut: number[];
};

export type HankeAsiakirja = Dokumentti & {
  kattaa: AsiakirjanKaytto[];
};

function asiakirjanKaytto(lahteet: KenttaLahde[], dokumentti: Dokumentti): AsiakirjanKaytto[] {
  const kartta = new Map<string, AsiakirjanKaytto>();
  for (const lahde of lahteet) {
    if (lahde.dokumentti_id !== dokumentti.id && lahde.lahde_url !== dokumentti.url) continue;
    if (lahde.taulu === "dokumentit") continue;
    const avain = `${lahde.taulu}:${lahde.kentta}`;
    const aiempi = kartta.get(avain);
    if (aiempi) {
      if (lahde.lahde_sivu != null && !aiempi.sivut.includes(lahde.lahde_sivu)) {
        aiempi.sivut.push(lahde.lahde_sivu);
        aiempi.sivut.sort((a, b) => a - b);
      }
    } else {
      kartta.set(avain, {
        taulu: lahde.taulu,
        kentta: lahde.kentta,
        sivut: lahde.lahde_sivu == null ? [] : [lahde.lahde_sivu],
      });
    }
  }
  return [...kartta.values()].sort((a, b) =>
    `${a.taulu}.${a.kentta}`.localeCompare(`${b.taulu}.${b.kentta}`, "fi"),
  );
}

export async function haeHanke(id: string): Promise<{
  hanke: HankeListalla | null;
  lahteet: KenttaLahde[];
  kunnat: HankeKunta[];
  kuntaLahteet: KenttaLahde[];
  menettelyt: HankeMenettely[];
  menettelyLahteet: KenttaLahde[];
  organisaatioroolit: HankeOrganisaatioNakyma[];
  organisaatiorooliLahteet: KenttaLahde[];
  maaraajat: Maaraaja[];
  maaraajaLahteet: KenttaLahde[];
  asiakirjat: HankeAsiakirja[];
  asiakirjaLahteet: KenttaLahde[];
  johdot: HankeJohto[];
  johtoLahteet: KenttaLahde[];
  vaihtoehdot: HankeVaihtoehto[];
  vaihtoehtoLahteet: KenttaLahde[];
  kuvat: HankeKuva[];
  kuvaLahteet: KenttaLahde[];
  virhe: string | null;
}> {
  const tyhja = {
    hanke: null,
    lahteet: [],
    kunnat: [],
    kuntaLahteet: [],
    menettelyt: [],
    menettelyLahteet: [],
    organisaatioroolit: [],
    organisaatiorooliLahteet: [],
    maaraajat: [],
    maaraajaLahteet: [],
    asiakirjat: [],
    asiakirjaLahteet: [],
    johdot: [],
    johtoLahteet: [],
    vaihtoehdot: [],
    vaihtoehtoLahteet: [],
    kuvat: [],
    kuvaLahteet: [],
    virhe: null as string | null,
  };

  if (!supabaseYmparistoAsetettu()) {
    return { ...tyhja, virhe: "Hanketta ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const { data: hanke, error: hankeVirhe } = await supabase
      .from("hankkeet")
      .select("*, toimija:toimija_organisaatio_id(id, nimi)")
      .eq("id", id)
      .eq("julkaistu", true)
      .maybeSingle();

    if (hankeVirhe) return { ...tyhja, virhe: hankeVirhe.message };
    if (!hanke) return tyhja;

    const [
      { data: lahteet },
      { data: maaraajat },
      { data: kunnat },
      { data: menettelyt },
      { data: organisaatioroolit },
      { data: dokumentit },
      { data: johdot },
      { data: vaihtoehdot },
      { data: kuvat },
    ] = await Promise.all([
      supabase
        .from("kentta_lahteet")
        .select("*")
        .eq("taulu", "hankkeet")
        .eq("rivi_id", id)
        .order("kentta"),
      supabase
        .from("maaraajat")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("paattyy_pvm"),
      supabase
        .from("hanke_kunnat")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("kunta"),
      supabase
        .from("hanke_menettelyt")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("laji"),
      supabase
        .from("hanke_organisaatiot")
        .select("*, organisaatio:organisaatiot(id, nimi)")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("rooli"),
      supabase
        .from("dokumentit")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("otsikko"),
      supabase
        .from("hanke_johdot")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("vaihtoehto"),
      supabase
        .from("hanke_vaihtoehdot")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("tunnus"),
      supabase
        .from("hanke_kuvat")
        .select("*")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("jarjestys"),
    ]);

    async function haeRiviLahteet(
      taulu: KenttaLahde["taulu"],
      idt: string[],
    ): Promise<KenttaLahde[]> {
      if (idt.length === 0) return [];
      const { data } = await supabase
        .from("kentta_lahteet")
        .select("*")
        .eq("taulu", taulu)
        .in("rivi_id", idt);
      return (data ?? []) as KenttaLahde[];
    }

    const maaraajaIdt = (maaraajat ?? []).map((rivi) => rivi.id);
    const kuntaIdt = (kunnat ?? []).map((rivi) => rivi.id);
    const menettelyIdt = (menettelyt ?? []).map((rivi) => rivi.id);
    const orgRooliIdt = (organisaatioroolit ?? []).map((rivi) => rivi.id);

    const dokumenttiIdt = (dokumentit ?? []).map((rivi) => rivi.id);
    const johtoIdt = (johdot ?? []).map((rivi) => rivi.id);
    const vaihtoehtoIdt = (vaihtoehdot ?? []).map((rivi) => rivi.id);
    const kuvaIdt = (kuvat ?? []).map((rivi) => rivi.id);

    const [
      maaraajaLahteet,
      kuntaLahteet,
      menettelyLahteet,
      organisaatiorooliLahteet,
      asiakirjaLahteet,
      johtoLahteet,
      vaihtoehtoLahteet,
      kuvaLahteet,
    ] = await Promise.all([
        haeRiviLahteet("maaraajat", maaraajaIdt),
        haeRiviLahteet("hanke_kunnat", kuntaIdt),
        haeRiviLahteet("hanke_menettelyt", menettelyIdt),
        haeRiviLahteet("hanke_organisaatiot", orgRooliIdt),
        haeRiviLahteet("dokumentit", dokumenttiIdt),
        haeRiviLahteet("hanke_johdot", johtoIdt),
        haeRiviLahteet("hanke_vaihtoehdot", vaihtoehtoIdt),
        haeRiviLahteet("hanke_kuvat", kuvaIdt),
      ]);

    const kaikkiLahteet: KenttaLahde[] = [
      ...((lahteet ?? []) as KenttaLahde[]),
      ...maaraajaLahteet,
      ...kuntaLahteet,
      ...menettelyLahteet,
      ...organisaatiorooliLahteet,
      ...johtoLahteet,
      ...vaihtoehtoLahteet,
      ...kuvaLahteet,
    ];

    const asiakirjat: HankeAsiakirja[] = ((dokumentit ?? []) as Dokumentti[]).map((dokumentti) => ({
      ...dokumentti,
      kattaa: asiakirjanKaytto(kaikkiLahteet, dokumentti),
    }));

    return {
      hanke: {
        ...(hanke as Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm">),
        vaihtoehdot: (vaihtoehdot ?? []) as HankeVaihtoehto[],
        vanhin_vahvistettu_pvm: vanhinVahvistettuPvm(kaikkiLahteet),
      },
      lahteet: (lahteet ?? []) as KenttaLahde[],
      kunnat: (kunnat ?? []) as HankeKunta[],
      kuntaLahteet,
      menettelyt: (menettelyt ?? []) as HankeMenettely[],
      menettelyLahteet,
      organisaatioroolit: (organisaatioroolit ?? []) as HankeOrganisaatioNakyma[],
      organisaatiorooliLahteet,
      maaraajat: (maaraajat ?? []) as Maaraaja[],
      maaraajaLahteet,
      asiakirjat,
      asiakirjaLahteet,
      johdot: (johdot ?? []) as HankeJohto[],
      johtoLahteet,
      vaihtoehdot: (vaihtoehdot ?? []) as HankeVaihtoehto[],
      vaihtoehtoLahteet,
      kuvat: (kuvat ?? []) as HankeKuva[],
      kuvaLahteet,
      virhe: null,
    };
  } catch (syy) {
    return { ...tyhja, virhe: virheViesti(syy) };
  }
}

export async function haeTulevatMaaraajat(): Promise<{
  maaraajat: TulevaMaaraaika[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { maaraajat: [], virhe: "Määräaikoja ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const tanaan = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("maaraajat")
      .select("*, hanke:hankkeet!inner(id, nimi, kunta)")
      .eq("julkaistu", true)
      .eq("hanke.julkaistu", true)
      .gte("paattyy_pvm", tanaan)
      .order("paattyy_pvm", { ascending: true })
      .limit(20);

    if (error) return { maaraajat: [], virhe: error.message };
    return { maaraajat: (data ?? []) as TulevaMaaraaika[], virhe: null };
  } catch (syy) {
    return { maaraajat: [], virhe: virheViesti(syy) };
  }
}

export async function haeJulkaistutOrganisaatiot(
  tyyppi?: OrganisaatioTyyppi,
): Promise<{ organisaatiot: Organisaatio[]; virhe: string | null }> {
  if (!supabaseYmparistoAsetettu()) {
    return { organisaatiot: [], virhe: "Organisaatioita ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    let kysely = supabase
      .from("organisaatiot")
      .select("*")
      .eq("julkaistu", true)
      .order("nimi", { ascending: true });
    if (tyyppi) {
      kysely = kysely.eq("tyyppi", tyyppi);
    }
    const { data, error } = await kysely;
    if (error) return { organisaatiot: [], virhe: error.message };
    return { organisaatiot: (data ?? []) as Organisaatio[], virhe: null };
  } catch (syy) {
    return { organisaatiot: [], virhe: virheViesti(syy) };
  }
}

export async function haeOrganisaatio(id: string): Promise<{
  organisaatio: Organisaatio | null;
  hankkeet: OrganisaationHanke[];
  virhe: string | null;
}> {
  const tyhja = {
    organisaatio: null,
    hankkeet: [] as OrganisaationHanke[],
    virhe: null as string | null,
  };

  if (!supabaseYmparistoAsetettu()) {
    return { ...tyhja, virhe: "Organisaatiota ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const { data: organisaatio, error } = await supabase
      .from("organisaatiot")
      .select("*")
      .eq("id", id)
      .eq("julkaistu", true)
      .maybeSingle();
    if (error) return { ...tyhja, virhe: error.message };
    if (!organisaatio) return tyhja;

    const [{ data: vastaavana }, { data: roolirivit }] = await Promise.all([
      supabase
        .from("hankkeet")
        .select("*, toimija:toimija_organisaatio_id(id, nimi)")
        .eq("julkaistu", true)
        .eq("toimija_organisaatio_id", id)
        .order("nimi", { ascending: true }),
      supabase
        .from("hanke_organisaatiot")
        .select("rooli, hanke:hankkeet!hanke_id(*, toimija:toimija_organisaatio_id(id, nimi))")
        .eq("organisaatio_id", id)
        .eq("julkaistu", true),
    ]);

    const hankkeetKartta = new Map<string, OrganisaationHanke>();
    for (const hanke of (vastaavana ?? []) as Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm">[]) {
      hankkeetKartta.set(hanke.id, {
        ...hanke,
        vaihtoehdot: [],
        vanhin_vahvistettu_pvm: null,
        roolit: ["toimija"],
      });
    }
    for (const rivi of roolirivit ?? []) {
      const raaka = rivi as unknown as {
        rooli: HankeOrganisaatioRooli;
        hanke: Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm"> | Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm">[] | null;
      };
      const hankePohja = Array.isArray(raaka.hanke) ? (raaka.hanke[0] ?? null) : raaka.hanke;
      const rooli = raaka.rooli;
      if (!hankePohja || !hankePohja.julkaistu) continue;
      const hanke: HankeListalla = {
        ...hankePohja,
        vaihtoehdot: [],
        vanhin_vahvistettu_pvm: null,
      };
      const aiempi = hankkeetKartta.get(hanke.id);
      if (aiempi) {
        if (!aiempi.roolit.includes(rooli)) aiempi.roolit.push(rooli);
      } else {
        hankkeetKartta.set(hanke.id, { ...hanke, roolit: [rooli] });
      }
    }

    const hankkeet = [...hankkeetKartta.values()].sort((a, b) =>
      a.nimi.localeCompare(b.nimi, "fi"),
    );

    return {
      organisaatio: organisaatio as Organisaatio,
      hankkeet,
      virhe: null,
    };
  } catch (syy) {
    return { ...tyhja, virhe: virheViesti(syy) };
  }
}

export type JulkinenLahdeajo = {
  id: string;
  sovitin: string;
  tila: string;
  alkoi_pvm: string;
  paattyi_pvm: string | null;
  http_tila: number | null;
  osumia: number;
  virhe: string | null;
  kysely_url: string | null;
};

const LAHDEAJO_KATTO = 500;

export async function haeJulkisetLahdeajot(): Promise<{
  ajot: JulkinenLahdeajo[];
  katkaistu: boolean;
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { ajot: [], katkaistu: false, virhe: "Lähdeajoja ei juuri nyt voitu hakea." };
  }
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("lahdeajot")
      .select("id, sovitin, tila, alkoi_pvm, paattyi_pvm, http_tila, osumia, virhe, kysely_url")
      .order("alkoi_pvm", { ascending: false })
      .limit(LAHDEAJO_KATTO);
    if (error) throw error;
    const ajot = (data ?? []) as JulkinenLahdeajo[];
    return {
      ajot,
      katkaistu: ajot.length === LAHDEAJO_KATTO,
      virhe: null,
    };
  } catch (syy) {
    return { ajot: [], katkaistu: false, virhe: virheViesti(syy) };
  }
}
