import { createHash } from "node:crypto";
import { asiakirjaMetataInfo, viimeisinAsiakirjaHakuPvm } from "@/lib/asiakirja-naytto";
import {
  asiakirjanKayttoMonelle,
  kanoninenDokumenttiUrl,
  yhdistaSamannimisetAsiakirjat,
  type AsiakirjanKaytto,
} from "@/lib/asiakirja-yhdistys";
import { piilotaJulkinenAsiakirjaUrl } from "@/lib/lahde-geokoodaus-url";
import { naytaDokumenttiOtsikko } from "@/lib/lahde-metatiedot";
import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";
import { unstable_noStore as noStore } from "next/cache";
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
  KenttaTarkistus,
  PaatosNakyma,
} from "@/lib/supabase/tietokanta";
import { hankeOsuvatKokoLuokkaan } from "@/lib/hanke-vaihtelvali";
import { hankkeSopiiHakuun } from "@/lib/haku";
import type { HankeSuodatus } from "@/lib/suodatus";
import type { JulkaistuMuutosNakyma } from "@/lib/muutos-naytto";
import {
  hankeOrganisaatioRooliNimi,
  vanhinVahvistettuPvm,
  viimeisinPaatos,
  tanaanSuomessa,
} from "@/lib/naytto";
import {
  KONSULTTI_HAKU_ROOLIT,
  KONSULTTI_SIVU_ROOLI_JARJESTYS,
  normalisoiKonsulttiSivuRooli,
} from "@/lib/konsultti-roolit";
import { normalisoiKuntaNimi } from "@/lib/maakunta";

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
  viimeisin_paatos: PaatosNakyma | null;
};

export type { HankeSuodatus } from "@/lib/suodatus";
export { parsiSuodatus } from "@/lib/suodatus";

export type TulevaMaaraaika = Maaraaja & {
  hanke: Pick<Hanke, "id" | "nimi" | "kunta" | "vaihe">;
};

export type { JulkaistuMuutosNakyma };

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

    const pohjat = (data ?? []) as Omit<
      HankeListalla,
      "vaihtoehdot" | "vanhin_vahvistettu_pvm" | "viimeisin_paatos"
    >[];
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
      viimeisin_paatos: null,
    }));
    const kokoLuokka = suodatus.koko;
    if (kokoLuokka) {
      hankkeet = hankkeet.filter((hanke) =>
        hankeOsuvatKokoLuokkaan(hanke, hanke.vaihtoehdot, kokoLuokka),
      );
    }
    if (suodatus.q) {
      hankkeet = hankkeet.filter((hanke) => hankkeSopiiHakuun(hanke, suodatus.q));
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
        .eq("tila", "voimassa")
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
      const { data: paatosRivit } = await supabase
        .from("paatokset")
        .select("*, paattava_organisaatio:paattava_organisaatio_id(id, nimi)")
        .in("hanke_id", idt)
        .eq("julkaistu", true);
      const paatoksetHankeittain = new Map<string, PaatosNakyma[]>();
      for (const rivi of (paatosRivit ?? []) as PaatosNakyma[]) {
        const lista = paatoksetHankeittain.get(rivi.hanke_id) ?? [];
        lista.push(rivi);
        paatoksetHankeittain.set(rivi.hanke_id, lista);
      }
      hankkeet = hankkeet.map((hanke) => ({
        ...hanke,
        viimeisin_paatos: viimeisinPaatos(paatoksetHankeittain.get(hanke.id) ?? []),
      }));
    }

    return { hankkeet, johdot, virhe: null };
  } catch (syy) {
    return { hankkeet: [], johdot: [], virhe: virheViesti(syy) };
  }
}

/** Rajaa valmiin hankelistan muistissa. Kuvalliset-suodatin tekee yhden kuvakyselyn. */
export async function rajaaHankelista(
  tulos: { hankkeet: HankeListalla[]; johdot: HankeJohto[]; virhe: string | null },
  suodatus: HankeSuodatus,
): Promise<{ hankkeet: HankeListalla[]; johdot: HankeJohto[]; virhe: string | null }> {
  if (tulos.virhe) return tulos;
  if (!suodatus.q && !suodatus.kunta && !suodatus.vaihe && !suodatus.koko && !suodatus.kuvalliset) {
    return tulos;
  }

  let hankkeet = tulos.hankkeet;
  if (suodatus.kunta) {
    hankkeet = hankkeet.filter((hanke) => hanke.kunta === suodatus.kunta);
  }
  if (suodatus.vaihe) {
    hankkeet = hankkeet.filter((hanke) => hanke.vaihe === suodatus.vaihe);
  }
  if (suodatus.koko) {
    const kokoLuokka = suodatus.koko;
    hankkeet = hankkeet.filter((hanke) =>
      hankeOsuvatKokoLuokkaan(hanke, hanke.vaihtoehdot, kokoLuokka),
    );
  }
  if (suodatus.q) {
    hankkeet = hankkeet.filter((hanke) => hankkeSopiiHakuun(hanke, suodatus.q));
  }

  if (suodatus.kuvalliset && hankkeet.length > 0) {
    try {
      const supabase = await luoPalvelinAsiakas();
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
    } catch (syy) {
      return { hankkeet: [], johdot: [], virhe: virheViesti(syy) };
    }
  }

  const idt = new Set(hankkeet.map((hanke) => hanke.id));
  return {
    hankkeet,
    johdot: tulos.johdot.filter((johto) => idt.has(johto.hanke_id)),
    virhe: null,
  };
}

