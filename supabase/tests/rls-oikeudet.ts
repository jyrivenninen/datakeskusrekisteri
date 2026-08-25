/**
 * PostgREST-polku (anon-JWT). Kannan roolit todistetaan
 * supabase/tests/rls-oikeudet.sql-tiedostossa (`npm run test:rls`).
 * Palvelinavain on valinnainen; älä liitä avainta chattiin.
 */
import { createClient } from "@supabase/supabase-js";
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
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja NEXT_PUBLIC_SUPABASE_ANON_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  return { url, anon, palvelin };
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
  const { url, anon, palvelin } = vaadiYmparisto();
  if (!palvelin) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY puuttuu. Lisää se .env.local-tiedostoon (ohje chatin numeroinnissa). Älä liitä avainta chattiin.",
    );
  }
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
    "PostgREST-RLS ok: service_role ei lisää hankkeisiin; anon ei lue tiiviste- ja mallilokeja.",
  );
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
