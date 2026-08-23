import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";
import type {
  Hanke,
  HankeVaihe,
  KenttaLahde,
  Maaraaja,
  Organisaatio,
  OrganisaatioTyyppi,
  Yhteyshenkilo,
} from "@/lib/supabase/tietokanta";
import { hankeKokoLuokka, type KokoLuokka } from "@/lib/naytto";

export type HankeListalla = Hanke & {
  toimija: Pick<Organisaatio, "id" | "nimi"> | null;
};

export type HankeSuodatus = {
  kunta?: string;
  vaihe?: HankeVaihe;
  koko?: KokoLuokka;
};

export type TulevaMaaraaika = Maaraaja & {
  hanke: Pick<Hanke, "id" | "nimi" | "kunta">;
};

function virheViesti(syy: unknown): string {
  if (syy instanceof Error) return syy.message;
  return "Tietokantakysely epäonnistui.";
}

export async function haeJulkaistutHankkeet(
  suodatus: HankeSuodatus = {},
): Promise<{ hankkeet: HankeListalla[]; virhe: string | null }> {
  if (!supabaseYmparistoAsetettu()) {
    return { hankkeet: [], virhe: "Julkaistuja hankkeita ei juuri nyt voitu hakea." };
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
    if (error) return { hankkeet: [], virhe: error.message };

    let hankkeet = (data ?? []) as HankeListalla[];
    if (suodatus.koko) {
      hankkeet = hankkeet.filter((hanke) => hankeKokoLuokka(hanke) === suodatus.koko);
    }
    return { hankkeet, virhe: null };
  } catch (syy) {
    return { hankkeet: [], virhe: virheViesti(syy) };
  }
}

export async function haeHanke(id: string): Promise<{
  hanke: HankeListalla | null;
  lahteet: KenttaLahde[];
  maaraajat: Maaraaja[];
  maaraajaLahteet: KenttaLahde[];
  yhteyshenkilot: (Yhteyshenkilo & {
    organisaatio: Pick<Organisaatio, "nimi"> | null;
  })[];
  virhe: string | null;
}> {
  const tyhja = {
    hanke: null,
    lahteet: [],
    maaraajat: [],
    maaraajaLahteet: [],
    yhteyshenkilot: [],
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

    const [{ data: lahteet }, { data: maaraajat }, { data: henkilot }] = await Promise.all([
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
        .from("yhteyshenkilot")
        .select("*, organisaatio:organisaatiot(nimi)")
        .eq("hanke_id", id)
        .eq("julkaistu", true)
        .order("nimi"),
    ]);

    const maaraajaIdt = (maaraajat ?? []).map((rivi) => rivi.id);
    let maaraajaLahteet: KenttaLahde[] = [];
    if (maaraajaIdt.length > 0) {
      const { data } = await supabase
        .from("kentta_lahteet")
        .select("*")
        .eq("taulu", "maaraajat")
        .in("rivi_id", maaraajaIdt);
      maaraajaLahteet = (data ?? []) as KenttaLahde[];
    }

    return {
      hanke: hanke as HankeListalla,
      lahteet: (lahteet ?? []) as KenttaLahde[],
      maaraajat: (maaraajat ?? []) as Maaraaja[],
      maaraajaLahteet,
      yhteyshenkilot: (henkilot ?? []) as (Yhteyshenkilo & {
        organisaatio: Pick<Organisaatio, "nimi"> | null;
      })[],
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

export type YhteyshenkiloHakemistossa = Yhteyshenkilo & {
  organisaatio: Pick<Organisaatio, "id" | "nimi" | "tyyppi"> | null;
  hanke: Pick<Hanke, "id" | "nimi" | "kunta"> | null;
};

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

export async function haeJulkaistutYhteyshenkilot(): Promise<{
  henkilot: YhteyshenkiloHakemistossa[];
  virhe: string | null;
}> {
  if (!supabaseYmparistoAsetettu()) {
    return { henkilot: [], virhe: "Yhteyshenkilöitä ei juuri nyt voitu hakea." };
  }

  try {
    const supabase = await luoPalvelinAsiakas();
    const { data, error } = await supabase
      .from("yhteyshenkilot")
      .select(
        "*, organisaatio:organisaatiot(id, nimi, tyyppi), hanke:hankkeet(id, nimi, kunta)",
      )
      .eq("julkaistu", true)
      .order("nimi", { ascending: true });
    if (error) return { henkilot: [], virhe: error.message };
    return { henkilot: (data ?? []) as YhteyshenkiloHakemistossa[], virhe: null };
  } catch (syy) {
    return { henkilot: [], virhe: virheViesti(syy) };
  }
}

export async function haeOrganisaatio(id: string): Promise<{
  organisaatio: Organisaatio | null;
  hankkeet: HankeListalla[];
  henkilot: YhteyshenkiloHakemistossa[];
  virhe: string | null;
}> {
  const tyhja = {
    organisaatio: null,
    hankkeet: [] as HankeListalla[],
    henkilot: [] as YhteyshenkiloHakemistossa[],
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

    const [{ data: hankkeet }, { data: henkilot }] = await Promise.all([
      supabase
        .from("hankkeet")
        .select("*, toimija:toimija_organisaatio_id(id, nimi)")
        .eq("julkaistu", true)
        .eq("toimija_organisaatio_id", id)
        .order("nimi", { ascending: true }),
      supabase
        .from("yhteyshenkilot")
        .select(
          "*, organisaatio:organisaatiot(id, nimi, tyyppi), hanke:hankkeet(id, nimi, kunta)",
        )
        .eq("julkaistu", true)
        .eq("organisaatio_id", id)
        .order("nimi", { ascending: true }),
    ]);

    return {
      organisaatio: organisaatio as Organisaatio,
      hankkeet: (hankkeet ?? []) as HankeListalla[],
      henkilot: (henkilot ?? []) as YhteyshenkiloHakemistossa[],
      virhe: null,
    };
  } catch (syy) {
    return { ...tyhja, virhe: virheViesti(syy) };
  }
}
