/**
 * Lisää Naarajärven ja Pornaisten asiakirjat vaihe-kentän lähteiksi
 * (vaihetta ei muuteta — historia näkyviin).
 *
 * Aja: npx tsx scripts/lisaa-vaihe-lahteet-naarajarvi-pornainen.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const TUN = "vaihe_historia_naarajarvi_pornainen";
const KASITTELIJA = "ylläpito";

const LISAYKSET = [
  {
    hanke_id: "d04aadf9-cc02-4268-8c8e-bd4ba56414d3",
    hanke_nimi: "Regant Naarajärvi",
    vaihe: "kaavoitus",
    lahde_url: "https://tweb.pieksamaki.fi/ktwebscr/fileshow?doctype=7&docid=239202",
    lainaus:
      "Kiinteistön ja määräalojen pinta-ala on yhteensä n. 18,71 ha. Alueella on voimassa yleiskaava.",
    huomautus:
      "Vaihe-historia: Kv 3.2.2025 §8 aiesopimus ja kiinteistökaupan esisopimus (Regant Oy). Rekisterin vaihe kaavoitus säilyy — hanke on edennyt asiakirjan jälkeen.",
  },
  {
    hanke_id: "6f071fa5-380a-4984-9f10-ac07db598890",
    hanke_nimi: "Regant Pornainen, Portti",
    vaihe: "kaavoitus",
    lahde_url:
      "https://pornainen-julkaisu.triplancloud.fi/ktwebscr/fileshow?doctype=7&docid=40396",
    lainaus:
      "koskien noin 25 hehtaarin määräalaa kiinteistöistä 611-403-3-225 ja 611-403-3-11. Kauppa toteutetaan vaiheittain siten, että ensimmäisessä vaiheessa luovutetaan 5 hehtaarin määräala",
    huomautus:
      "Vaihe-historia: Kv 26.1.2026 §2 kiinteistökaupan esisopimus Regant Oy:n kanssa. Rekisterin vaihe kaavoitus säilyy — hanke on edennyt asiakirjan jälkeen.",
  },
] as const;

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  for (const l of LISAYKSET) {
    const { data: olemassa } = await sb
      .from("kentta_lahteet")
      .select("id")
      .eq("taulu", "hankkeet")
      .eq("rivi_id", l.hanke_id)
      .eq("kentta", "vaihe")
      .eq("lahde_url", l.lahde_url)
      .neq("tila", "korvattu")
      .maybeSingle();
    if (olemassa) {
      console.log("jo lähteenä", l.hanke_nimi);
      continue;
    }

    const { data: jonossa } = await sb
      .from("muutosehdotukset")
      .select("id")
      .eq("ehdottaja_tunniste", TUN)
      .eq("hanke_id", l.hanke_id)
      .eq("tila", "odottaa")
      .maybeSingle();
    if (jonossa) {
      console.log("jonossa", l.hanke_nimi, jonossa.id);
      if (!kuiva) {
        await hyvaksyMuutosehdotus(jonossa.id as string, KASITTELIJA);
        console.log("hyväksytty", l.hanke_nimi);
      }
      continue;
    }

    const rivi = {
      tyyppi: "taydennys",
      hanke_id: l.hanke_id,
      ehdottaja_tyyppi: "agentti",
      ehdottaja_tunniste: TUN,
      lahde_url: l.lahde_url,
      huomautus: l.huomautus,
      tila: "odottaa",
      sisalto: {
        kentat: {
          vaihe: {
            arvo: l.vaihe,
            lahde_url: l.lahde_url,
            lahde_laji: "html",
            lainaus: l.lainaus,
            luottamus: "epavarma",
            merkitty: "koneen_ehdottama",
          },
        },
      },
    };

    console.log(l.hanke_nimi, "→ vaihe-lähde", l.lahde_url);
    if (kuiva) continue;

    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert(rivi)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await hyvaksyMuutosehdotus(ehdotus.id as string, KASITTELIJA);
    console.log("hyväksytty", l.hanke_nimi, ehdotus.id);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