/** Kunta → maakunta (Syken hakemisto). Karttakerroksen maakunnan ratkaisuun. */
export async function haeKuntaMaakuntaKartta(): Promise<Map<string, string>> {
  if (!supabaseYmparistoAsetettu()) return new Map();

  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("kunnat")
      .select("nimi, maakunta")
      .eq("voimassa", true);
    if (error) return new Map();

    const kartta = new Map<string, string>();
    for (const rivi of data ?? []) {
      const maakunta = rivi.maakunta?.trim();
      if (!maakunta) continue;
      kartta.set(normalisoiKuntaNimi(rivi.nimi), maakunta);
    }
    return kartta;
  } catch {
    return new Map();
  }
}

export type KuntaListalla = {
  id: string;
  nimi: string;
  slug: string;
  maakunta: string | null;
  hankkeita: number;
};

export type KuntaAsiakirja = {
  id: string;
  url: string;
  otsikko: string;
  otsikko_automaattinen: boolean;
  julkaisija: string | null;
  julkaistu_pvm: string | null;
  hanke_id: string;
  hanke_nimi: string;
};

/** Kunta → slug (suomenkielinen nimi avaimena, normalisoituna). */
export async function haeKuntaSlugKartta(): Promise<Map<string, string>> {
  if (!supabaseYmparistoAsetettu()) return new Map();
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase.from("kunnat").select("nimi, slug");
    if (error) return new Map();
    const kartta = new Map<string, string>();
    for (const rivi of data ?? []) {
      if (!rivi.slug) continue;
      kartta.set(normalisoiKuntaNimi(rivi.nimi), rivi.slug);
    }
    return kartta;
  } catch {
    return new Map();
  }
}

/** Kunnat, joilla on vähintään yksi julkaistu hanke. */
export async function haeKunnatJoissaHankkeita(): Promise<{
  kunnat: KuntaListalla[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { kunnat: [], virhe: "Kuntia ei juuri nyt voitu hakea." };
  }
  try {
    const supabase = await luoPalvelinAsiakas();
    const [{ data: kuntaRivitt, error: kuntaVirhe }, { data: hankeRivitt, error: hankeVirhe }] =
      await Promise.all([
        supabase.from("kunnat").select("id, nimi, slug, maakunta").eq("voimassa", true),
        supabase.from("hankkeet").select("kunta").eq("julkaistu", true),
      ]);
    if (kuntaVirhe) return { kunnat: [], virhe: kuntaVirhe.message };
    if (hankeVirhe) return { kunnat: [], virhe: hankeVirhe.message };

    const lkm = new Map<string, number>();
    for (const rivi of hankeRivitt ?? []) {
      const nimi = rivi.kunta?.trim();
      if (!nimi) continue;
      const avain = normalisoiKuntaNimi(nimi);
      lkm.set(avain, (lkm.get(avain) ?? 0) + 1);
    }

    const kunnat: KuntaListalla[] = [];
    for (const rivi of kuntaRivitt ?? []) {
      const hankkeita = lkm.get(normalisoiKuntaNimi(rivi.nimi)) ?? 0;
      if (hankkeita === 0) continue;
      kunnat.push({
        id: rivi.id,
        nimi: rivi.nimi,
        slug: rivi.slug,
        maakunta: rivi.maakunta,
        hankkeita,
      });
    }
    kunnat.sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"));
    return { kunnat, virhe: null };
  } catch (syy) {
    return { kunnat: [], virhe: virheViesti(syy) };
  }
}

export async function haeKuntaSlugilla(slug: string): Promise<{
  kunta: Pick<KuntaListalla, "id" | "nimi" | "slug" | "maakunta"> | null;
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { kunta: null, virhe: "Kuntaa ei juuri nyt voitu hakea." };
  }
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("kunnat")
      .select("id, nimi, slug, maakunta")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return { kunta: null, virhe: error.message };
    if (!data) return { kunta: null, virhe: null };
    return {
      kunta: {
        id: data.id,
        nimi: data.nimi,
        slug: data.slug,
        maakunta: data.maakunta,
      },
      virhe: null,
    };
  } catch (syy) {
    return { kunta: null, virhe: virheViesti(syy) };
  }
}

