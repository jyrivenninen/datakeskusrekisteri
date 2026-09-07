/**
 * 7B.3 Muutosten tiivistäjä — tiivistää dokumenttivahdin havainnot.
 *
 * Ajetaan vain kun 7A.2 on luonut dokumentti_muuttunut-ehdotuksen.
 * Vertaa vanhaa ja uutta tekstiä, kertoo mitä muuttui ja koskeeko
 * muutos tallennettuja kenttiä. Ei päivitä kenttiä.
 *
 * Ympäristö:
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - MALLI_* ja GEMINI_API_KEY
 * - TIIVISTAJA_KUIVA=1, TIIVISTAJA_KATTO (oletus 5)
 * - TIIVISTAJA_EHDOTUS_ID (yksittäinen ehdotus)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noudaDokumenttiTeksti } from "./dokumentti-teksti";
import { kysyMallia } from "./malli";
import { robotsSallii } from "./tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "./ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; tiivistaja)";
const EHDOTTAJA = "agents/tiivistaja";
const SOVITIN = "tiivistaja";
const TEKSTI_KATTO = 80_000;

const JARJESTELMA = `Olet dokumenttimuutosten tiivistäjä. Vertaa vanhaa ja uutta tekstiä.
Kerro lyhyesti mitä muuttui. Arvioi koskeeko muutos jotain listatuista
hanketiedoista — vain jos muutos on selvästi relevantti.
Älä ehdota uusia arvoja. Palauta vain JSON ilman markdownia:
{"yhteenveto":"...","koskee_kenttia":["kentta_nimi"]|[],"perustelu":"..."}`;

const KENTTA_NIMET: Record<string, string> = {
  nimi: "Nimi",
  kunta: "Kunta",
  maakunta: "Maakunta",
  vaihe: "Vaihe",
  teho_mw: "Teho (MW)",
  it_teho_mw: "IT-teho (MW)",
  pinta_ala_ha: "Pinta-ala (ha)",
  sahkonkaytto_twh_a: "Sähkönkäyttö (TWh/a)",
  generaattorit_lkm: "Varavoimageneraattorit (kpl)",
  generaattorit_kaytossa_max_lkm: "Generaattoreita yhtä aikaa enintään (kpl)",
  generaattori_polttoaineteho_mw: "Generaattorin polttoaineteho (MW)",
  yva_diaarinumero: "YVA-diaarinumero",
  kaavatunnus: "Kaavatunnus",
  kortteli: "Kortteli",
};

export type TiivistysTulos = {
  yhteenveto: string;
  koskee_kenttia: string[];
  perustelu: string;
};

type DokumenttiLohko = {
  dokumentti_id: string;
  otsikko: string;
  vanha_tiiviste: string | null;
  uusi_tiiviste: string;
  merkkimaara: number;
  muoto: string | null;
};

type EhdotusSisalto = {
  kentat: Record<string, unknown>;
  dokumentti?: DokumenttiLohko;
  tiivistys?: TiivistysTulos & { valmis: boolean; kasitelty_pvm: string };
};

type EhdotusRivi = {
  id: string;
  hanke_id: string | null;
  lahde_url: string | null;
  huomautus: string | null;
  sisalto: EhdotusSisalto;
};

type KenttaLahde = {
  kentta: string;
  arvo?: string;
};

function rajaaTeksti(teksti: string): string {
  if (teksti.length <= TEKSTI_KATTO) return teksti;
  return teksti.slice(0, TEKSTI_KATTO);
}

export function parsiiTiivistysVastaus(raaka: string): TiivistysTulos {
  const jsonLohko = raaka.match(/\{[\s\S]*\}/);
  if (!jsonLohko) throw new Error("Mallin vastaus ei ollut JSON.");
  const parsed = JSON.parse(jsonLohko[0]) as {
    yhteenveto?: string;
    koskee_kenttia?: string[];
    perustelu?: string;
  };
  const yhteenveto = parsed.yhteenveto?.trim();
  if (!yhteenveto) throw new Error("Yhteenveto puuttuu mallin vastauksesta.");
  const koskee = Array.isArray(parsed.koskee_kenttia)
    ? parsed.koskee_kenttia.filter((k): k is string => typeof k === "string" && k.trim() !== "")
    : [];
  return {
    yhteenveto,
    koskee_kenttia: koskee,
    perustelu: parsed.perustelu?.trim() ?? "",
  };
}

async function haeVanhaTeksti(
  supabase: SupabaseClient,
  dokumenttiId: string,
  vanhaTiiviste: string | null,
): Promise<string | null> {
  if (!vanhaTiiviste) return null;
  const { data, error } = await supabase
    .from("dokumentti_tiivisteet")
    .select("teksti_katkelma")
    .eq("dokumentti_id", dokumenttiId)
    .eq("tiiviste", vanhaTiiviste)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const katkelma = data?.teksti_katkelma;
  return typeof katkelma === "string" && katkelma.trim() ? katkelma : null;
}

async function haeUusiTeksti(
  supabase: SupabaseClient,
  dokumenttiId: string,
  uusiTiiviste: string,
  url: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("dokumentti_tiivisteet")
    .select("teksti_katkelma")
    .eq("dokumentti_id", dokumenttiId)
    .eq("tiiviste", uusiTiiviste)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.teksti_katkelma && String(data.teksti_katkelma).trim()) {
    return String(data.teksti_katkelma);
  }

  const osoite = new URL(url);
  if (!(await robotsSallii(osoite, USER_AGENT))) return null;
  const nouto = await noudaDokumenttiTeksti(url, { userAgent: USER_AGENT });
  if (nouto.tila >= 400) return null;
  return nouto.teksti.trim() || null;
}

async function haeHankkeenKentat(
  supabase: SupabaseClient,
  hankeId: string | null,
  dokumenttiId: string,
  lahdeUrl: string | null,
): Promise<KenttaLahde[]> {
  if (!hankeId) return [];
  const { data: hankkeesta, error: hankeVirhe } = await supabase
    .from("hankkeet")
    .select("*")
    .eq("id", hankeId)
    .maybeSingle();
  if (hankeVirhe) throw new Error(hankeVirhe.message);
  if (!hankkeesta) return [];

  const { data: lahteet, error: lahdeVirhe } = await supabase
    .from("kentta_lahteet")
    .select("kentta, dokumentti_id, lahde_url")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", hankeId);
  if (lahdeVirhe) throw new Error(lahdeVirhe.message);

  const dokumenttiinLiittyvat = new Set(
    (lahteet ?? [])
      .filter(
        (l) =>
          l.dokumentti_id === dokumenttiId ||
          (lahdeUrl && l.lahde_url === lahdeUrl),
      )
      .map((l) => l.kentta as string),
  );

  const tulokset: KenttaLahde[] = [];
  for (const kentta of Object.keys(KENTTA_NIMET)) {
    const arvo = hankkeesta[kentta as keyof typeof hankkeesta];
    if (arvo == null || arvo === "") continue;
    if (dokumenttiinLiittyvat.size > 0 && !dokumenttiinLiittyvat.has(kentta)) {
      continue;
    }
    tulokset.push({ kentta, arvo: String(arvo) });
  }
  return tulokset;
}

function rakennaKehote(
  dokumentti: DokumenttiLohko,
  vanhaTeksti: string | null,
  uusiTeksti: string,
  kentat: KenttaLahde[],
): string {
  const kenttaLista =
    kentat.length > 0
      ? kentat
          .map(
            (k) =>
              `- ${k.kentta} (${KENTTA_NIMET[k.kentta] ?? k.kentta}): ${k.arvo ?? "?"}`,
          )
          .join("\n")
      : "(ei linkitettyjä kenttiä tai hanketta)";

  const vanhaOsa = vanhaTeksti
    ? rajaaTeksti(vanhaTeksti)
    : "(vanhaa tekstiä ei saatavilla — tiiviste tallennettu ennen katkelmaa)";

  return [
    `Dokumentti: ${dokumentti.otsikko}`,
    `Merkkimäärä nyt: ${dokumentti.merkkimaara}`,
    "",
    "Hankkeen kentät joita muutos voi koskea:",
    kenttaLista,
    "",
    "--- VANHA TEKSTI ---",
    vanhaOsa,
    "",
    "--- UUSI TEKSTI ---",
    rajaaTeksti(uusiTeksti),
  ].join("\n");
}

export async function tiivistaDokumenttiMuutos(
  supabase: SupabaseClient,
  ehdotus: EhdotusRivi,
): Promise<EhdotusSisalto> {
  if (ehdotus.sisalto.tiivistys?.valmis) {
    return ehdotus.sisalto;
  }
  const dokumentti = ehdotus.sisalto.dokumentti;
  if (!dokumentti) {
    throw new Error("Ehdotuksesta puuttuu dokumentti-lohko.");
  }
  const url = ehdotus.lahde_url?.trim();
  if (!url) throw new Error("Ehdotuksesta puuttuu lähde-URL.");

  const vanhaTeksti = await haeVanhaTeksti(
    supabase,
    dokumentti.dokumentti_id,
    dokumentti.vanha_tiiviste,
  );
  const uusiTeksti = await haeUusiTeksti(
    supabase,
    dokumentti.dokumentti_id,
    dokumentti.uusi_tiiviste,
    url,
  );
  if (!uusiTeksti) {
    throw new Error("Uutta tekstiä ei saatu haettua.");
  }

  const kentat = await haeHankkeenKentat(
    supabase,
    ehdotus.hanke_id,
    dokumentti.dokumentti_id,
    url,
  );

  const kehote = rakennaKehote(dokumentti, vanhaTeksti, uusiTeksti, kentat);
  const malli = await kysyMallia(kehote, {
    jarjestelma: JARJESTELMA,
    dokumenttiUrl: url,
  });
  const tulos = parsiiTiivistysVastaus(malli.teksti);

  return {
    ...ehdotus.sisalto,
    tiivistys: {
      ...tulos,
      valmis: true,
      kasitelty_pvm: new Date().toISOString(),
    },
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  const kuiva = process.env.TIIVISTAJA_KUIVA === "1";
  const katto = Number(process.env.TIIVISTAJA_KATTO ?? "5");
  const yksittainen = process.env.TIIVISTAJA_EHDOTUS_ID?.trim();
  const supabase = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let kysely = supabase
    .from("muutosehdotukset")
    .select("id, hanke_id, lahde_url, huomautus, sisalto")
    .eq("tyyppi", "dokumentti_muuttunut")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true })
    .limit(katto);
  if (yksittainen) kysely = kysely.eq("id", yksittainen);

  const { data: ehdotukset, error } = await kysely;
  if (error) throw new Error(error.message);

  const kasiteltavat = (ehdotukset ?? []).filter((e) => {
    const s = e.sisalto as EhdotusSisalto;
    return !s.tiivistys?.valmis;
  });

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({ sovitin: SOVITIN, tila: "kaynnissa" })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  let kasitelty = 0;
  try {
    for (const rivi of kasiteltavat) {
      const ehdotus = rivi as EhdotusRivi;
      try {
        const uusiSisalto = await tiivistaDokumenttiMuutos(supabase, ehdotus);
        const tiivistys = uusiSisalto.tiivistys!;
        if (kuiva) {
          console.log(`kuiva ${ehdotus.id}: ${tiivistys.yhteenveto.slice(0, 120)}`);
        } else {
          const uusiHuomautus = [ehdotus.huomautus, tiivistys.yhteenveto]
            .filter(Boolean)
            .join(" · ");
          const { error: paivitysVirhe } = await supabase
            .from("muutosehdotukset")
            .update({
              sisalto: uusiSisalto,
              huomautus: uusiHuomautus || null,
            })
            .eq("id", ehdotus.id)
            .eq("tila", "odottaa");
          if (paivitysVirhe) throw new Error(paivitysVirhe.message);
          console.log(`OK ${ehdotus.id}: ${tiivistys.koskee_kenttia.length} kenttää`);
        }
        kasitelty += 1;
      } catch (syy) {
        const viesti = syy instanceof Error ? syy.message : String(syy);
        console.error(`${ehdotus.id}: ${viesti}`);
      }
    }

    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          osumia: kasitelty,
        })
        .eq("id", ajoId);
    }
    console.log(
      `${EHDOTTAJA}: ${kasitelty}/${kasiteltavat.length} tiivistetty${kuiva ? " (kuiva)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Tiivistys epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          virhe: viesti.slice(0, 500),
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
