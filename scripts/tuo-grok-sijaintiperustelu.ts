/**
 * Vie Grokin lähdeselvitys 11 (sijainnin perustelu) muutosehdotusjonoon.
 *
 * Aineisto: agents/data/grok-sijaintiperustelu-2026-10-11.json
 * Aja: npx tsx scripts/tuo-grok-sijaintiperustelu.ts [--kuiva]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const OLETUSTIEDOSTO = resolve(
  process.cwd(),
  "agents/data/grok-sijaintiperustelu-2026-10-11.json",
);

const EHDOTTAJA = "grok_lahdeselvitys_2026-10-11";
const JOKELA_OHJELMA_URL =
  "https://www.ymparisto.fi/sites/default/files/documents/QTS_Jokela_datakeskus_YVA_ohjelma_20260212.pdf";

type Perustelu = {
  lainaus: string;
  sivu: string;
  luku?: string;
};

type HankeRivi = {
  hanke_nimi: string;
  kunta: string;
  selostus_url: string;
  perustelut: Perustelu[];
  muita_vaihtoehtoja: {
    lainaus: string;
    sivu: string;
    asiakirja?: string;
  };
  huomio?: string;
};

type Aineisto = { osa: string; hankkeet: HankeRivi[] };

type MuutSijainnit = "tarkasteltu_ja_nimetty" | "tarkasteltu_nimeamatta" | "ei_kasitelty";

/** JSON-nimi → julkaistu hankkeen nimi tietokannassa. */
const HANKE_NIMI: Record<string, string> = {
  "Espoon datakeskusalue": "Espoon datakeskusalue",
  "Kirkkonummen datakeskus": "Kirkkonummen datakeskus",
  "Vihdin datakeskus": "Vihdin datakeskus",
  "Forssan datakeskus": "Forssan datakeskus",
  "Tuike Finland Oy palvelinkeskus": "Palvelinkeskus Hamina",
  "Jokelan datakeskushanke": "Jokelan datakeskushanke",
  "Järvenpään palvelinkeskus": "Järvenpään palvelinkeskus",
  "Kouvolan datakeskus, Hyperco Data Systems Oy":
    "Kouvolan datakeskus, Hyperco Data Systems Oy",
  "Lohjan palvelinkeskus (Hyperco)": "Hyperco Lohja, Virkkala",
  "Pyhäjoen datakeskus": "Hyperco Pyhäjoki, Keskikylä",
};

