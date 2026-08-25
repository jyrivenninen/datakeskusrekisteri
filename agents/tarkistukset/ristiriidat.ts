/**
 * 7A.3 Ristiriitatarkistukset. Ei kielimallia: vain SQL.
 * Uusi sääntö: yksi Postgres-funktio + rivi ristiriita_havainnot-unioniin.
 *
 * Kirjaa muutosehdotukset tyypillä ristiriita_havainto. Ei kirjoita
 * hankkeet- eikä organisaatiot-tauluun.
 *
 * Ympäristö: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Valinnainen: RISTIRIITA_KUIVA=1, RISTIRIITA_TEHO_SUHDE (oletus 3),
 * RISTIRIITA_ETAISYYS_M (oletus 500), RISTIRIITA_SUOMI_LAT_MIN/MAX,
 * RISTIRIITA_SUOMI_LON_MIN/MAX
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const EHDOTTAJA = "agents/tarkistukset/ristiriidat";
const SOVITIN = "ristiriidat";

type Havainto = {
  saanto: string;
  hanke_id: string | null;
  avain: string;
  huomautus: string;
};

function luku(nimi: string, oletus: number): number {
  const n = Number(process.env[nimi] ?? String(oletus));
  return Number.isFinite(n) ? n : oletus;
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
  const kuiva = process.env.RISTIRIITA_KUIVA === "1";
  const supabase = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: odottavat, error: jonoVirhe } = await supabase
    .from("muutosehdotukset")
    .select("sisalto")
    .eq("tyyppi", "ristiriita_havainto")
    .eq("tila", "odottaa");
  if (jonoVirhe) throw new Error(jonoVirhe.message);
  const jonossa = new Set<string>();
  for (const rivi of odottavat ?? []) {
    const avain = (rivi.sisalto as { ristiriita?: { avain?: string } }).ristiriita?.avain;
    if (avain) jonossa.add(avain);
  }

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
    const { data, error } = await supabase.rpc("ristiriita_havainnot", {
      p_teho_suhde: luku("RISTIRIITA_TEHO_SUHDE", 3),
      p_etaisyys_m: luku("RISTIRIITA_ETAISYYS_M", 500),
      p_lat_min: luku("RISTIRIITA_SUOMI_LAT_MIN", 59.3),
      p_lat_max: luku("RISTIRIITA_SUOMI_LAT_MAX", 70.2),
      p_lon_min: luku("RISTIRIITA_SUOMI_LON_MIN", 19.0),
      p_lon_max: luku("RISTIRIITA_SUOMI_LON_MAX", 31.6),
    });
    if (error) throw new Error(error.message);
    const havainnot = (data ?? []) as Havainto[];

    let kirjattu = 0;
    for (const h of havainnot) {
      if (!h.avain || jonossa.has(h.avain)) continue;
      if (!kuiva) {
        const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
          tyyppi: "ristiriita_havainto",
          hanke_id: h.hanke_id,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: null,
          huomautus: h.huomautus,
          tila: "odottaa",
          sisalto: {
            kentat: {},
            ristiriita: {
              saanto: h.saanto,
              avain: h.avain,
            },
          },
        });
        if (lisaysVirhe) throw new Error(lisaysVirhe.message);
        jonossa.add(h.avain);
      } else {
        console.log(`kuiva: ${h.saanto} ${h.huomautus}`);
      }
      kirjattu += 1;
    }

    if (ajoId) {
      const { error: paivitysVirhe } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          osumia: havainnot.length,
        })
        .eq("id", ajoId);
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    }
    console.log(
      `Valmis. Havaintoja ${havainnot.length}, kirjattavia ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Ristiriita-ajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          virhe: viesti,
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