/** Kunnan hankkeisiin liittyvät lähdeasiakirjat (ei menetelmä-tyyppiä). */
export async function haeKunnanAsiakirjat(kuntaNimi: string): Promise<{
  asiakirjat: KuntaAsiakirja[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { asiakirjat: [], virhe: "Asiakirjoja ei juuri nyt voitu hakea." };
  }
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data: hankkeet, error: hankeVirhe } = await supabase
      .from("hankkeet")
      .select("id, nimi")
      .eq("julkaistu", true)
      .eq("kunta", kuntaNimi);
    if (hankeVirhe) return { asiakirjat: [], virhe: hankeVirhe.message };
    const idt = (hankkeet ?? []).map((h) => h.id);
    if (idt.length === 0) return { asiakirjat: [], virhe: null };

    const nimet = new Map((hankkeet ?? []).map((h) => [h.id, h.nimi]));
    const { data, error } = await supabase
      .from("dokumentit")
      .select(
        "id, url, otsikko, otsikko_automaattinen, julkaisija, julkaistu_pvm, hanke_id, lahde_tyyppi, kanoninen_dokumentti_id",
      )
      .eq("julkaistu", true)
      .in("hanke_id", idt)
      .neq("lahde_tyyppi", "menetelma")
      .is("kanoninen_dokumentti_id", null)
      .order("julkaistu_pvm", { ascending: false, nullsFirst: false })
      .order("luotu_pvm", { ascending: false });
    if (error) return { asiakirjat: [], virhe: error.message };

    const asiakirjat: KuntaAsiakirja[] = [];
    for (const rivi of data ?? []) {
      if (!rivi.hanke_id) continue;
      if (piilotaJulkinenAsiakirjaUrl(rivi.url)) continue;
      asiakirjat.push({
        id: rivi.id,
        url: rivi.url,
        otsikko: rivi.otsikko,
        otsikko_automaattinen: rivi.otsikko_automaattinen,
        julkaisija: rivi.julkaisija,
        julkaistu_pvm: rivi.julkaistu_pvm,
        hanke_id: rivi.hanke_id,
        hanke_nimi: nimet.get(rivi.hanke_id) ?? "Hanke",
      });
    }
    return { asiakirjat, virhe: null };
  } catch (syy) {
    return { asiakirjat: [], virhe: virheViesti(syy) };
  }
}

export type HankeOrganisaatioNakyma = HankeOrganisaatio & {
  organisaatio: Pick<Organisaatio, "id" | "nimi" | "slug"> | null;
  rooli_meta: { nimi: string } | null;
};

export type OrganisaationHanke = HankeListalla & {
  roolit: HankeOrganisaatioRooli[];
};

export type { AsiakirjanKaytto } from "@/lib/asiakirja-yhdistys";

export type HankeAsiakirja = Dokumentti & {
  kattaa: AsiakirjanKaytto[];
  viimeisin_haku_pvm: string | null;
  meta_teksti: string;
};

/** Julkaistun hankkeen faktalähde-URL:t (ei teknisiä eikä dokumentti-itseviittauksia). */
export function hankkeenFaktalahdeUrllit(lahteet: KenttaLahde[]): string[] {
  const urls = new Set<string>();
  for (const lahde of lahteet) {
    if (lahde.tekninen_lahde) continue;
    if (lahde.taulu === "dokumentit") continue;
    const url = lahde.lahde_url.trim();
    if (piilotaJulkinenAsiakirjaUrl(url)) continue;
    if (url.startsWith("http://") || url.startsWith("https://")) urls.add(url);
  }
  return [...urls].sort((a, b) => a.localeCompare(b, "fi"));
}

function stubDokumenttiRivi(hankeId: string, url: string): Dokumentti {
  const tunniste = createHash("sha256").update(url).digest("hex").slice(0, 12);
  const nyt = "1970-01-01T00:00:00.000Z";
  return {
    id: `00000000-0000-4000-8000-${tunniste}`,
    hanke_id: hankeId,
    url,
    otsikko: url,
    laji: "verkkosivu",
    muoto: null,
    kieli: null,
    julkaisija: null,
    julkaistu_pvm: null,
    tunnus: null,
    sivumaara: null,
    menettely_id: null,
    lahde_tyyppi: "muu",
    sitovuustaso: "epavirallinen",
    otsikko_automaattinen: true,
    lahde_metatiedot_kasitelty_pvm: null,
    julkaistu: true,
    luotu_pvm: nyt,
    paivitetty_pvm: nyt,
    sisalto_tiiviste: null,
    kanoninen_dokumentti_id: null,
    sisalto_nouto_syy: null,
    sisalto_nouto_pvm: null,
  };
}

