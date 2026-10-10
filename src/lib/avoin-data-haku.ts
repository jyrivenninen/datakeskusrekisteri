/**
 * Koko julkaistun rekisterin kooste avoimeen dataan.
 * Yksi sivutettu kyselyerä taulua kohden, ei hanke kerrallaan.
 */

import { rakennaAvoinDataHanke, type AvoinDataHanke } from "@/lib/avoin-data";
import { vanhinVahvistettuPvm, viimeisinPaatos } from "@/lib/naytto";
import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import {
  asiakirjanKaytto,
  type HankeAsiakirja,
  type HankeOrganisaatioNakyma,
} from "@/lib/supabase/kyselyt";
import type { haeHanke } from "@/lib/supabase/kyselyt";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";
import type {
  Dokumentti,
  HankeJohto,
  HankeKunta,
  HankeKuva,
  HankeMenettely,
  HankeVaihtoehto,
  KenttaLahde,
  KenttaTarkistus,
  Maaraaja,
  PaatosNakyma,
} from "@/lib/supabase/tietokanta";
import type { HankeListalla } from "@/lib/supabase/kyselyt";

type HankeKysely = Awaited<ReturnType<typeof haeHanke>>;
type Sivutettu<T> = { data: T[] | null; error: { message: string } | null };

const SIVU = 1000;

async function haeSivuttain<T>(
  kysy: (alku: number, loppu: number) => PromiseLike<Sivutettu<T>>,
): Promise<T[]> {
  const rivit: T[] = [];
  for (let alku = 0; ; alku += SIVU) {
    const { data, error } = await kysy(alku, alku + SIVU - 1);
    if (error) throw new Error(error.message);
    const era = data ?? [];
    rivit.push(...era);
    if (era.length < SIVU) return rivit;
  }
}

function ryhmittele<T extends { hanke_id: string | null }>(rivit: T[]): Map<string, T[]> {
  const kartta = new Map<string, T[]>();
  for (const rivi of rivit) {
    if (!rivi.hanke_id) continue;
    const lista = kartta.get(rivi.hanke_id) ?? [];
    lista.push(rivi);
    kartta.set(rivi.hanke_id, lista);
  }
  return kartta;
}

function lahdeAvain(taulu: string, riviId: string): string {
  return `${taulu}:${riviId}`;
}

function lahteetIdlle(
  lahteet: Map<string, KenttaLahde[]>,
  taulu: KenttaLahde["taulu"],
  idt: string[],
): KenttaLahde[] {
  const rivit = idt.flatMap((id) => lahteet.get(lahdeAvain(taulu, id)) ?? []);
  return rivit.sort((a, b) => a.kentta.localeCompare(b.kentta, "fi"));
}

