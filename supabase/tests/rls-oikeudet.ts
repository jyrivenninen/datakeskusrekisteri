/**
 * PostgREST-polku (anon-JWT). Kannan roolit todistetaan
 * supabase/tests/rls-oikeudet.sql-tiedostossa (`npm run test:rls`).
 * Palvelinavain on valinnainen; älä liitä avainta chattiin.
 */
import { createClient } from "@supabase/supabase-js";
import { luoAgenttiAsiakas } from "../../agents/agentti-asiakas";
import { lataaPaikallinenYmparisto } from "../../agents/ymparisto";

const LOKITAULUT = [
  "dokumentti_tiivisteet",
  "rajapinta_tiivisteet",
  "mallikutsut",
  "palautteet",
] as const;

function vaadiYmparisto() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const palvelin = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const agentti = process.env.SUPABASE_AGENTTI_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja NEXT_PUBLIC_SUPABASE_ANON_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  return { url, anon, palvelin, agentti };
}

function virheTeksti(syy: { message?: string; code?: string } | null): string {
  return `${syy?.code ?? ""} ${syy?.message ?? ""}`.toLowerCase();
}

function onOikeusvirhe(syy: { message?: string; code?: string } | null): boolean {
  const t = virheTeksti(syy);
  return (
    t.includes("permission") ||
    t.includes("denied") ||
    t.includes("not allowed") ||
    t.includes("42501") ||
    t.includes("row-level security") ||
    t.includes("rls")
  );
}

async function main() {
  const { url, anon, palvelin, agentti } = vaadiYmparisto();
  const anonAsiakas = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (palvelin) {
    const palvelinAsiakas = createClient(url, palvelin, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: lisaysVirhe } = await palvelinAsiakas.from("hankkeet").insert({
      nimi: "RLS-testi älä julkaise",
      kunta: "Testikunta",
      vaihe: "esiselvitys",
      julkaistu: true,
    });
    if (!lisaysVirhe) {
      throw new Error("service_role pystyi lisäämään rivin hankkeet-tauluun.");
    }
    if (!onOikeusvirhe(lisaysVirhe)) {
      throw new Error(
        `service_role-insert hylättiin väärästä syystä (odotettu oikeusvirhe): ${lisaysVirhe.message}`,
      );
    }
  } else {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY puuttuu — service_role-testi ohitetaan. Aja test:rls kannassa.",
    );
  }

  if (agentti) {
    const agenttiAsiakas = luoAgenttiAsiakas();
    const { error: julkaisuVirhe } = await agenttiAsiakas.from("hankkeet").insert({
      nimi: "RLS-testi agentti älä julkaise",
      kunta: "Testikunta",
      vaihe: "esiselvitys",
      julkaistu: true,
    });
    if (!julkaisuVirhe) {
      throw new Error("agentti-JWT pystyi lisäämään rivin hankkeet-tauluun.");
    }
    if (!onOikeusvirhe(julkaisuVirhe)) {
      throw new Error(
        `agentti-insert hylättiin väärästä syystä: ${julkaisuVirhe.message}`,
      );
    }

    const { data: hankkeet, error: lukuVirhe } = await agenttiAsiakas
      .from("hankkeet")
      .select("id")
      .eq("julkaistu", true)
      .limit(1);
    if (lukuVirhe) {
      throw new Error(`agentti ei voi lukea hankkeita: ${lukuVirhe.message}`);
    }
    if (!hankkeet?.length) {
      console.warn("agentti-luku: ei julkaistuja hankkeita testattavaksi (tyhjä kanta ok).");
    }

    const { error: rpcVirhe } = await agenttiAsiakas.rpc("julkaise_ehdotetut_tiedot", {
      p_tyyppi: "taydennys",
      p_hanke_id: "00000000-0000-0000-0000-000000000001",
      p_hanke: {},
      p_lahteet: [],
      p_ehdotus_id: "00000000-0000-0000-0000-000000000002",
      p_kasittelija: "rls-testi",
    });
    if (!rpcVirhe) {
      throw new Error("agentti-JWT pystyi kutsumaan julkaise_ehdotetut_tiedot.");
    }
    if (!onOikeusvirhe(rpcVirhe)) {
      throw new Error(
        `agentti-RPC hylättiin väärästä syystä: ${rpcVirhe.message}`,
      );
    }

    const { error: agenttiJulkaisuVirhe } = await agenttiAsiakas.rpc(
      "julkaise_agentti_ehdotus",
      { p_ehdotus_id: "00000000-0000-0000-0000-000000000099" },
    );
    if (!agenttiJulkaisuVirhe) {
      throw new Error(
        "agentti-JWT pystyi kutsumaan julkaise_agentti_ehdotus olemattomalla ehdotuksella ilman virhettä.",
      );
    }

    const { error: lokiVirhe } = await agenttiAsiakas.from("mallikutsut").select("id").limit(1);
    if (!lokiVirhe) {
      throw new Error("agentti-JWT sai lukea mallikutsut-taulun.");
    }
    if (!onOikeusvirhe(lokiVirhe)) {
      throw new Error(`agentti-loki hylättiin väärästä syystä: ${lokiVirhe.message}`);
    }
  } else {
    console.warn(
      "SUPABASE_AGENTTI_KEY puuttuu — agentti-JWT-testi ohitetaan. Luo: npm run agentti:jwt",
    );
  }

  for (const taulu of LOKITAULUT) {
    const { data, error } = await anonAsiakas.from(taulu).select("id").limit(5);
    if (error) {
      if (!onOikeusvirhe(error)) {
        throw new Error(
          `anon-luku taulusta ${taulu} epäonnistui odottamattomasti: ${error.message}`,
        );
      }
      continue;
    }
    if ((data ?? []).length > 0) {
      throw new Error(`anon-avain näki rivejä taulusta ${taulu}.`);
    }
    throw new Error(
      `anon-avain sai lukea taulun ${taulu} ilman virhettä (tyhjä tulos ei riitä, jos taulu on tyhjä).`,
    );
  }

  console.log(
    "PostgREST-RLS ok: service_role/agentti eivät julkaise suoraan; agentti saa julkaise_agentti_ehdotus; anon ei lue lokitauluja.",
  );
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