async function haeDokumentitUrleille(
  supabase: Awaited<ReturnType<typeof luoPalvelinAsiakas>>,
  urls: string[],
): Promise<Dokumentti[]> {
  if (urls.length === 0) return [];
  const koko = 80;
  const tulos: Dokumentti[] = [];
  for (let i = 0; i < urls.length; i += koko) {
    const palanen = urls.slice(i, i + koko);
    const { data, error } = await supabase
      .from("dokumentit")
      .select("*")
      .in("url", palanen)
      .eq("julkaistu", true);
    if (error) throw new Error(error.message);
    tulos.push(...((data ?? []) as Dokumentti[]));
  }
  return tulos;
}

/** Kaikki hankkeen julkaistuun tietoon liittyvät asiakirjat (URL-rekisteri + hanke_id). */
export function kokoaHankeAsiakirjat(
  kaikkiLahteet: KenttaLahde[],
  dokumentit: Dokumentti[],
  hankeId: string,
): HankeAsiakirja[] {
  const urlLahteet = hankkeenFaktalahdeUrllit(kaikkiLahteet);
  const byId = new Map<string, Dokumentti>();
  const byUrl = new Map<string, Dokumentti>();
  for (const d of dokumentit) {
    byId.set(d.id, d);
    byUrl.set(d.url, d);
  }

  function kanoninenAvain(url: string): string {
    const d = byUrl.get(url);
    if (!d) return url;
    return kanoninenDokumenttiUrl(d, byId);
  }

  const urlit = new Set<string>();
  for (const url of urlLahteet) {
    if (piilotaJulkinenAsiakirjaUrl(url)) continue;
    urlit.add(kanoninenAvain(url));
  }
  for (const d of dokumentit) {
    if (d.hanke_id !== hankeId || piilotaJulkinenAsiakirjaUrl(d.url)) continue;
    if (d.kanoninen_dokumentti_id) continue;
    urlit.add(kanoninenDokumenttiUrl(d, byId));
  }

  const jarjestetty = [...urlit].sort((a, b) =>
    naytaDokumenttiOtsikko(byUrl.get(a) ?? stubDokumenttiRivi(hankeId, a)).localeCompare(
      naytaDokumenttiOtsikko(byUrl.get(b) ?? stubDokumenttiRivi(hankeId, b)),
      "fi",
    ),
  );

  const rivit = jarjestetty.map((url) => {
    const dokumentti = byUrl.get(url) ?? stubDokumenttiRivi(hankeId, url);
    const aliasDokumentit = dokumentit.filter(
      (d) => kanoninenDokumenttiUrl(d, byId) === url || d.url === url,
    );
    const viimeisin_haku_pvm = viimeisinAsiakirjaHakuPvm(dokumentti, kaikkiLahteet);
    const kattaa =
      aliasDokumentit.length > 1
        ? asiakirjanKayttoMonelle(
            kaikkiLahteet,
            aliasDokumentit.map((d) => ({ id: d.id, url: d.url })),
          )
        : asiakirjanKaytto(kaikkiLahteet, dokumentti);
    return {
      ...dokumentti,
      kattaa,
      viimeisin_haku_pvm,
      meta_teksti: asiakirjaMetataInfo({
        laji: dokumentti.laji,
        muoto: dokumentti.muoto,
        kieli: dokumentti.kieli,
        julkaisija: dokumentti.julkaisija,
        julkaistu_pvm: dokumentti.julkaistu_pvm,
        viimeisin_haku_pvm,
      }),
    };
  });

  return yhdistaSamannimisetAsiakirjat(rivit, kaikkiLahteet);
}

