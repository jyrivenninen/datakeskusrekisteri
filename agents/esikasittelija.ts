/**
 * 7B.2 Ilmoitusten esikäsittelijä.
 *
 * Täydentää odottavia uusi_hanke-ehdotuksia rakenteisista lähteistä (7A.5)
 * ja valinnaisesti lähdeasiakirjasta (malli). Ei julkaise automaattisesti.
 *
 * Ympäristö:
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - MALLI_* ja GEMINI_API_KEY (jos asiakirjapoiminta)
 * - ESIKASITTELIJA_KUIVA=1, ESIKASITTELIJA_KATTO (oletus 5)
 * - ESIKASITTELIJA_EHDOTUS_ID (yksittäinen ehdotus)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noudaDokumenttiTeksti } from "./dokumentti-teksti";
import { poimiKentatDokumentista } from "./esikasittelu/dokumentti";
import {
  etsiDuplikaatit,
  haeKuntaTiedot,
  haeRyhtiNimella,
} from "./esikasittelu/rajapinnat";
import { robotsSallii } from "./tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "./ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; esikasittelija)";
const EHDOTTAJA = "agents/esikasittelija";
const SOVITIN = "esikasittelija";

const TAYDENNETTAVAT = [
  "maakunta",
  "toimija_nimi",
  "yva_diaarinumero",
  "kaavatunnus",
  "it_teho_mw",
  "pinta_ala_ha",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "generaattorit_kaytossa_max_lkm",
  "generaattori_polttoaineteho_mw",
] as const;

type EhdotettuKentta = {
  arvo: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string | null;
  luottamus?: "epavarma" | "vahvistettu" | "ristiriitainen";
  lahde_laji?: "rajapinta" | "dokumentti" | "verkkosivu" | "muu";
};

type EhdotusSisalto = {
  kentat: Record<string, EhdotettuKentta>;
  esikasittelu?: {
    valmis: boolean;
    kasitelty_pvm: string;
    lisatyt_kentat: string[];
    huomautukset: string[];
    duplikaatit?: { id: string; nimi: string; kunta: string }[];
    ryhti?: {
      nimi: string | null;
      kaavatunnus: string | null;
      lahde_url: string;
    };
  };
};

type EhdotusRivi = {
  id: string;
  hanke_id: string | null;
  lahde_url: string | null;
  huomautus: string | null;
  sisalto: EhdotusSisalto;
};

function ensimmainenLahdeUrl(ehdotus: EhdotusRivi): string | null {
  if (ehdotus.lahde_url?.trim()) return ehdotus.lahde_url.trim();
  for (const tieto of Object.values(ehdotus.sisalto.kentat ?? {})) {
    if (tieto.lahde_url?.trim()) return tieto.lahde_url.trim();
  }
  return null;
}

function tyhjatKentat(sisalto: EhdotusSisalto): string[] {
  return TAYDENNETTAVAT.filter((k) => !sisalto.kentat[k]?.arvo?.trim());
}

export async function esikasitteleEhdotus(
  supabase: SupabaseClient,
  ehdotus: EhdotusRivi,
): Promise<EhdotusSisalto> {
  if (ehdotus.sisalto.esikasittelu?.valmis) {
    return ehdotus.sisalto;
  }

  const nimi = ehdotus.sisalto.kentat.nimi?.arvo?.trim();
  const kunta = ehdotus.sisalto.kentat.kunta?.arvo?.trim();
  const vaihe = ehdotus.sisalto.kentat.vaihe?.arvo?.trim();
  if (!nimi || !kunta || !vaihe) {
    throw new Error("Ehdotuksesta puuttuu nimi, kunta tai vaihe.");
  }

  const uusiSisalto: EhdotusSisalto = {
    ...ehdotus.sisalto,
    kentat: { ...ehdotus.sisalto.kentat },
  };
  const lisatyt: string[] = [];
  const huomautukset: string[] = [];

  const kuntaTiedot = await haeKuntaTiedot(supabase, kunta);
  if (kuntaTiedot?.maakunta && !uusiSisalto.kentat.maakunta?.arvo) {
    const lahde = kuntaTiedot.lahde_url ?? "https://api.ymparisto.fi/hakemisto/odata/Kunta";
    uusiSisalto.kentat.maakunta = {
      arvo: kuntaTiedot.maakunta,
      lahde_url: lahde,
      lahde_sivu: null,
      lainaus: `Kunta ${kuntaTiedot.nimi}, maakunta ${kuntaTiedot.maakunta} (Syke hakemisto).`,
      luottamus: "epavarma",
      lahde_laji: "rajapinta",
    };
    lisatyt.push("maakunta");
    huomautukset.push("Maakunta täydennetty Syke-kuntatiedosta.");
  }

  const duplikaatit = await etsiDuplikaatit(supabase, nimi, kunta);
  if (duplikaatit.length > 0) {
    huomautukset.push(
      `Mahdollinen duplikaatti: ${duplikaatit.map((d) => d.nimi).join(", ")}.`,
    );
  }

  const ryhti = await haeRyhtiNimella(nimi, kuntaTiedot?.koodi ?? null);
  let ryhtiMeta: NonNullable<EhdotusSisalto["esikasittelu"]>["ryhti"];
  if (ryhti?.kaavatunnus && !uusiSisalto.kentat.kaavatunnus?.arvo) {
    uusiSisalto.kentat.kaavatunnus = {
      arvo: ryhti.kaavatunnus,
      lahde_url: ryhti.lahde_url,
      lahde_sivu: null,
      lainaus: ryhti.nimi ? `Kaava: ${ryhti.nimi}` : null,
      luottamus: "epavarma",
      lahde_laji: "rajapinta",
    };
    lisatyt.push("kaavatunnus");
    huomautukset.push("Kaavatunnus täydennetty Ryhti-rajapinnasta.");
  }
  if (ryhti) {
    ryhtiMeta = {
      nimi: ryhti.nimi,
      kaavatunnus: ryhti.kaavatunnus,
      lahde_url: ryhti.lahde_url,
    };
  }

  const lahdeUrl = ensimmainenLahdeUrl(ehdotus);
  const tyhjat = tyhjatKentat(uusiSisalto).filter((k) => k !== "kaavatunnus" && k !== "maakunta");

  if (lahdeUrl && tyhjat.length > 0) {
    try {
      const osoite = new URL(lahdeUrl);
      if (await robotsSallii(osoite, USER_AGENT)) {
        const nouto = await noudaDokumenttiTeksti(lahdeUrl, { userAgent: USER_AGENT });
        if (nouto.tila < 400 && nouto.teksti.length > 0) {
          const poimitut = await poimiKentatDokumentista(
            nimi,
            kunta,
            nouto.teksti,
            tyhjat,
            lahdeUrl,
          );
          for (const [kentta, tieto] of Object.entries(poimitut)) {
            if (uusiSisalto.kentat[kentta]?.arvo) continue;
            uusiSisalto.kentat[kentta] = {
              arvo: tieto.arvo,
              lahde_url: lahdeUrl,
              lahde_sivu: tieto.sivu,
              lainaus: tieto.lainaus,
              luottamus: "epavarma",
            };
            lisatyt.push(kentta);
          }
          if (Object.keys(poimitut).length > 0) {
            huomautukset.push(
              `Asiakirjasta poimittiin ${Object.keys(poimitut).length} kenttää.`,
            );
          }
        }
      }
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Asiakirjan käsittely epäonnistui.";
      huomautukset.push(`Asiakirjapoiminta ohitettu: ${viesti}`);
    }
  } else if (!lahdeUrl) {
    huomautukset.push("Asiakirjaa ei ole — vain rajapintahaut tehty.");
  }

  uusiSisalto.esikasittelu = {
    valmis: true,
    kasitelty_pvm: new Date().toISOString(),
    lisatyt_kentat: lisatyt,
    huomautukset,
    duplikaatit: duplikaatit.length > 0 ? duplikaatit : undefined,
    ryhti: ryhtiMeta,
  };

  return uusiSisalto;
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
  const kuiva = process.env.ESIKASITTELIJA_KUIVA === "1";
  const katto = Number(process.env.ESIKASITTELIJA_KATTO ?? "5");
  const yksittainen = process.env.ESIKASITTELIJA_EHDOTUS_ID?.trim();
  const supabase = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let kysely = supabase
    .from("muutosehdotukset")
    .select("id, hanke_id, lahde_url, huomautus, sisalto")
    .eq("tyyppi", "uusi_hanke")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true })
    .limit(katto);
  if (yksittainen) kysely = kysely.eq("id", yksittainen);

  const { data: ehdotukset, error } = await kysely;
  if (error) throw new Error(error.message);

  const kasiteltavat = (ehdotukset ?? []).filter((e) => {
    const s = e.sisalto as EhdotusSisalto;
    return !s.esikasittelu?.valmis;
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
        const uusiSisalto = await esikasitteleEhdotus(supabase, ehdotus);
        const lisatyt = uusiSisalto.esikasittelu?.lisatyt_kentat ?? [];
        const huom = uusiSisalto.esikasittelu?.huomautukset.join(" ") ?? "";
        if (kuiva) {
          console.log(
            `kuiva ${ehdotus.id}: +${lisatyt.length} kenttää [${lisatyt.join(", ")}] ${huom}`,
          );
        } else {
          const uusiHuomautus = [ehdotus.huomautus, huom].filter(Boolean).join(" · ");
          const { error: paivitysVirhe } = await supabase
            .from("muutosehdotukset")
            .update({
              sisalto: uusiSisalto,
              huomautus: uusiHuomautus || null,
            })
            .eq("id", ehdotus.id)
            .eq("tila", "odottaa");
          if (paivitysVirhe) throw new Error(paivitysVirhe.message);
          console.log(`OK ${ehdotus.id}: +${lisatyt.length} kenttää`);
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
      `${EHDOTTAJA}: ${kasitelty}/${kasiteltavat.length} esikäsitelty${kuiva ? " (kuiva)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Esikäsittely epäonnistui.";
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