export async function haeAvoinDataHankkeet(juuriUrl: string): Promise<{
  hankkeet: AvoinDataHanke[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { hankkeet: [], virhe: "Julkaistuja hankkeita ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const [
      hankkeet,
      lahteet,
      maaraajat,
      kunnat,
      menettelyt,
      organisaatiot,
      dokumentit,
      johdot,
      vaihtoehdot,
      kuvat,
      tarkistukset,
      paatokset,
    ] = await Promise.all([
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hankkeet")
            .select("*, toimija:toimija_organisaatio_id(id, nimi)")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeListalla>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("kentta_lahteet")
            .select("*")
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<KenttaLahde>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("maaraajat")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<Maaraaja>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hanke_kunnat")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeKunta>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hanke_menettelyt")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeMenettely>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hanke_organisaatiot")
            .select(
              "*, organisaatio:organisaatiot(id, nimi), rooli_meta:hanke_organisaatio_roolit(nimi)",
            )
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeOrganisaatioNakyma>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("dokumentit")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<Dokumentti>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hanke_johdot")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeJohto>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hanke_vaihtoehdot")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeVaihtoehto>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("hanke_kuvat")
            .select("*")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<HankeKuva>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("kentta_tarkistukset")
            .select("*")
            .eq("taulu", "hankkeet")
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<KenttaTarkistus & { hanke_id?: string | null }>>,
      ),
      haeSivuttain(
        (alku, loppu) =>
          supabase
            .from("paatokset")
            .select("*, paattava_organisaatio:paattava_organisaatio_id(id, nimi)")
            .eq("julkaistu", true)
            .order("id")
            .range(alku, loppu) as PromiseLike<Sivutettu<PaatosNakyma>>,
      ),
    ]);

    const lahdeKartta = new Map<string, KenttaLahde[]>();
    for (const lahde of lahteet) {
      const avain = lahdeAvain(lahde.taulu, lahde.rivi_id);
      const lista = lahdeKartta.get(avain) ?? [];
      lista.push(lahde);
      lahdeKartta.set(avain, lista);
    }

    const maaraajaKartta = ryhmittele(maaraajat);
    const kuntaKartta = ryhmittele(kunnat);
    const menettelyKartta = ryhmittele(menettelyt);
    const organisaatioKartta = ryhmittele(organisaatiot);
    const dokumenttiKartta = ryhmittele(dokumentit);
    const johtoKartta = ryhmittele(johdot);
    const vaihtoehtoKartta = ryhmittele(vaihtoehdot);
    const kuvaKartta = ryhmittele(kuvat);
    const paatosKartta = ryhmittele(paatokset);
    const tarkistusKartta = new Map<string, KenttaTarkistus[]>();
    for (const tarkistus of tarkistukset) {
      const lista = tarkistusKartta.get(tarkistus.rivi_id) ?? [];
      lista.push(tarkistus);
      tarkistusKartta.set(tarkistus.rivi_id, lista);
    }

    const jarjestetyt = [...hankkeet].sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"));
    const avoimet: AvoinDataHanke[] = [];

    for (const pohja of jarjestetyt) {
      const id = pohja.id;
      const hankeMaaraajat = (maaraajaKartta.get(id) ?? []).sort((a, b) =>
        a.paattyy_pvm.localeCompare(b.paattyy_pvm),
      );
      const hankeKunnat = (kuntaKartta.get(id) ?? []).sort((a, b) =>
        a.kunta.localeCompare(b.kunta, "fi"),
      );
      const hankeMenettelyt = (menettelyKartta.get(id) ?? []).sort((a, b) =>
        a.laji.localeCompare(b.laji, "fi"),
      );
      const hankeOrganisaatiot = (organisaatioKartta.get(id) ?? []).sort((a, b) =>
        a.rooli.localeCompare(b.rooli, "fi"),
      );
      const hankeDokumentit = (dokumenttiKartta.get(id) ?? []).sort((a, b) =>
        a.otsikko.localeCompare(b.otsikko, "fi"),
      );
      const hankeJohdot = (johtoKartta.get(id) ?? []).sort((a, b) =>
        (a.vaihtoehto ?? "").localeCompare(b.vaihtoehto ?? "", "fi"),
      );
      const hankeVaihtoehdot = (vaihtoehtoKartta.get(id) ?? []).sort((a, b) =>
        a.tunnus.localeCompare(b.tunnus, "fi"),
      );
      const hankeKuvat = (kuvaKartta.get(id) ?? []).sort((a, b) => a.jarjestys - b.jarjestys);
      const hankePaatokset = (paatosKartta.get(id) ?? []).sort((a, b) => {
        if (a.pvm !== b.pvm) return b.pvm.localeCompare(a.pvm);
        return b.luotu_pvm.localeCompare(a.luotu_pvm);
      });
      const hankeTarkistukset = (tarkistusKartta.get(id) ?? []).sort((a, b) =>
        a.kentta.localeCompare(b.kentta, "fi"),
      );

      const hankeLahteet = lahteetIdlle(lahdeKartta, "hankkeet", [id]);
      const maaraajaLahteet = lahteetIdlle(
        lahdeKartta,
        "maaraajat",
        hankeMaaraajat.map((rivi) => rivi.id),
      );
      const kuntaLahteet = lahteetIdlle(
        lahdeKartta,
        "hanke_kunnat",
        hankeKunnat.map((rivi) => rivi.id),
      );
      const menettelyLahteet = lahteetIdlle(
        lahdeKartta,
        "hanke_menettelyt",
        hankeMenettelyt.map((rivi) => rivi.id),
      );
      const organisaatiorooliLahteet = lahteetIdlle(
        lahdeKartta,
        "hanke_organisaatiot",
        hankeOrganisaatiot.map((rivi) => rivi.id),
      );
      const asiakirjaLahteet = lahteetIdlle(
        lahdeKartta,
        "dokumentit",
        hankeDokumentit.map((rivi) => rivi.id),
      );
      const johtoLahteet = lahteetIdlle(
        lahdeKartta,
        "hanke_johdot",
        hankeJohdot.map((rivi) => rivi.id),
      );
      const vaihtoehtoLahteet = lahteetIdlle(
        lahdeKartta,
        "hanke_vaihtoehdot",
        hankeVaihtoehdot.map((rivi) => rivi.id),
      );
      const kuvaLahteet = lahteetIdlle(
        lahdeKartta,
        "hanke_kuvat",
        hankeKuvat.map((rivi) => rivi.id),
      );
      const paatosLahteet = lahteetIdlle(
        lahdeKartta,
        "paatokset",
        hankePaatokset.map((rivi) => rivi.id),
      );
      const kaikkiLahteet = [
        ...hankeLahteet,
        ...maaraajaLahteet,
        ...kuntaLahteet,
        ...menettelyLahteet,
        ...organisaatiorooliLahteet,
        ...johtoLahteet,
        ...vaihtoehtoLahteet,
        ...kuvaLahteet,
        ...paatosLahteet,
      ];
      const asiakirjat: HankeAsiakirja[] = hankeDokumentit.map((dokumentti) => ({
        ...dokumentti,
        kattaa: asiakirjanKaytto(kaikkiLahteet, dokumentti),
      }));

      const kysely: HankeKysely = {
        hanke: {
          ...pohja,
          vaihtoehdot: hankeVaihtoehdot,
          vanhin_vahvistettu_pvm: vanhinVahvistettuPvm(kaikkiLahteet),
          viimeisin_paatos: viimeisinPaatos(hankePaatokset),
        },
        lahteet: hankeLahteet,
        kunnat: hankeKunnat,
        kuntaLahteet,
        menettelyt: hankeMenettelyt,
        menettelyLahteet,
        organisaatioroolit: hankeOrganisaatiot,
        organisaatiorooliLahteet,
        maaraajat: hankeMaaraajat,
        maaraajaLahteet,
        asiakirjat,
        asiakirjaLahteet,
        johdot: hankeJohdot,
        johtoLahteet,
        vaihtoehdot: hankeVaihtoehdot,
        vaihtoehtoLahteet,
        kuvat: hankeKuvat,
        kuvaLahteet,
        tarkistukset: hankeTarkistukset,
        paatokset: hankePaatokset,
        paatosLahteet,
        virhe: null,
      };
      const rivi = rakennaAvoinDataHanke(kysely, juuriUrl);
      if (rivi) avoimet.push(rivi);
    }

    return { hankkeet: avoimet, virhe: null };
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Tietokantakysely epäonnistui.";
    return { hankkeet: [], virhe: viesti };
  }
}
