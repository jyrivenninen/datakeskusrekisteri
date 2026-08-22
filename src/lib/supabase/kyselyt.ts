import { luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { supabaseYmparistoAsetettu } from "@/lib/supabase/ymparisto";
import type {
  Hanke,
  HankeVaihe,
  KenttaLahde,
  Maaraaja,
  Organisaatio,
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
    return { hankkeet: [], virhe: "Tietokantayhteyttä ei ole määritetty." };
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
    return { ...tyhja, virhe: "Tietokantayhteyttä ei ole määritetty." };
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
    return { maaraajat: [], virhe: "Tietokantayhteyttä ei ole määritetty." };
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
