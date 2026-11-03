/**
 * Täydentää Y-tunnukset YTJ-osumille (ytj_havainto → julkaise_organisaation_y_tunnus).
 * Aja: npx tsx scripts/taydenna-y-tunnukset-ytj.ts
 */
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";
import { luoYllapitoAsiakas } from "../src/lib/supabase/yllapito-asiakas";

const KASITTELIJA = "ylläpito";
const PVM = "2026-10-11";

/** Rekisterin nykyinen nimi → YTJ:n nimi + tunnus */
const TAYDENNYKSET: Array<{
  nykyinenNimi: string;
  ytjNimi: string;
  y_tunnus: string;
}> = [
  { nykyinenNimi: "DNA Oy", ytjNimi: "DNA Oyj", y_tunnus: "0592509-6" },
  { nykyinenNimi: "Elisa", ytjNimi: "Elisa Oyj", y_tunnus: "0116510-6" },
  { nykyinenNimi: "Fortum", ytjNimi: "Fortum Oyj", y_tunnus: "1463611-4" },
  { nykyinenNimi: "Telia", ytjNimi: "Telia Finland Oyj", y_tunnus: "1475607-9" },
  { nykyinenNimi: "UPM-Kymmene", ytjNimi: "UPM-Kymmene Oyj", y_tunnus: "1041090-0" },
  { nykyinenNimi: "YIT", ytjNimi: "YIT Oyj", y_tunnus: "0112650-2" },
  {
    nykyinenNimi: "KSFR Junnikankangas DC Oy (Semecon Oy / Korkia Oy)",
    ytjNimi: "KSFR Junnikankangas DC Oy",
    y_tunnus: "3656727-9",
  },
  {
    nykyinenNimi: "Lumilogic Oy (Nordecon Oy)",
    ytjNimi: "Lumilogic Oy",
    y_tunnus: "3418443-4",
  },
  {
    nykyinenNimi: "North Shore Datacenter Oy",
    ytjNimi: "Oy North Shore Datacenter Ab",
    y_tunnus: "2909236-7",
  },
];

function ytjUrl(yTunnus: string): string {
  return `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${yTunnus}`;
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = luoYllapitoAsiakas();

  for (const t of TAYDENNYKSET) {
    const { data: org, error } = await sb
      .from("organisaatiot")
      .select("id, nimi, y_tunnus")
      .eq("julkaistu", true)
      .eq("nimi", t.nykyinenNimi)
      .maybeSingle();
    if (error) throw new Error(`${t.nykyinenNimi}: ${error.message}`);
    if (!org) throw new Error(`Organisaatiota ei löydy: ${t.nykyinenNimi}`);
    if (org.y_tunnus) {
      console.log("jo on", t.nykyinenNimi, org.y_tunnus);
      continue;
    }

    const lahde = ytjUrl(t.y_tunnus);
    const { data: ehd, error: ehdVirhe } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "ytj_havainto",
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        lahde_url: lahde,
        huomautus: `YTJ-täydennys: ${t.nykyinenNimi} → ${t.ytjNimi} ${t.y_tunnus}.`,
        tila: "odottaa",
        sisalto: {
          kentat: {},
          ytj: {
            organisaatio_id: org.id,
            y_tunnus: t.y_tunnus,
            rekisterin_nimi: t.nykyinenNimi,
            ytj_nimi: t.ytjNimi,
            rekisterointi_pvm: null,
            toimiala: null,
            kotipaikka: null,
            muuttunut: true,
            ei_loydy: false,
            ehdota_tunnus: true,
          },
        },
      })
      .select("id")
      .single();
    if (ehdVirhe || !ehd) throw new Error(`${t.nykyinenNimi}: ${ehdVirhe?.message}`);

    await hyvaksyMuutosehdotus(ehd.id as string, KASITTELIJA);

    // Virallinen YTJ-nimi, jos poikkeaa rekisterinimestä
    if (t.ytjNimi !== t.nykyinenNimi) {
      const { error: nimiVirhe } = await sb
        .from("organisaatiot")
        .update({ nimi: t.ytjNimi })
        .eq("id", org.id);
      if (nimiVirhe) {
        console.warn("nimi-päivitys epäonnistui", t.nykyinenNimi, nimiVirhe.message);
      } else {
        const { error: lahdeVirhe } = await sb.rpc("tallenna_kentta_lahde", {
          p_taulu: "organisaatiot",
          p_rivi_id: org.id,
          p_kentta: "nimi",
          p_lahde_url: lahde,
          p_lahde_sivu: null,
          p_vahvistettu_pvm: PVM,
          p_luottamus: "vahvistettu",
          p_lainaus: t.ytjNimi,
          p_merkitty: "ihmisen_vahvistama",
          p_lahde_laji: "rajapinta",
        });
        if (lahdeVirhe) console.warn("nimi-lahde", lahdeVirhe.message);
      }
    }

    console.log("ok", t.nykyinenNimi, "→", t.ytjNimi, t.y_tunnus);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
