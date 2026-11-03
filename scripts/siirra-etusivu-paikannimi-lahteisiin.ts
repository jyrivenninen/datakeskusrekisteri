/**
 * Eurajoki / Pyhäjärvi / Toholampi: etusivu-sijaintilähde → asiakirjalähde.
 * Pistettä ei siirretä.
 *
 * Aja: npx tsx scripts/siirra-etusivu-paikannimi-lahteisiin.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const KOHTEET = [
  {
    nimi: "Valorem Eurajoki",
    etusivu_lahde_id: "84c7386f-387b-4bba-af9e-8a03cf333865",
    // Raumantie löytyy datacentermapista; Kissankallio YLE/MML jo erillisillä riveillä.
    uusi_url: "https://www.datacentermap.com/finland/eurajoki/",
    dokumentti_id: "5291ca1b-0115-4625-90f4-3ea2cc32b21e",
    lainaus:
      "Valorem Eurajoki Valorem Raumantie (E8) 27100 Eurajoki. (Paikannimi Raumantie asiakirjassa; tallennettua pistettä ei muutettu.)",
    huom: "Raumantie löytyi datacentermapista",
  },
  {
    nimi: "Arcem Pyhäjärvi, Olkkonen",
    etusivu_lahde_id: "0b312bce-1a70-47ef-b0d4-2130a6831185",
    // Olkkosentie/Kettuperä = käänteishaun nimi, ei asiakirjassa.
    // Olkkonen on asiakirjanimi → MML-haku (jo olemassa → etusivu-rivi poistuu).
    uusi_url:
      "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search?text=Olkkonen&lang=fi&size=1",
    dokumentti_id: null as string | null,
    lainaus: null as string | null,
    huom: "Olkkosentie/Kettuperä ei asiakirjassa; Olkkonen on → etusivu poistuu (MML Olkkonen jää)",
  },
  {
    nimi: "Greensky Toholampi, Kiertokangas",
    etusivu_lahde_id: "f81f24ca-abc1-4de2-b7a2-cd6f7c7c8173",
    // Hongistonneva = käänteishaun nimi, ei asiakirjassa.
    // Kiertokangas YLE:ssä → etusivu poistuu.
    uusi_url: "https://yle.fi/a/74-20219799",
    dokumentti_id: null,
    lainaus: null,
    huom: "Hongistonneva ei asiakirjassa; Kiertokangas on → etusivu poistuu (YLE jää)",
  },
];

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  for (const k of KOHTEET) {
    console.log(`• ${k.nimi}: ${k.huom}`);
    const args: Record<string, unknown> = {
      p_lahde_id: k.etusivu_lahde_id,
      p_uusi_url: k.uusi_url,
      p_tarkistettu: true,
    };
    if (k.lainaus) args.p_lainaus = k.lainaus;
    if (k.dokumentti_id) args.p_dokumentti_id = k.dokumentti_id;
    const { error } = await sb.rpc("paivita_kentta_lahde_sisalto", args);
    if (error) {
      console.log(`  ✗ ${error.message}`);
    } else {
      console.log(`  ✓ ${k.uusi_url}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
