/**
 * Ilmoitus 797c6be8: LVV-kuulutus Polarnode Kangasala Ruutanaan.
 * Ei uutta hanketta, ei kenttälähdettä, ei nimen muutosta.
 *
 * Aja: npx tsx scripts/polarnode-tarasten-lv-kuulutus-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { julkaiseDokumenttiLahdeMetatiedot } from "../src/lib/supabase/hyvaksynta";

const HANKE_ID = "543da204-be31-4d5a-8db2-45522680c05c";
const ILMOITUS_ID = "797c6be8-0687-4e6d-bbfb-5cee92e4bb4f";
const KASITTELIJA = "ylläpito";

const PDF_URL =
  "https://www.kangasala.fi/wp-content/uploads/sites/2/2026/09/Kuulutus-Paatos-YVA-menettelyn-soveltamisesta-Polarnode-Oy-2x400-kV-voimajohto-Kangasala.pdf";
const OTSIKKO =
  "Kuulutus, päätös YVA-menettelyn soveltamisesta, Polarnode Oy, Kangasalan 2x400 kV voimajohto (LVV-U/101946/2026)";
const JULKAISIJA = "Lupa- ja valvontavirasto";
const JULKAISTU_PVM = "2026-09-17";

const HUOMAUTUS_LISAYS =
  "LVV päätti 15.9.2026 (LVV-U/101946/2026), että Polarnode Oy:n noin 5 km:n 2x400 kV voimajohtohankkeeseen Kangasalan sähköasemalta Tarasten kiertotalousalueelle ei sovelleta YVA-menettelyä. Kuulutus ei mainitse datakeskusta. Asiakirja on liitetty hankkeeseen alueen nimen (Tarasten) perusteella.";

const PERUSTELU =
  `Täydennetty olemassa olevaa hanketta Polarnode Kangasala, Ruutana (${HANKE_ID}): LVV-kuulutus asiakirjoihin ja huomautus. Ei uutta hanketta (nimi «Tarasten kiertotalousalue» on alueen nimi).`;

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: hanke, error: hVirhe } = await sb
    .from("hankkeet")
    .select("id, nimi, kunta, huomautus")
    .eq("id", HANKE_ID)
    .single();
  if (hVirhe || !hanke) throw new Error(hVirhe?.message ?? "hanke puuttuu");
  console.log("hanke:", hanke.nimi, hanke.kunta);

  // 1) Dokumentti
  const { data: olemassa } = await sb
    .from("dokumentit")
    .select("id, hanke_id, lahde_tyyppi, julkaisija, julkaistu_pvm, otsikko")
    .eq("url", PDF_URL)
    .maybeSingle();

  let dokumenttiId = olemassa?.id as string | undefined;
  if (!dokumenttiId || olemassa?.hanke_id !== HANKE_ID) {
    const { data: id, error } = await sb.rpc("lisaa_hanke_dokumentti", {
      p_hanke_id: HANKE_ID,
      p_url: PDF_URL,
      p_otsikko: OTSIKKO,
      p_laji: "muu",
      p_muoto: "pdf",
      p_lahde_url: PDF_URL,
      p_kasittelija: KASITTELIJA,
    });
    if (error) throw new Error(`lisaa_hanke_dokumentti: ${error.message}`);
    dokumenttiId = id as string;
    console.log("dokumentti liitetty", dokumenttiId);
  } else {
    console.log("dokumentti jo listalla", dokumenttiId);
  }

  // trg_dokumentit_lahteet: julkaisija ja julkaistu_pvm vaativat lähteen ennen UPDATE
  for (const [kentta, lainaus] of [
    ["julkaisija", JULKAISIJA],
    ["julkaistu_pvm", JULKAISTU_PVM],
  ] as const) {
    const { error: lahdeVirhe } = await sb.rpc("tallenna_kentta_lahde", {
      p_taulu: "dokumentit",
      p_rivi_id: dokumenttiId,
      p_kentta: kentta,
      p_lahde_url: PDF_URL,
      p_lahde_sivu: null,
      p_vahvistettu_pvm: new Date().toISOString().slice(0, 10),
      p_luottamus: "epavarma",
      p_lainaus: lainaus,
      p_merkitty: "ihmisen_vahvistama",
      p_lahde_laji: "dokumentti",
    });
    if (lahdeVirhe) throw new Error(`${kentta}-lahde: ${lahdeVirhe.message}`);
  }

  const { data: odottaaMeta } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("hanke_id", HANKE_ID)
    .eq("lahde_url", PDF_URL)
    .eq("tyyppi", "lahde_tyyppi_havainto")
    .eq("tila", "odottaa")
    .maybeSingle();

  let metaId = odottaaMeta?.id as string | undefined;
  if (!metaId) {
    const { data: ehdotus, error: eVirhe } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "lahde_tyyppi_havainto",
        hanke_id: HANKE_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: PDF_URL,
        sisalto: {
          lahde_metatiedot: {
            dokumentti_id: dokumenttiId,
            ehdotettu_lahde_tyyppi: "viranomaisasiakirja",
            ehdotettu_sitovuustaso: "virallinen",
            ehdotettu_otsikko: OTSIKKO,
            ehdotettu_julkaisija: JULKAISIJA,
            ehdotettu_julkaistu_pvm: JULKAISTU_PVM,
            nykyinen_lahde_tyyppi: olemassa?.lahde_tyyppi ?? "muu",
            nykyinen_sitovuustaso: "epavirallinen",
          },
        },
      })
      .select("id")
      .single();
    if (eVirhe || !ehdotus) throw new Error(eVirhe?.message ?? "meta-ehdotus");
    metaId = ehdotus.id;
  }

  await julkaiseDokumenttiLahdeMetatiedot(
    {
      dokumenttiId: dokumenttiId!,
      lahdeTyyppi: "viranomaisasiakirja",
      sitovuustaso: "virallinen",
      otsikko: OTSIKKO,
      ehdotusId: metaId!,
    },
    KASITTELIJA,
  );
  console.log("metatiedot: viranomaisasiakirja /", JULKAISIJA, JULKAISTU_PVM);

  // 2) Huomautus (ei kenttälähdettä)
  const vanha = (hanke.huomautus ?? "").trim();
  if (vanha.includes("LVV-U/101946/2026")) {
    console.log("huomautus jo sisältää LVV-viittauksen");
  } else {
    const uusiHuom = vanha ? `${vanha}\n\n${HUOMAUTUS_LISAYS}` : HUOMAUTUS_LISAYS;
    const { data: huomEhdotus, error: huomVirhe } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "taydennys",
        hanke_id: HANKE_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: PDF_URL,
        sisalto: {
          huomio: "hanke-huomautus",
          kentat: {
            huomautus: {
              arvo: uusiHuom,
              lahde_url: PDF_URL,
              lahde_sivu: 1,
              lahde_laji: "dokumentti",
              luottamus: "epavarma",
              lainaus:
                "LVV-U/101946/2026: YVA-menettelyä ei sovelleta; kuulutus ei mainitse datakeskusta.",
            },
          },
        },
      })
      .select("id")
      .single();
    if (huomVirhe || !huomEhdotus) {
      throw new Error(huomVirhe?.message ?? "huomautus-ehdotus");
    }
    const { error: rpcVirhe } = await sb.rpc("julkaise_hanke_huomautus", {
      p_ehdotus_id: huomEhdotus.id,
      p_kasittelija: KASITTELIJA,
    });
    if (rpcVirhe) throw new Error(`julkaise_hanke_huomautus: ${rpcVirhe.message}`);
    console.log("huomautus julkaistu");
  }

  // 3) Sulje ilmoitus viittauksella olemassa olevaan
  const { data: ilmoitus, error: iVirhe } = await sb
    .from("muutosehdotukset")
    .select("id, tila, tyyppi")
    .eq("id", ILMOITUS_ID)
    .maybeSingle();
  if (iVirhe) throw new Error(iVirhe.message);
  if (!ilmoitus) {
    console.log("ilmoitus ei löytynyt");
  } else if (ilmoitus.tila !== "odottaa") {
    console.log("ilmoitus jo käsitelty:", ilmoitus.tila);
  } else {
    const { error: sulkuVirhe } = await sb
      .from("muutosehdotukset")
      .update({
        tila: "hyvaksytty",
        hanke_id: HANKE_ID,
        kasitelty_pvm: new Date().toISOString(),
        kasittelija: KASITTELIJA,
        perustelu: PERUSTELU,
      })
      .eq("id", ILMOITUS_ID)
      .eq("tila", "odottaa");
    if (sulkuVirhe) throw new Error(`ilmoituksen sulku: ${sulkuVirhe.message}`);
    console.log("ilmoitus suljettu →", HANKE_ID);
  }

  console.log("Valmis");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
