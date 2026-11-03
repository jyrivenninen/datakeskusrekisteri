/**
 * Regant Hyperterra Salo Kärkkä: DC1 organisaatio, roolit, omistussuhde,
 * toimija-muutos jonoon.
 *
 * Vaatii migraation julkaise_organisaatio_yritys (RPC, ei suoraa INSERT).
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const HANKE_ID = "532bf1f0-c5cf-44b8-8365-1454839d361d";
const REGANT_OY_ID = "09ba06d5-a554-4bc6-8250-8a1de21abebc";
const DC1_Y_TUNNUS = "3606181-7";
const DC1_NIMI = "Regant DC1 Oy";
const LAHDE_URL = "https://salo10.oncloudos.com/kokous/20261089-5.PDF";
const LAHDE_KOHTA = "Kaupunginhallituksen päätös 10.8.2026 § 260";
const HANKEYHTIO_ALKAEN = "2026-03-20";
const EHDOTTAJA = "regant_hyperterra_korjaus";

async function haeTaiLuoDc1(sb: ReturnType<typeof createClient>) {
  const { data: orgId, error } = await sb.rpc("julkaise_organisaatio_yritys", {
    p_nimi: DC1_NIMI,
    p_y_tunnus: DC1_Y_TUNNUS,
    p_lahde_url: LAHDE_URL,
    p_vahvistettu_pvm: "2026-08-10",
    p_lainaus: LAHDE_KOHTA,
    p_merkitty: "ihmisen_vahvistama",
    p_ytj_lahde_url: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${DC1_Y_TUNNUS}`,
  });
  if (error) throw error;
  if (!orgId) throw new Error("julkaise_organisaatio_yritys ei palauttanut id:tä");
  return orgId as string;
}

async function lisaaHankeRooli(
  sb: ReturnType<typeof createClient>,
  organisaatioId: string,
  rooli: string,
  voimassaAlkaen: string | null,
) {
  const { data: olemassa } = await sb
    .from("hanke_organisaatiot")
    .select("id")
    .eq("hanke_id", HANKE_ID)
    .eq("organisaatio_id", organisaatioId)
    .eq("rooli", rooli)
    .maybeSingle();

  if (olemassa?.id) {
    console.log(`Rooli ${rooli} jo olemassa (${olemassa.id})`);
    return olemassa.id as string;
  }

  const { data: rivi, error } = await sb
    .from("hanke_organisaatiot")
    .insert({
      hanke_id: HANKE_ID,
      organisaatio_id: organisaatioId,
      rooli,
      julkaistu: true,
      voimassa_alkaen: voimassaAlkaen,
      lahde_url: LAHDE_URL,
      lahde_kohta: LAHDE_KOHTA,
    })
    .select("id")
    .single();
  if (error || !rivi) throw error ?? new Error(`Rooli ${rooli} insert`);

  const riviId = rivi.id as string;
  for (const kentta of ["organisaatio_id", "rooli"] as const) {
    const { error: lVirhe } = await sb.rpc("tallenna_kentta_lahde", {
      p_taulu: "hanke_organisaatiot",
      p_rivi_id: riviId,
      p_kentta: kentta,
      p_lahde_url: LAHDE_URL,
      p_lahde_sivu: null,
      p_vahvistettu_pvm: voimassaAlkaen ?? "2026-08-10",
      p_luottamus: "vahvistettu",
      p_lainaus: LAHDE_KOHTA,
      p_merkitty: "ihmisen_vahvistama",
      p_lahde_laji: "dokumentti",
    });
    if (lVirhe) throw lVirhe;
  }
  console.log(`Lisätty rooli ${rooli}: ${riviId}`);
  return riviId;
}

async function lisaaOmistussuhde(sb: ReturnType<typeof createClient>, dc1Id: string) {
  const { data: olemassa } = await sb
    .from("organisaatio_suhteet")
    .select("id")
    .eq("lahde_organisaatio_id", REGANT_OY_ID)
    .eq("kohde_organisaatio_id", dc1Id)
    .eq("suhde_tunnus", "omistus")
    .maybeSingle();

  if (olemassa?.id) {
    console.log(`Omistussuhde jo olemassa (${olemassa.id})`);
    return;
  }

  const { error } = await sb.from("organisaatio_suhteet").insert({
    lahde_organisaatio_id: REGANT_OY_ID,
    kohde_organisaatio_id: dc1Id,
    suhde_tunnus: "omistus",
    voimassa_alkaen: "2026-08-10",
    lahde_url: LAHDE_URL,
    lahde_kohta: LAHDE_KOHTA,
    julkaistu: true,
  });
  if (error) throw error;
  console.log("Omistussuhde Regant Oy -> Regant DC1 Oy kirjattu.");
}

async function jonoToimijaMuutos(sb: ReturnType<typeof createClient>, dc1Id: string) {
  const { data: odottaa, error: jonoVirhe } = await sb
    .from("muutosehdotukset")
    .select("id, sisalto")
    .eq("hanke_id", HANKE_ID)
    .eq("tyyppi", "korjaus")
    .eq("tila", "odottaa");
  if (jonoVirhe) throw jonoVirhe;

  const joJonossa = (odottaa ?? []).find(
    (e) =>
      e.sisalto &&
      typeof e.sisalto === "object" &&
      "kentat" in (e.sisalto as object) &&
      (e.sisalto as { kentat?: Record<string, unknown> }).kentat?.toimija_organisaatio_id,
  );
  if (joJonossa) {
    console.log("Toimija-korjaus jo jonossa:", joJonossa.id);
    return;
  }

  const sisalto = {
    kentat: {
      toimija_organisaatio_id: {
        arvo: dc1Id,
        lahde_url: LAHDE_URL,
        lahde_sivu: null,
        vahvistettu_pvm: HANKEYHTIO_ALKAEN,
        luottamus: "vahvistettu",
        lainaus: LAHDE_KOHTA,
        merkitty: "koneen_ehdottama",
        lahde_laji: "dokumentti",
      },
    },
  };

  const { data, error } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "korjaus",
      hanke_id: HANKE_ID,
      ehdottaja_tyyppi: "agentti",
      ehdottaja_tunniste: EHDOTTAJA,
      sisalto,
      tila: "odottaa",
      huomautus:
        "Hankeyhtiösiirto 20.3.2026: toimija_organisaatio_id Regant DC1 Oy:lle. Hyväksy yllapidossa.",
      lahde_url: LAHDE_URL,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("muutosehdotus insert");
  console.log("Toimija-muutos jonossa:", data.id);
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-ympäristö puuttuu");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const dc1Id = await haeTaiLuoDc1(sb);
  console.log("Regant DC1 Oy:", dc1Id);

  await lisaaHankeRooli(sb, dc1Id, "hankeyhtio", HANKEYHTIO_ALKAEN);
  await lisaaHankeRooli(sb, REGANT_OY_ID, "emoyhtio", null);
  await lisaaOmistussuhde(sb, dc1Id);
  await jonoToimijaMuutos(sb, dc1Id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