function pdfSivu(sivu: string): number | null {
  const m = sivu.trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function siisti(teksti: string): string {
  return teksti.replace(/\s+/g, " ").trim();
}

function kentta(
  arvo: string,
  lahde_url: string,
  lainaus: string,
  lahde_sivu: number | null,
) {
  return {
    arvo,
    lahde_url,
    lahde_sivu,
    lainaus,
    luottamus: "epavarma" as const,
    lahde_laji: "dokumentti" as const,
  };
}

function luokitteleMuut(rivi: HankeRivi): {
  arvo: MuutSijainnit;
  lainaus: string;
  sivu: number | null;
  huomautusLisa: string | null;
} {
  const mv = rivi.muita_vaihtoehtoja;
  const lainaus = siisti(mv.lainaus);
  const sivu = pdfSivu(mv.sivu);

  if (rivi.hanke_nimi.startsWith("Espoon") || rivi.hanke_nimi.startsWith("Kirkkonummen")
    || rivi.hanke_nimi.startsWith("Vihdin")) {
    return {
      arvo: "tarkasteltu_ja_nimetty",
      lainaus,
      sivu,
      huomautusLisa: null,
    };
  }
  if (rivi.hanke_nimi.startsWith("Forssan")) {
    return {
      arvo: "tarkasteltu_nimeamatta",
      lainaus,
      sivu,
      huomautusLisa: "Muita sijainteja ei nimetä.",
    };
  }
  if (rivi.hanke_nimi.startsWith("Tuike")) {
    return {
      arvo: "tarkasteltu_nimeamatta",
      lainaus,
      sivu,
      huomautusLisa:
        "Vaihtoehtoisia sijainteja ei sisällytetty Afryn arviointiin; lieventämisnäkökulma.",
    };
  }
  if (rivi.hanke_nimi.startsWith("Jokelan")) {
    return {
      arvo: "tarkasteltu_nimeamatta",
      lainaus:
        "Datakeskuksen sijainnille ei ole olemassa Tuusulassa muita toteuttamiskelpoisia vaihtoehtoja kuin nyt tarkasteltava Jokelaan sijoittuva hankevaihtoehto.",
      sivu: 8,
      huomautusLisa:
        "Lähde YVA-ohjelma 12.2.2026 (ei selostus). Selostus ei toista tätä perustelua.",
    };
  }
  if (rivi.hanke_nimi.startsWith("Pyhäjoen")) {
    return {
      arvo: "tarkasteltu_nimeamatta",
      lainaus,
      sivu,
      huomautusLisa: "Arvioituja kohteita ei nimetä.",
    };
  }
  if (rivi.hanke_nimi.startsWith("Lohjan")) {
    const per = rivi.perustelut[0];
    return {
      arvo: "tarkasteltu_nimeamatta",
      lainaus: siisti(per?.lainaus ?? lainaus),
      sivu: pdfSivu(per?.sivu ?? "") ?? sivu,
      huomautusLisa:
        "Selostus mainitsee pitkällisen prosessin; muita sijainteja ei kuvata.",
    };
  }
  // Järvenpää, Kouvola ym.: muita ei ilmene
  const per = rivi.perustelut[0];
  return {
    arvo: "ei_kasitelty",
    lainaus: siisti(per?.lainaus ?? ""),
    sivu: pdfSivu(per?.sivu ?? "") ?? null,
    huomautusLisa: "Muiden sijaintien tarkastelua ei löytynyt asiakirjasta.",
  };
}

function perusteluKentta(rivi: HankeRivi): {
  arvo: string;
  url: string;
  lainaus: string;
  sivu: number | null;
  huomautus: string | null;
} {
  if (rivi.hanke_nimi.startsWith("Jokelan")) {
    const lainaus =
      "Datakeskuksen sijainnille ei ole olemassa Tuusulassa muita toteuttamiskelpoisia vaihtoehtoja kuin nyt tarkasteltava Jokelaan sijoittuva hankevaihtoehto.";
    return {
      arvo: lainaus,
      url: JOKELA_OHJELMA_URL,
      lainaus,
      sivu: 8,
      huomautus:
        "Lähde YVA-ohjelma 12.2.2026, ei selostus. Selostus ei toista tätä perustelua.",
    };
  }
  const per = rivi.perustelut[0];
  if (!per) throw new Error(`Perustelu puuttuu: ${rivi.hanke_nimi}`);
  const lainaus = siisti(per.lainaus);
  return {
    arvo: lainaus,
    url: rivi.selostus_url,
    lainaus,
    sivu: pdfSivu(per.sivu),
    huomautus: rivi.huomio?.trim() || null,
  };
}

async function varmistaDokumentti(
  sb: ReturnType<typeof createClient>,
  url: string,
  otsikko: string,
): Promise<void> {
  const { data } = await sb
    .from("dokumentit")
    .select("id, lahde_tyyppi")
    .eq("url", url)
    .maybeSingle();
  if (data) {
    if (data.lahde_tyyppi !== "viranomaisasiakirja") {
      await sb
        .from("dokumentit")
        .update({ lahde_tyyppi: "viranomaisasiakirja" })
        .eq("id", data.id);
    }
    return;
  }
  const { error } = await sb.from("dokumentit").insert({
    url,
    otsikko,
    lahde_tyyppi: "viranomaisasiakirja",
    laji: url.includes("ohjelma") ? "yva_ohjelma" : "yva_selostus",
    muoto: "pdf",
    kieli: "fi",
  });
  if (error) console.warn(`dokumentti ${url}: ${error.message}`);
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const polkuArg = process.argv.find((a) => a.startsWith("--tiedosto="));
  const polku = polkuArg ? polkuArg.slice("--tiedosto=".length) : OLETUSTIEDOSTO;

  if (!existsSync(polku)) {
    throw new Error(`Aineisto puuttuu: ${polku}`);
  }

  const aineisto = JSON.parse(readFileSync(polku, "utf8")) as Aineisto;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  let tuotu = 0;
  let ohitettu = 0;

  for (const rivi of aineisto.hankkeet) {
    const dbNimi = HANKE_NIMI[rivi.hanke_nimi];
    if (!dbNimi) {
      console.log(`OHITA (ei nimeämistä): ${rivi.hanke_nimi}`);
      ohitettu += 1;
      continue;
    }

    const { data: hanke } = await sb
      .from("hankkeet")
      .select("id, nimi, sijaintiperustelu, muut_sijainnit")
      .eq("nimi", dbNimi)
      .eq("julkaistu", true)
      .maybeSingle();
    if (!hanke) {
      console.log(`OHITA (ei hanketta): ${dbNimi}`);
      ohitettu += 1;
      continue;
    }

    const { count } = await sb
      .from("muutosehdotukset")
      .select("id", { count: "exact", head: true })
      .eq("hanke_id", hanke.id)
      .eq("tila", "odottaa")
      .eq("ehdottaja_tunniste", EHDOTTAJA)
      .filter("sisalto->kentat->sijaintiperustelu", "not.is", null);
    if ((count ?? 0) > 0) {
      console.log(`OHITA (jo jonossa): ${dbNimi}`);
      ohitettu += 1;
      continue;
    }

    const per = perusteluKentta(rivi);
    const muut = luokitteleMuut(rivi);
    if (!per.lainaus || !muut.lainaus) {
      console.log(`OHITA (lainaus puuttuu): ${dbNimi}`);
      ohitettu += 1;
      continue;
    }

    const lahdeUrl = rivi.hanke_nimi.startsWith("Jokelan")
      ? JOKELA_OHJELMA_URL
      : rivi.selostus_url;
    const muutUrl = lahdeUrl;

    const huomautusOsat = [
      "Grok lähdeselvitys 11, sijainnin perustelu.",
      "Lähdetyyppi: viranomaisasiakirja.",
      per.huomautus,
      muut.huomautusLisa,
    ].filter(Boolean);

    const sisalto = {
      kentat: {
        sijaintiperustelu: kentta(per.arvo, per.url, per.lainaus, per.sivu),
        muut_sijainnit: kentta(muut.arvo, muutUrl, muut.lainaus, muut.sivu),
      },
      huomio: "sijaintiperustelu",
    };

    console.log(
      `${kuiva ? "[kuiva] " : ""}${dbNimi}: perustelu s.${per.sivu}, muut=${muut.arvo}`,
    );

    if (!kuiva) {
      await varmistaDokumentti(
        sb,
        lahdeUrl,
        rivi.hanke_nimi.startsWith("Jokelan")
          ? "YVA-ohjelma, Jokelan datakeskus 12.2.2026"
          : `YVA-selostus, ${dbNimi}`,
      );
      const { error } = await sb.from("muutosehdotukset").insert({
        tyyppi: "taydennys",
        hanke_id: hanke.id,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: EHDOTTAJA,
        lahde_url: lahdeUrl,
        huomautus: huomautusOsat.join(" "),
        tila: "odottaa",
        sisalto,
      });
      if (error) throw new Error(`${dbNimi}: ${error.message}`);
    }
    tuotu += 1;
  }

  console.log(JSON.stringify({ tuotu, ohitettu, kuiva }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
