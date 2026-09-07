/**
 * 7B.1 Lähteenvahvistaja — tarkistaa tukeeko lähdeasiakirja tallennettua arvoa.
 *
 * Syöte: yksi hankekenttä + sen lähde-URL (+ sivunumero).
 * Vaste: tukee | ei_tue | ei_loydy | dokumentti_muuttunut + lainaus ja sivu.
 *
 * Ympäristö:
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - MALLI_TARJOAJA, MALLI_NIMI, GEMINI_API_KEY (tai muu malliavain)
 * - LAHTEENVAHVISTAJ_HANKE_ID + LAHTEENVAHVISTAJ_KENTTA (yksittäinen ajo)
 * - LAHTEENVAHVISTAJ_JONO=1 (käsittele lahteenvahvistus_pyynto-jono)
 * - LAHTEENVAHVISTAJ_KUIVA=1 (ei kirjoita)
 * - LAHTEENVAHVISTAJ_KATTO (oletus 10 jonossa)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noudaDokumenttiTeksti } from "./dokumentti-teksti";
import { kysyMallia } from "./malli";
import { robotsSallii } from "./tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "./ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; lahteenvahvistaja)";
const EHDOTTAJA = "agents/lahteenvahvistaja";
const SOVITIN = "lahteenvahvistaja";
const TEKSTI_KATTO = 120_000;

export type LahteenvahvistusTulos =
  | "tukee"
  | "ei_tue"
  | "ei_loydy"
  | "dokumentti_muuttunut";

export type LahteenvahvistusSisalto = {
  taulu: "hankkeet";
  rivi_id: string;
  kentta: string;
  kentta_nimi: string;
  tallennettu_arvo: string;
  lahde_url: string;
  lahde_sivu: number | null;
  kentta_lahde_id: string | null;
  tulos: LahteenvahvistusTulos;
  lainaus: string | null;
  sivu: number | null;
  dokumentti_id: string | null;
  merkkimaara: number | null;
};

type KenttaLahdeRivi = {
  id: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string | null;
  dokumentti_id: string | null;
  luottamus: string;
  merkitty: string;
};

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

const SALLITUT_KENTAT = new Set(Object.keys(KENTTA_NIMET));

const JARJESTELMA = `Olet lähteenvahvistaja. Vastaa vain annetun asiakirjan perusteella.
Älä arvaa, täydennä tai tulkita. Jos kohtaa ei löydy, tulos on ei_loydy.
Palauta vain yksi JSON-objekti ilman markdownia:
{"tulos":"tukee"|"ei_tue"|"ei_loydy","lainaus":"sanatarkka lainaus tai null","sivu":numero tai null}`;

function kenttaNimi(kentta: string): string {
  return KENTTA_NIMET[kentta] ?? kentta;
}

function lueKentanArvo(hanke: Record<string, unknown>, kentta: string): string | null {
  const arvo = hanke[kentta];
  if (arvo == null || arvo === "") return null;
  if (typeof arvo === "number") return String(arvo);
  if (typeof arvo === "string") return arvo.trim() || null;
  return String(arvo);
}

function rajaaTeksti(teksti: string): { teksti: string; katkaistu: boolean } {
  if (teksti.length <= TEKSTI_KATTO) return { teksti, katkaistu: false };
  return {
    teksti: teksti.slice(0, TEKSTI_KATTO),
    katkaistu: true,
  };
}

function rakennaKehote(
  kentta: string,
  arvo: string,
  lahdeSivu: number | null,
  dokumentti: string,
  katkaistu: boolean,
): string {
  const sivuOhje = lahdeSivu
    ? `Tarkista erityisesti sivu ${lahdeSivu}, mutta etsi myös muualta jos tarpeen.`
    : "Ilmoita sivunumero jos löydät kohdan PDF:stä.";
  const katkaisu = katkaistu ? "\n(Huom: asiakirjan alku on katkaistu pituusrajan takia.)" : "";
  return [
    `Kenttä: ${kenttaNimi(kentta)} (${kentta})`,
    `Rekisterissä oleva arvo: ${arvo}`,
    sivuOhje,
    "",
    "Kysymys: tukeeko alla oleva asiakirja tätä arvoa?",
    "Jos asiakirjassa on ristiriitainen tieto, tulos on ei_tue.",
    "Jos arvoa tai vastaavaa tietoa ei löydy, tulos on ei_loydy.",
    katkaisu,
    "",
    "--- ASIAKIRJA ---",
    dokumentti,
  ].join("\n");
}

export function parsiiMalliVastaus(raaka: string): {
  tulos: Exclude<LahteenvahvistusTulos, "dokumentti_muuttunut">;
  lainaus: string | null;
  sivu: number | null;
} {
  const jsonLohko = raaka.match(/\{[\s\S]*\}/);
  const json = jsonLohko ? jsonLohko[0] : raaka;
  let parsed: {
    tulos?: string;
    lainaus?: string | null;
    sivu?: number | null;
  };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    throw new Error(`Mallin vastaus ei ollut JSON: ${raaka.slice(0, 200)}`);
  }
  const tulos = parsed.tulos?.trim().toLowerCase();
  if (tulos !== "tukee" && tulos !== "ei_tue" && tulos !== "ei_loydy") {
    throw new Error(`Tuntematon tulos: ${parsed.tulos ?? "(puuttuu)"}`);
  }
  const lainaus =
    parsed.lainaus == null || String(parsed.lainaus).trim() === ""
      ? null
      : String(parsed.lainaus).trim();
  const sivuRaaka: unknown = parsed.sivu;
  const sivu =
    sivuRaaka == null || sivuRaaka === ""
      ? null
      : Number.isFinite(Number(sivuRaaka))
        ? Math.floor(Number(sivuRaaka))
        : null;
  return { tulos, lainaus, sivu };
}

async function dokumenttiMuuttunut(
  supabase: SupabaseClient,
  dokumenttiId: string | null,
  uusiTiiviste: string,
): Promise<boolean> {
  if (!dokumenttiId) return false;
  const { data } = await supabase
    .from("dokumentti_tiivisteet")
    .select("tiiviste")
    .eq("dokumentti_id", dokumenttiId)
    .order("tarkistettu_pvm", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.tiiviste) return false;
  return data.tiiviste !== uusiTiiviste;
}

async function haeKenttaLahde(
  supabase: SupabaseClient,
  hankeId: string,
  kentta: string,
  lahdeId?: string | null,
): Promise<KenttaLahdeRivi | null> {
  if (lahdeId) {
    const { data, error } = await supabase
      .from("kentta_lahteet")
      .select("id, lahde_url, lahde_sivu, lainaus, dokumentti_id, luottamus, merkitty")
      .eq("id", lahdeId)
      .eq("taulu", "hankkeet")
      .eq("rivi_id", hankeId)
      .eq("kentta", kentta)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as KenttaLahdeRivi | null) ?? null;
  }
  const { data, error } = await supabase
    .from("kentta_lahteet")
    .select("id, lahde_url, lahde_sivu, lainaus, dokumentti_id, luottamus, merkitty")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", hankeId)
    .eq("kentta", kentta)
    .order("vahvistettu_pvm", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as KenttaLahdeRivi | null) ?? null;
}

export async function vahvistaKenttaLahde(
  supabase: SupabaseClient,
  opts: {
    hankeId: string;
    kentta: string;
    kenttaLahdeId?: string | null;
    kuiva?: boolean;
  },
): Promise<LahteenvahvistusSisalto> {
  const kentta = opts.kentta.trim();
  if (!SALLITUT_KENTAT.has(kentta)) {
    throw new Error(`Kenttä ${kentta} ei ole tuettu lähteenvahvistuksessa.`);
  }

  const { data: hanke, error: hankeVirhe } = await supabase
    .from("hankkeet")
    .select("*")
    .eq("id", opts.hankeId)
    .maybeSingle();
  if (hankeVirhe) throw new Error(hankeVirhe.message);
  if (!hanke) throw new Error("Hanketta ei löytynyt.");

  const arvo = lueKentanArvo(hanke as Record<string, unknown>, kentta);
  if (arvo == null) {
    throw new Error(`Kentässä ${kentta} ei ole arvoa — ei mitä vahvistaa.`);
  }

  const lahde = await haeKenttaLahde(supabase, opts.hankeId, kentta, opts.kenttaLahdeId);
  if (!lahde) {
    throw new Error(`Kentälle ${kentta} ei löytynyt lähdettä.`);
  }

  let osoite: URL;
  try {
    osoite = new URL(lahde.lahde_url);
  } catch {
    throw new Error(`Kelvoton lähde-URL: ${lahde.lahde_url}`);
  }
  if (!(await robotsSallii(osoite, USER_AGENT))) {
    throw new Error(`robots.txt estää: ${lahde.lahde_url}`);
  }

  const nouto = await noudaDokumenttiTeksti(lahde.lahde_url, { userAgent: USER_AGENT });
  if (nouto.tila >= 400) {
    throw new Error(`Asiakirjan nouto epäonnistui (${nouto.tila}): ${lahde.lahde_url}`);
  }

  const muuttunut = await dokumenttiMuuttunut(supabase, lahde.dokumentti_id, nouto.tiiviste);
  if (muuttunut) {
    const tulos: LahteenvahvistusSisalto = {
      taulu: "hankkeet",
      rivi_id: opts.hankeId,
      kentta,
      kentta_nimi: kenttaNimi(kentta),
      tallennettu_arvo: arvo,
      lahde_url: lahde.lahde_url,
      lahde_sivu: lahde.lahde_sivu,
      kentta_lahde_id: lahde.id,
      tulos: "dokumentti_muuttunut",
      lainaus: null,
      sivu: null,
      dokumentti_id: lahde.dokumentti_id,
      merkkimaara: nouto.merkkimaara,
    };
    return tulos;
  }

  const { teksti, katkaistu } = rajaaTeksti(nouto.teksti);
  if (teksti.length === 0) {
    throw new Error("Asiakirjan teksti on tyhjä (esim. skannattu PDF ilman OCR:ää).");
  }

  const kehote = rakennaKehote(kentta, arvo, lahde.lahde_sivu, teksti, katkaistu);
  const malli = await kysyMallia(kehote, {
    jarjestelma: JARJESTELMA,
    dokumenttiUrl: lahde.lahde_url,
  });
  const { tulos, lainaus, sivu } = parsiiMalliVastaus(malli.teksti);

  return {
    taulu: "hankkeet",
    rivi_id: opts.hankeId,
    kentta,
    kentta_nimi: kenttaNimi(kentta),
    tallennettu_arvo: arvo,
    lahde_url: lahde.lahde_url,
    lahde_sivu: lahde.lahde_sivu,
    kentta_lahde_id: lahde.id,
    tulos,
    lainaus,
    sivu,
    dokumentti_id: lahde.dokumentti_id,
    merkkimaara: nouto.merkkimaara,
  };
}

async function kirjaaTulos(
  supabase: SupabaseClient,
  hankeId: string,
  sisalto: LahteenvahvistusSisalto,
): Promise<void> {
  const huomautus = `${sisalto.kentta_nimi}: ${sisalto.tulos}${
    sisalto.lainaus ? ` — «${sisalto.lainaus.slice(0, 120)}»` : ""
  }`;

  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("sisalto")
    .eq("tyyppi", "lahteenvahvistus")
    .eq("tila", "odottaa")
    .eq("hanke_id", hankeId)
    .eq("lahde_url", sisalto.lahde_url);
  for (const rivi of odottavat ?? []) {
    const s = rivi.sisalto as { lahteenvahvistus?: { kentta?: string } };
    if (s.lahteenvahvistus?.kentta === sisalto.kentta) {
      console.log(`Ohitettu: odottava vahvistus jo olemassa (${sisalto.kentta}).`);
      return;
    }
  }

  const { error } = await supabase.from("muutosehdotukset").insert({
    tyyppi: "lahteenvahvistus",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: EHDOTTAJA,
    lahde_url: sisalto.lahde_url,
    huomautus,
    tila: "odottaa",
    sisalto: {
      kentat: {},
      lahteenvahvistus: sisalto,
    },
  });
  if (error) throw new Error(error.message);
  console.log(`Kirjattu: ${huomautus}`);
}

type PyyntoSisalto = {
  pyynto?: {
    hanke_id?: string;
    kentta?: string;
    kentta_lahde_id?: string | null;
  };
};

async function kasitteleJono(supabase: SupabaseClient, kuiva: boolean, katto: number) {
  const { data: pyynnot, error } = await supabase
    .from("muutosehdotukset")
    .select("id, hanke_id, sisalto")
    .eq("tyyppi", "lahteenvahvistus_pyynto")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true })
    .limit(katto);
  if (error) throw new Error(error.message);

  let kasitelty = 0;
  for (const rivi of pyynnot ?? []) {
    const sisalto = rivi.sisalto as PyyntoSisalto;
    const hankeId = sisalto.pyynto?.hanke_id ?? rivi.hanke_id;
    const kentta = sisalto.pyynto?.kentta;
    if (!hankeId || !kentta) {
      console.warn(`Pyyntö ${rivi.id}: puuttuu hanke_id tai kentta.`);
      continue;
    }
    try {
      const tulos = await vahvistaKenttaLahde(supabase, {
        hankeId,
        kentta,
        kenttaLahdeId: sisalto.pyynto?.kentta_lahde_id ?? null,
        kuiva,
      });
      if (kuiva) {
        console.log(`kuiva: ${tulos.kentta} → ${tulos.tulos}`);
      } else {
        await kirjaaTulos(supabase, hankeId, tulos);
        await supabase
          .from("muutosehdotukset")
          .update({
            tila: "hyvaksytty",
            kasitelty_pvm: new Date().toISOString(),
            kasittelija: EHDOTTAJA,
          })
          .eq("id", rivi.id)
          .eq("tila", "odottaa");
      }
      kasitelty += 1;
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : String(syy);
      console.error(`Pyyntö ${rivi.id} epäonnistui: ${viesti}`);
    }
  }
  console.log(`Jono: ${kasitelty}/${pyynnot?.length ?? 0} käsitelty${kuiva ? " (kuiva)" : ""}.`);
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
  const kuiva = process.env.LAHTEENVAHVISTAJ_KUIVA === "1";
  const jono = process.env.LAHTEENVAHVISTAJ_JONO === "1";
  const katto = Number(process.env.LAHTEENVAHVISTAJ_KATTO ?? "10");
  const supabase = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
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

  try {
    if (jono) {
      await kasitteleJono(supabase, kuiva, katto);
    } else {
      const hankeId = process.env.LAHTEENVAHVISTAJ_HANKE_ID?.trim();
      const kentta = process.env.LAHTEENVAHVISTAJ_KENTTA?.trim();
      if (!hankeId || !kentta) {
        throw new Error(
          "LAHTEENVAHVISTAJ_HANKE_ID ja LAHTEENVAHVISTAJ_KENTTA tarvitaan (tai LAHTEENVAHVISTAJ_JONO=1).",
        );
      }
      const tulos = await vahvistaKenttaLahde(supabase, {
        hankeId,
        kentta,
        kenttaLahdeId: process.env.LAHTEENVAHVISTAJ_LAHDE_ID?.trim() || null,
        kuiva,
      });
      if (kuiva) {
        console.log(JSON.stringify(tulos, null, 2));
      } else {
        await kirjaaTulos(supabase, hankeId, tulos);
      }
    }

    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: 200,
        })
        .eq("id", ajoId);
    }
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Lähteenvahvistus epäonnistui.";
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
