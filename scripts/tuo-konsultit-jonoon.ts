/**
 * Vaihe 1: konsulttiorganisaatiot + hanke_organisaatio-roolit jonoon.
 * Ei hyväksy jonosta. Aja: npx tsx scripts/tuo-konsultit-jonoon.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const EHDOTTAJA = "ylläpito";
const PVM = "2026-10-11";

type OrgMaaritys = {
  nimi: string;
  y_tunnus: string | null;
};

type RooliMaaritys = {
  hankeNimi: string;
  kunta?: string;
  orgNimi: string;
  selostusUrl: string;
  dokId?: string;
  lahdeSivu: number;
  lainaus: string;
};

const ORGANISAATIOT: OrgMaaritys[] = [
  { nimi: "Sweco UK Ltd", y_tunnus: null },
  { nimi: "Sipti Environment Oy", y_tunnus: "2988140-3" },
  { nimi: "Arup International Projects Oy", y_tunnus: null },
  { nimi: "Granlund Oy", y_tunnus: "1704694-5" },
  { nimi: "Sitowise Oy", y_tunnus: "2335445-0" },
  { nimi: "AFRY Finland Oy", y_tunnus: "0625905-6" },
  { nimi: "Anthesis Finland Oy", y_tunnus: "2802954-2" },
  { nimi: "Ramboll", y_tunnus: null },
];

const ROOLIT: RooliMaaritys[] = [
  {
    hankeNimi: "Espoon datakeskusalue",
    orgNimi: "Sweco UK Ltd",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Espoo_datak_YVA_Selostus_20240129_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Sweco UK Ltd (kansilehti / yhteystiedot)",
  },
  {
    hankeNimi: "Espoon datakeskusalue",
    orgNimi: "Sipti Environment Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Microsoft_Espoo_datak_YVA_Selostus_20240129_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Sipti Environment Oy (kansilehti / yhteystiedot)",
  },
  {
    hankeNimi: "Kirkkonummen datakeskus",
    orgNimi: "Sweco UK Ltd",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Arviointiselostus_Kirkkonummen_datakeskus_2024.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Sweco UK Ltd (kansilehti / yhteystiedot)",
  },
  {
    hankeNimi: "Kirkkonummen datakeskus",
    orgNimi: "Sipti Environment Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Arviointiselostus_Kirkkonummen_datakeskus_2024.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Sipti Environment Oy (kansilehti / yhteystiedot)",
  },
  {
    hankeNimi: "Vihdin datakeskus",
    orgNimi: "Sweco UK Ltd",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/2024-02-01%20Microsoft%20Vihti%20YVA%20Selostus_0_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Sweco UK Ltd (kansilehti / yhteystiedot)",
  },
  {
    hankeNimi: "Vihdin datakeskus",
    orgNimi: "Sipti Environment Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/2024-02-01%20Microsoft%20Vihti%20YVA%20Selostus_0_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Sipti Environment Oy (kansilehti / yhteystiedot)",
  },
  {
    hankeNimi: "Forssan datakeskus",
    orgNimi: "Arup International Projects Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Forssan_datakeskuksen_YVA-selostus.pdf",
    lahdeSivu: 1,
    lainaus: "Laatija: Arup International Projects Oy (kansilehti)",
  },
  {
    hankeNimi: "Forssan datakeskus",
    orgNimi: "Granlund Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Forssan_datakeskuksen_YVA-selostus.pdf",
    lahdeSivu: 1,
    lainaus: "Laatija: Granlund Oy (kansilehti)",
  },
  {
    hankeNimi: "Forssan datakeskus",
    orgNimi: "Sitowise Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Forssan_datakeskuksen_YVA-selostus.pdf",
    lahdeSivu: 1,
    lainaus: "Laatija: Sitowise Oy (kansilehti)",
  },
  {
    hankeNimi: "Jokelan datakeskushanke",
    orgNimi: "AFRY Finland Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/QTS_Jokelan_datakeskus_YVA-selostus_11.6.2026_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: AFRY Finland Oy (kansilehti)",
  },
  {
    hankeNimi: "Palvelinkeskus Hamina",
    orgNimi: "Anthesis Finland Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Tuike%20Finland%20Oy%20-%20YVA%20selostus%20-%201%20versio%20-%2020240320.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Anthesis Finland Oy (kansilehti)",
  },
  {
    hankeNimi: "Kouvolan datakeskus, Hyperco Data Systems Oy",
    orgNimi: "Anthesis Finland Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Hyperco%20Data%20System%20Oy%20-%20Kouvola%20YVA-selostus%20-%20julkaisuversio%2020260219_teksti_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Anthesis Finland Oy (kansilehti)",
  },
  {
    hankeNimi: "Hyperco Lohja, Virkkala",
    orgNimi: "Anthesis Finland Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/Hyperco%20Oy%20-%20YVA-selostus%20-%20julkaisuversio%20-%2020250410%20-%20teksti.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Anthesis Finland Oy (kansilehti)",
  },
  {
    hankeNimi: "Hyperco Pyhäjoki, Keskikylä",
    orgNimi: "Anthesis Finland Oy",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/YVA-selostus_Pyh%C3%A4joen%20datakeskus_Hyperco%20Intelligence%20Oy_0.pdf",
    lahdeSivu: 1,
    lainaus: "Konsultti: Anthesis Finland Oy (kansilehti)",
  },
  {
    hankeNimi: "Järvenpään palvelinkeskus",
    orgNimi: "Ramboll",
    selostusUrl:
      "https://www.ymparisto.fi/sites/default/files/documents/J%C3%A4rvenp%C3%A4%C3%A4n%20datakeskus%20YVA-selostus_saavutettava_FINAL_0.pdf",
    lahdeSivu: 1,
    lainaus: 'Kansilehdellä "Ramboll" (ilman yhtiön koko nimeä)',
  },
];

async function haeTaiLuoOrg(
  sb: SupabaseClient,
  org: OrgMaaritys,
  lahdeUrl: string,
): Promise<string> {
  if (org.y_tunnus) {
    const { data: olemassa } = await sb
      .from("organisaatiot")
      .select("id")
      .eq("y_tunnus", org.y_tunnus)
      .maybeSingle();
    if (olemassa?.id) return olemassa.id as string;

    const { data, error } = await sb.rpc("julkaise_organisaatio_yritys", {
      p_nimi: org.nimi,
      p_y_tunnus: org.y_tunnus,
      p_lahde_url: lahdeUrl,
      p_vahvistettu_pvm: PVM,
      p_lainaus: org.nimi,
      p_merkitty: "ihmisen_vahvistama",
      p_ytj_lahde_url: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${org.y_tunnus}`,
    });
    if (error) throw new Error(`${org.nimi}: ${error.message}`);
    return data as string;
  }

  const { data: nimiOsuma } = await sb
    .from("organisaatiot")
    .select("id")
    .eq("julkaistu", true)
    .ilike("nimi", org.nimi)
    .maybeSingle();
  if (nimiOsuma?.id) return nimiOsuma.id as string;

  const { data, error } = await sb.rpc("julkaise_organisaatio_ilman_ytunnusta", {
    p_nimi: org.nimi,
    p_lahde_url: lahdeUrl,
    p_vahvistettu_pvm: PVM,
    p_lainaus: org.nimi,
    p_merkitty: "ihmisen_vahvistama",
  });
  if (error) throw new Error(`${org.nimi}: ${error.message}`);
  return data as string;
}

async function haeDokId(sb: SupabaseClient, hankeId: string, url: string): Promise<string | null> {
  const { data } = await sb
    .from("dokumentit")
    .select("id")
    .eq("hanke_id", hankeId)
    .eq("url", url)
    .eq("julkaistu", true)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function jonoRooli(
  sb: SupabaseClient,
  hankeId: string,
  orgId: string,
  r: RooliMaaritys,
  dokId: string | null,
): Promise<"uusi" | "jo"> {
  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id, sisalto")
    .eq("hanke_id", hankeId)
    .eq("tyyppi", "hanke_organisaatio")
    .eq("tila", "odottaa");

  const jo = (odottaa ?? []).some((e) => {
    const sis = e.sisalto as { hanke_organisaatio?: { organisaatio_id?: string; rooli?: string } };
    return (
      sis.hanke_organisaatio?.organisaatio_id === orgId &&
      sis.hanke_organisaatio?.rooli === "konsultti"
    );
  });
  if (jo) return "jo";

  const { data: julkaistu } = await sb
    .from("hanke_organisaatiot")
    .select("id")
    .eq("hanke_id", hankeId)
    .eq("organisaatio_id", orgId)
    .eq("rooli", "konsultti")
    .eq("julkaistu", true)
    .maybeSingle();
  if (julkaistu?.id) return "jo";

  const lahteet = ["organisaatio_id", "rooli"].map((kentta) => ({
    kentta,
    lahde_url: r.selostusUrl,
    lahde_sivu: r.lahdeSivu,
    lahde_laji: "dokumentti",
    vahvistettu_pvm: PVM,
    luottamus: "epavarma",
    lainaus: r.lainaus,
    merkitty: "koneen_ehdottama",
  }));

  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "hanke_organisaatio",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "yllapitaja",
    ehdottaja_tunniste: EHDOTTAJA,
    lahde_url: r.selostusUrl,
    huomautus: `Konsulttirooli YVA-selostuksesta: ${r.orgNimi}.`,
    tila: "odottaa",
    sisalto: {
      hanke_organisaatio: {
        organisaatio_id: orgId,
        organisaatio_nimi: r.orgNimi,
        rooli: "konsultti",
        lahde_dokumentti_id: dokId,
        lahde_url: r.selostusUrl,
        lahde_kohta: `s. ${r.lahdeSivu}`,
        lahteet,
      },
    },
  });
  if (error) throw new Error(`${r.hankeNimi}/${r.orgNimi}: ${error.message}`);
  return "uusi";
}

async function siivousRaportti(sb: SupabaseClient) {
  const { data: regantit } = await sb
    .from("organisaatiot")
    .select("id, nimi, y_tunnus, julkaistu, slug")
    .ilike("nimi", "Regant Oy")
    .order("y_tunnus", { nullsFirst: true });

  const { count: ilmanYtunnusta } = await sb
    .from("organisaatiot")
    .select("id", { count: "exact", head: true })
    .eq("julkaistu", true)
    .is("y_tunnus", null);

  const { data: kaikkiOrg } = await sb.from("organisaatiot").select("id").eq("julkaistu", true);
  const { data: roolit } = await sb
    .from("hanke_organisaatiot")
    .select("organisaatio_id")
    .eq("julkaistu", true);
  const { data: hankkeetToimija } = await sb
    .from("hankkeet")
    .select("toimija_organisaatio_id")
    .eq("julkaistu", true)
    .not("toimija_organisaatio_id", "is", null);
  const { data: paatokset } = await sb
    .from("paatokset")
    .select("paattava_organisaatio_id")
    .eq("julkaistu", true)
    .not("paattava_organisaatio_id", "is", null);

  const liitetyt = new Set<string>();
  for (const r of roolit ?? []) liitetyt.add(r.organisaatio_id as string);
  for (const r of hankkeetToimija ?? []) {
    if (r.toimija_organisaatio_id) liitetyt.add(r.toimija_organisaatio_id as string);
  }
  for (const r of paatokset ?? []) {
    if (r.paattava_organisaatio_id) liitetyt.add(r.paattava_organisaatio_id as string);
  }
  const ilmanHanketta = (kaikkiOrg ?? []).filter((o) => !liitetyt.has(o.id as string)).length;

  console.log("\n=== Vaihe 2: siivousraportti (ei korjattu) ===");
  console.log("Regant Oy -rivit:", JSON.stringify(regantit, null, 2));
  console.log("Julkaistuja ilman Y-tunnusta:", ilmanYtunnusta ?? 0);
  console.log("Julkaistuja ilman mitään hankeliitosta:", ilmanHanketta);
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-ympäristö puuttuu");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const lahdeEka =
    ROOLIT.find((r) => r.orgNimi === "Sweco UK Ltd")?.selostusUrl ?? ROOLIT[0].selostusUrl;

  const orgIdt = new Map<string, string>();
  let uusiaOrgeja = 0;
  for (const org of ORGANISAATIOT) {
    const { data: ennen } = await sb
      .from("organisaatiot")
      .select("id")
      .eq("julkaistu", true)
      .ilike("nimi", org.nimi)
      .maybeSingle();
    const id = await haeTaiLuoOrg(sb, org, lahdeEka);
    orgIdt.set(org.nimi, id);
    if (!ennen?.id) uusiaOrgeja += 1;
    console.log("org", org.nimi, id, org.y_tunnus ?? "(ei Y-tunnusta)");
  }

  let uusiaRooloja = 0;
  let joOli = 0;
  for (const r of ROOLIT) {
    const { data: hanke, error } = await sb
      .from("hankkeet")
      .select("id")
      .eq("julkaistu", true)
      .eq("nimi", r.hankeNimi)
      .maybeSingle();
    if (error || !hanke) throw new Error(`Hanke puuttuu: ${r.hankeNimi}`);
    const orgId = orgIdt.get(r.orgNimi);
    if (!orgId) throw new Error(`Org puuttuu: ${r.orgNimi}`);
    const dokId = await haeDokId(sb, hanke.id as string, r.selostusUrl);
    const tulos = await jonoRooli(sb, hanke.id as string, orgId, r, dokId);
    if (tulos === "uusi") uusiaRooloja += 1;
    else joOli += 1;
    console.log("rooli", r.hankeNimi, "→", r.orgNimi, tulos, dokId ? "dok" : "url");
  }

  console.log("\n=== Vaihe 1 valmis ===");
  console.log("Uusia organisaatioita:", uusiaOrgeja);
  console.log("Konsulttirooleja jonoon:", uusiaRooloja, "(jo oli:", joOli + ")");
  console.log(
    "Roolitaulu sallii useita konsultteja / hanke: UNIQUE (hanke, org, rooli) on poistettu; rajoitus vain FK rooli-tauluun.",
  );

  await siivousRaportti(sb);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