export function asiakirjanKaytto(lahteet: KenttaLahde[], dokumentti: Dokumentti): AsiakirjanKaytto[] {
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
  tarkistukset: KenttaTarkistus[];
  paatokset: PaatosNakyma[];
  paatosLahteet: KenttaLahde[];
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
    tarkistukset: [],
    paatokset: [],
    paatosLahteet: [],
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
      { data: tarkistukset },
      { data: paatokset },
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
        .select(
          "*, organisaatio:organisaatiot(id, nimi, slug), rooli_meta:hanke_organisaatio_roolit(nimi)",
        )
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
      supabase
        .from("kentta_tarkistukset")
        .select("*")
        .eq("taulu", "hankkeet")
        .eq("rivi_id", id)
        .order("kentta"),
      supabase
        .from("paatokset")
        .select("*, paattava_organisaatio:paattava_organisaatio_id(id, nimi)")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("pvm", { ascending: false }),
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
    const paatosIdt = (paatokset ?? []).map((rivi) => rivi.id);

    const [
      maaraajaLahteet,
      kuntaLahteet,
      menettelyLahteet,
      organisaatiorooliLahteet,
      asiakirjaLahteet,
      johtoLahteet,
      vaihtoehtoLahteet,
      kuvaLahteet,
      paatosLahteet,
    ] = await Promise.all([
        haeRiviLahteet("maaraajat", maaraajaIdt),
        haeRiviLahteet("hanke_kunnat", kuntaIdt),
        haeRiviLahteet("hanke_menettelyt", menettelyIdt),
        haeRiviLahteet("hanke_organisaatiot", orgRooliIdt),
        haeRiviLahteet("dokumentit", dokumenttiIdt),
        haeRiviLahteet("hanke_johdot", johtoIdt),
        haeRiviLahteet("hanke_vaihtoehdot", vaihtoehtoIdt),
        haeRiviLahteet("hanke_kuvat", kuvaIdt),
        haeRiviLahteet("paatokset", paatosIdt),
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
      ...paatosLahteet,
    ];
    const paatosNakyma = (paatokset ?? []) as PaatosNakyma[];

    const perusDokumentit = (dokumentit ?? []) as Dokumentti[];
    const faktUrllit = hankkeenFaktalahdeUrllit(kaikkiLahteet);
    const puuttuvatUrllit = faktUrllit.filter(
      (url) => !perusDokumentit.some((d) => d.url === url),
    );
    const urleista = await haeDokumentitUrleille(supabase, puuttuvatUrllit);
    const yhdistetty = new Map<string, Dokumentti>();
    for (const d of [...perusDokumentit, ...urleista]) yhdistetty.set(d.url, d);
    const asiakirjat = kokoaHankeAsiakirjat(kaikkiLahteet, [...yhdistetty.values()], id);

    return {
      hanke: {
        ...(hanke as Omit<
          HankeListalla,
          "vaihtoehdot" | "vanhin_vahvistettu_pvm" | "viimeisin_paatos"
        >),
        vaihtoehdot: (vaihtoehdot ?? []) as HankeVaihtoehto[],
        vanhin_vahvistettu_pvm: vanhinVahvistettuPvm(kaikkiLahteet),
        viimeisin_paatos: viimeisinPaatos(paatosNakyma),
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
      tarkistukset: (tarkistukset ?? []) as KenttaTarkistus[],
      paatokset: paatosNakyma,
      paatosLahteet,
      virhe: null,
    };
  } catch (syy) {
    return { ...tyhja, virhe: virheViesti(syy) };
  }
}

export async function haeTulevatMaaraajat(opts?: {
  raja?: number;
  alku?: number;
  kunta?: string;
  vaihe?: HankeVaihe;
}): Promise<{
  maaraajat: TulevaMaaraaika[];
  maara: number;
  virhe: string | null;
}> {
  noStore();
  if (!supabaseYmparistoAsetettu()) {
    return { maaraajat: [], maara: 0, virhe: "Määräaikoja ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const tanaan = tanaanSuomessa();
    const alku = opts?.alku ?? 0;
    const raja = opts?.raja ?? 20;
    let kysely = supabase
      .from("maaraajat")
      .select("*, hanke:hankkeet!inner(id, nimi, kunta, vaihe)", { count: "exact" })
      .eq("julkaistu", true)
      .gte("paattyy_pvm", tanaan)
      .or(`alkaa_pvm.is.null,alkaa_pvm.lte.${tanaan}`)
      .order("paattyy_pvm", { ascending: true });
    if (opts?.kunta) kysely = kysely.eq("hanke.kunta", opts.kunta);
    if (opts?.vaihe) kysely = kysely.eq("hanke.vaihe", opts.vaihe);
    const { data, error, count } = await kysely.range(alku, alku + raja - 1);

    if (error) return { maaraajat: [], maara: 0, virhe: error.message };
    return {
      maaraajat: (data ?? []) as TulevaMaaraaika[],
      maara: count ?? 0,
      virhe: null,
    };
  } catch (syy) {
    return { maaraajat: [], maara: 0, virhe: virheViesti(syy) };
  }
}

const MUUTOS_SARAKKEET =
  "id, kentta, uusi_arvo, hyvaksytty_pvm, lahde_url, lahde_otsikko, hanke:hankkeet!inner(id, nimi, kunta, vaihe)";

export async function haeJulkaistutMuutokset(opts?: {
  raja?: number;
  alku?: number;
  kunta?: string;
  vaihe?: HankeVaihe;
}): Promise<{
  muutokset: JulkaistuMuutosNakyma[];
  maara: number;
  virhe: string | null;
}> {
  noStore();
  if (!supabaseYmparistoAsetettu()) {
    return { muutokset: [], maara: 0, virhe: "Muutoksia ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const alku = opts?.alku ?? 0;
    const raja = opts?.raja ?? 20;
    let kysely = supabase
      .from("julkaistut_muutokset")
      .select(MUUTOS_SARAKKEET, { count: "exact" })
      .order("hyvaksytty_pvm", { ascending: false })
      .order("id", { ascending: false });
    if (opts?.kunta) kysely = kysely.eq("hanke.kunta", opts.kunta);
    if (opts?.vaihe) kysely = kysely.eq("hanke.vaihe", opts.vaihe);
    const { data, error, count } = await kysely.range(alku, alku + raja - 1);
    if (error) return { muutokset: [], maara: 0, virhe: error.message };
    return {
      muutokset: (data ?? []) as unknown as JulkaistuMuutosNakyma[],
      maara: count ?? 0,
      virhe: null,
    };
  } catch (syy) {
    return { muutokset: [], maara: 0, virhe: virheViesti(syy) };
  }
}

export async function haeKaikkiJulkaistutMuutokset(opts?: {
  kunta?: string;
}): Promise<{
  muutokset: JulkaistuMuutosNakyma[];
  virhe: string | null;
}> {
  const rivit: JulkaistuMuutosNakyma[] = [];
  for (let alku = 0; ; alku += 1000) {
    const { muutokset, virhe } = await haeJulkaistutMuutokset({
      raja: 1000,
      alku,
      kunta: opts?.kunta,
    });
    if (virhe) return { muutokset: [], virhe };
    rivit.push(...muutokset);
    if (muutokset.length < 1000) return { muutokset: rivit, virhe: null };
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
      .select(
        "id, nimi, y_tunnus, tyyppi, verkko_osoite, verkkotunnus, slug, lei, lei_tila, lei_paivitetty_pvm, lei_haettu_pvm, maa, rekisterinumero, rekisteriviranomainen, julkaistu, luotu_pvm, paivitetty_pvm",
      )
      .eq("julkaistu", true)
      .order("nimi", { ascending: true });
    if (tyyppi) {
      kysely = kysely.eq("tyyppi", tyyppi);
    }
    const { data, error } = await kysely;
    if (error) return { organisaatiot: [], virhe: error.message };
    return {
      organisaatiot: (data ?? []).map((r) => ({
        ...r,
        gleif_suora_emo_poikkeus: null,
        gleif_ylin_emo_poikkeus: null,
      })) as Organisaatio[],
      virhe: null,
    };
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
      .select(
        "id, nimi, y_tunnus, tyyppi, verkko_osoite, verkkotunnus, slug, lei, lei_tila, lei_paivitetty_pvm, lei_haettu_pvm, maa, rekisterinumero, rekisteriviranomainen, julkaistu, luotu_pvm, paivitetty_pvm",
      )
      .eq("id", id)
      .eq("julkaistu", true)
      .maybeSingle();
    if (error) return { ...tyhja, virhe: error.message };
    if (!organisaatio) return tyhja;
    const organisaatioJulkinen = {
      ...organisaatio,
      gleif_suora_emo_poikkeus: null,
      gleif_ylin_emo_poikkeus: null,
    } as Organisaatio;

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
    for (const hanke of (vastaavana ?? []) as Omit<
      HankeListalla,
      "vaihtoehdot" | "vanhin_vahvistettu_pvm" | "viimeisin_paatos"
    >[]) {
      hankkeetKartta.set(hanke.id, {
        ...hanke,
        vaihtoehdot: [],
        vanhin_vahvistettu_pvm: null,
        viimeisin_paatos: null,
        roolit: ["toimija"],
      });
    }
    for (const rivi of roolirivit ?? []) {
      const raaka = rivi as unknown as {
        rooli: HankeOrganisaatioRooli;
        hanke: Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm" | "viimeisin_paatos"> | Omit<HankeListalla, "vaihtoehdot" | "vanhin_vahvistettu_pvm" | "viimeisin_paatos">[] | null;
      };
      const hankePohja = Array.isArray(raaka.hanke) ? (raaka.hanke[0] ?? null) : raaka.hanke;
      const rooli = raaka.rooli;
      if (!hankePohja || !hankePohja.julkaistu) continue;
      const hanke: HankeListalla = {
        ...hankePohja,
        vaihtoehdot: [],
        vanhin_vahvistettu_pvm: null,
        viimeisin_paatos: null,
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
      organisaatio: organisaatioJulkinen,
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

export type KonsulttiListalla = {
  id: string;
  nimi: string;
  slug: string;
  y_tunnus: string | null;
  hankkeita: number;
};

export type KonsulttiHanke = {
  id: string;
  nimi: string;
  kunta: string;
  vaihe: HankeVaihe;
  rooli: string;
  sijainti_lat: number | null;
  sijainti_lon: number | null;
  teho_mw: number | null;
  it_teho_mw: number | null;
  sijainti_alue: Hanke["sijainti_alue"];
  sijainti_alue_tyyppi: Hanke["sijainti_alue_tyyppi"];
  lahde_url: string | null;
  lahde_kohta: string | null;
  lahde_dokumentti_id: string | null;
  dokumentti_otsikko: string | null;
};

export type KonsulttiRooliryhma = {
  rooli: string;
  konsultit: KonsulttiListalla[];
};

function jarjestaKonsultitNimella(a: KonsulttiListalla, b: KonsulttiListalla): number {
  return a.nimi.localeCompare(b.nimi, "fi");
}

/** Organisaatiot rooleittain (YVA / kaava / lupa). */
export async function haeKonsultitJoissaHankkeita(): Promise<{
  ryhmat: KonsulttiRooliryhma[];
  /** Yhteensä organisaatioita (uniikit). */
  konsultit: KonsulttiListalla[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { ryhmat: [], konsultit: [], virhe: "Konsultteja ei juuri nyt voitu hakea." };
  }
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("hanke_organisaatiot")
      .select(
        "rooli, organisaatio_id, organisaatio:organisaatiot!inner(id, nimi, slug, y_tunnus, julkaistu), hanke:hankkeet!inner(id, julkaistu)",
      )
      .eq("julkaistu", true)
      .in("rooli", [...KONSULTTI_HAKU_ROOLIT])
      .eq("organisaatio.julkaistu", true)
      .eq("hanke.julkaistu", true);
    if (error) return { ryhmat: [], konsultit: [], virhe: error.message };

    type Kasassa = KonsulttiListalla & { hankeIdt: Set<string> };
    const perRooli = new Map<string, Map<string, Kasassa>>();
    const kaikki = new Map<string, Kasassa>();

    for (const rivi of data ?? []) {
      const org = rivi.organisaatio as unknown as {
        id: string;
        nimi: string;
        slug: string;
        y_tunnus: string | null;
      };
      const hanke = rivi.hanke as unknown as { id: string };
      const rooli = normalisoiKonsulttiSivuRooli(rivi.rooli as string);

      let rooliKartta = perRooli.get(rooli);
      if (!rooliKartta) {
        rooliKartta = new Map();
        perRooli.set(rooli, rooliKartta);
      }
      const aiempiRoolissa = rooliKartta.get(org.id);
      if (aiempiRoolissa) {
        aiempiRoolissa.hankeIdt.add(hanke.id);
        aiempiRoolissa.hankkeita = aiempiRoolissa.hankeIdt.size;
      } else {
        rooliKartta.set(org.id, {
          id: org.id,
          nimi: org.nimi,
          slug: org.slug,
          y_tunnus: org.y_tunnus,
          hankkeita: 1,
          hankeIdt: new Set([hanke.id]),
        });
      }

      const aiempi = kaikki.get(org.id);
      if (aiempi) {
        aiempi.hankeIdt.add(hanke.id);
        aiempi.hankkeita = aiempi.hankeIdt.size;
      } else {
        kaikki.set(org.id, {
          id: org.id,
          nimi: org.nimi,
          slug: org.slug,
          y_tunnus: org.y_tunnus,
          hankkeita: 1,
          hankeIdt: new Set([hanke.id]),
        });
      }
    }

    const ryhmat: KonsulttiRooliryhma[] = KONSULTTI_SIVU_ROOLI_JARJESTYS.map((rooli) => ({
      rooli,
      konsultit: [...(perRooli.get(rooli)?.values() ?? [])]
        .map(({ hankeIdt: _h, ...rivi }) => rivi)
        .sort(jarjestaKonsultitNimella),
    }));

    const konsultit = [...kaikki.values()]
      .map(({ hankeIdt: _h, ...rivi }) => rivi)
      .sort(jarjestaKonsultitNimella);
    return { ryhmat, konsultit, virhe: null };
  } catch (syy) {
    return { ryhmat: [], konsultit: [], virhe: virheViesti(syy) };
  }
}

export async function haeKonsulttiSlugilla(slug: string): Promise<{
  konsultti: KonsulttiListalla | null;
  hankkeet: KonsulttiHanke[];
  ryhmat: { rooli: string; nimi: string; hankkeet: KonsulttiHanke[] }[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return {
      konsultti: null,
      hankkeet: [],
      ryhmat: [],
      virhe: "Konsulttia ei juuri nyt voitu hakea.",
    };
  }
  try {
    const supabase = await luoPalvelinAsiakas();
    const { data: org, error: orgVirhe } = await supabase
      .from("organisaatiot")
      .select("id, nimi, slug, y_tunnus")
      .eq("slug", slug)
      .eq("julkaistu", true)
      .maybeSingle();
    if (orgVirhe) {
      return { konsultti: null, hankkeet: [], ryhmat: [], virhe: orgVirhe.message };
    }
    if (!org) return { konsultti: null, hankkeet: [], ryhmat: [], virhe: null };

    const { data: roolit, error: rooliVirhe } = await supabase
      .from("hanke_organisaatiot")
      .select(
        "rooli, lahde_url, lahde_kohta, lahde_dokumentti_id, hanke:hankkeet!inner(id, nimi, kunta, vaihe, sijainti_lat, sijainti_lon, teho_mw, it_teho_mw, sijainti_alue, sijainti_alue_tyyppi, julkaistu)",
      )
      .eq("organisaatio_id", org.id)
      .eq("julkaistu", true)
      .in("rooli", [...KONSULTTI_HAKU_ROOLIT])
      .eq("hanke.julkaistu", true);
    if (rooliVirhe) {
      return { konsultti: null, hankkeet: [], ryhmat: [], virhe: rooliVirhe.message };
    }

    const dokIdt = [
      ...new Set(
        (roolit ?? [])
          .map((r) => r.lahde_dokumentti_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const otsikot = new Map<string, string>();
    if (dokIdt.length > 0) {
      const { data: dokit } = await supabase
        .from("dokumentit")
        .select("id, otsikko")
        .in("id", dokIdt);
      for (const d of dokit ?? []) otsikot.set(d.id as string, d.otsikko as string);
    }

    const hankkeetKartta = new Map<string, KonsulttiHanke>();
    for (const rivi of roolit ?? []) {
      const h = rivi.hanke as unknown as {
        id: string;
        nimi: string;
        kunta: string;
        vaihe: HankeVaihe;
        sijainti_lat: number | null;
        sijainti_lon: number | null;
        teho_mw: number | null;
        it_teho_mw: number | null;
        sijainti_alue: Hanke["sijainti_alue"];
        sijainti_alue_tyyppi: Hanke["sijainti_alue_tyyppi"];
      };
      const rooli = normalisoiKonsulttiSivuRooli(rivi.rooli as string);
      const avain = `${h.id}:${rooli}`;
      if (hankkeetKartta.has(avain)) continue;
      hankkeetKartta.set(avain, {
        id: h.id,
        nimi: h.nimi,
        kunta: h.kunta,
        vaihe: h.vaihe,
        rooli,
        sijainti_lat: h.sijainti_lat,
        sijainti_lon: h.sijainti_lon,
        teho_mw: h.teho_mw,
        it_teho_mw: h.it_teho_mw,
        sijainti_alue: h.sijainti_alue,
        sijainti_alue_tyyppi: h.sijainti_alue_tyyppi,
        lahde_url: (rivi.lahde_url as string | null) ?? null,
        lahde_kohta: (rivi.lahde_kohta as string | null) ?? null,
        lahde_dokumentti_id: (rivi.lahde_dokumentti_id as string | null) ?? null,
        dokumentti_otsikko: rivi.lahde_dokumentti_id
          ? (otsikot.get(rivi.lahde_dokumentti_id as string) ?? null)
          : null,
      });
    }
    const hankkeet = [...hankkeetKartta.values()].sort((a, b) =>
      a.nimi.localeCompare(b.nimi, "fi"),
    );

    const ryhmat = KONSULTTI_SIVU_ROOLI_JARJESTYS.map((rooli) => ({
      rooli,
      nimi: hankeOrganisaatioRooliNimi(rooli),
      hankkeet: hankkeet
        .filter((h) => h.rooli === rooli)
        .sort((a, b) => a.nimi.localeCompare(b.nimi, "fi")),
    })).filter((r) => r.hankkeet.length > 0);

    const uniikitHankkeet = new Set(hankkeet.map((h) => h.id));

    return {
      konsultti: {
        id: org.id as string,
        nimi: org.nimi as string,
        slug: org.slug as string,
        y_tunnus: org.y_tunnus as string | null,
        hankkeita: uniikitHankkeet.size,
      },
      hankkeet,
      ryhmat,
      virhe: null,
    };
  } catch (syy) {
    return { konsultti: null, hankkeet: [], ryhmat: [], virhe: virheViesti(syy) };
  }
}
