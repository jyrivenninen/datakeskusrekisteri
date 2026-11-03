/**
 * Lähdeselvitys 9 jatko: hyväksy Parkano, täydennä Ecogrid Raisio,
 * monitoimi-huomautukset Parkano + Hummastinvaara.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const PARKANO_EHDOTUS = "4062a0a3-ba17-43f1-98cc-0d50956f6384";
const ENERTIA_VINKKI = "09a00089-7280-4e8b-816f-be8e37efa10b";
const ECOGRID_RAISIO = "0d46296e-596a-477e-a568-ff902b256cf2";
const HUMMASTINVAARA = "1a79cdbe-7a70-4d86-bde2-56fde9f0a691";
const COMPASSFORGE = "87b56a60-2c41-4a55-99ba-1c4723cc912a";

const KH_144 = "https://parkanod10.oncloudos.com/kokous/2026541-14.PDF";
const KH_145 = "https://parkanod10.oncloudos.com/kokous/2026541-15.PDF";
const TL_96 = "https://parkanod10.oncloudos.com/kokous/2026557-3.PDF";
const RAISIO_439 = "https://julkaisut.raisio.fi/dynasty10/kokous/2025642-14.PDF";
const HUMMA_PDF = "https://raahe10.oncloudos.com/kokous/2026800-12.PDF";

function kentta(
  arvo: string,
  lahde_url: string,
  lainaus: string,
  lahde_sivu: number | null = null,
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

async function hyvaksy(id: string, label: string) {
  await hyvaksyMuutosehdotus(id, KASITTELIJA);
  console.log("hyväksytty:", label, id);
}

async function jonoTaydennys(
  sb: SupabaseClient,
  hankeId: string,
  sisalto: EhdotusSisalto,
  lahde_url: string,
  huomautus: string,
): Promise<string> {
  const { data, error } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "taydennys",
      hanke_id: hankeId,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      sisalto,
      tila: "odottaa",
      huomautus,
      lahde_url,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "taydennys insert");
  return data.id as string;
}

async function jonoRooli(
  sb: SupabaseClient,
  hankeId: string,
  orgId: string,
  orgNimi: string,
  rooli: string,
  lahdeUrl: string,
  lainaus: string,
  huomautus: string,
): Promise<string> {
  const lahteet = ["organisaatio_id", "rooli"].map((kenttaNimi) => ({
    kentta: kenttaNimi,
    lahde_url: lahdeUrl,
    lahde_sivu: 1,
    lahde_laji: "dokumentti",
    vahvistettu_pvm: "2025-12-15",
    luottamus: "epavarma",
    lainaus,
    merkitty: "koneen_ehdottama",
  }));
  const { data, error } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "hanke_organisaatio",
      hanke_id: hankeId,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: KASITTELIJA,
      lahde_url: lahdeUrl,
      huomautus,
      tila: "odottaa",
      sisalto: {
        hanke_organisaatio: {
          organisaatio_id: orgId,
          organisaatio_nimi: orgNimi,
          rooli,
          lahde_url: lahdeUrl,
          lahde_kohta: "KH 15.12.2025 § 439",
          lahteet,
        },
      },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "rooli insert");
  return data.id as string;
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-ympäristö puuttuu");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  // 1) Parkano: poista asiakirjat/sijainti_alue ennen hyväksyntää
  const { data: parkanoE, error: pVirhe } = await sb
    .from("muutosehdotukset")
    .select("id, tila, sisalto, hanke_id")
    .eq("id", PARKANO_EHDOTUS)
    .single();
  if (pVirhe || !parkanoE) throw new Error(pVirhe?.message ?? "Parkano-ehdotus puuttuu");

  let parkanoHankeId = parkanoE.hanke_id as string | null;
  if (parkanoE.tila === "odottaa") {
    const sisalto = parkanoE.sisalto as EhdotusSisalto;
    const { asiakirjat: _a, ...rest } = sisalto;
    const kentat = { ...(rest.kentat ?? {}) };
    delete kentat.sijainti_alue;
    const { error: upd } = await sb
      .from("muutosehdotukset")
      .update({ sisalto: { ...rest, kentat } })
      .eq("id", PARKANO_EHDOTUS)
      .eq("tila", "odottaa");
    if (upd) throw new Error(upd.message);
    await hyvaksy(PARKANO_EHDOTUS, "Parkanon Asemanseudun datakeskus");
    const { data: julkaistu } = await sb
      .from("muutosehdotukset")
      .select("hanke_id")
      .eq("id", PARKANO_EHDOTUS)
      .single();
    parkanoHankeId = julkaistu?.hanke_id ?? null;
  } else {
    console.log("Parkano jo käsitelty, tila", parkanoE.tila);
  }
  if (!parkanoHankeId) throw new Error("Parkano-hanke_id puuttuu hyväksynnän jälkeen");
  console.log("Parkano hanke:", parkanoHankeId);

  await sb
    .from("hankevinkit")
    .update({
      tila: "loydetty",
      loydetty_hanke_id: parkanoHankeId,
      yhteenveto:
        "Enertia Oy / Centa Oy, Parkanon Asemanseudun datakeskus. Julkaistu hankkeeksi. Lähteet: KH 16.6.2026 § 144–145, TL 23.9.2026 § 96.",
    })
    .eq("id", ENERTIA_VINKKI);
  console.log("Enertia-vihje → löydetty");

  // Parkano asiakirjat
  const parkanoAsiakirjatId = await jonoTaydennys(
    sb,
    parkanoHankeId,
    {
      kentat: {},
      huomio: "parkano-asiakirjat",
      julkaisija: "Parkanon kaupunki",
      julkaisija_lainaus: "Parkanon kaupunki",
      lahde_tyyppi: "viranomaisasiakirja",
      sitovuustaso: "virallinen",
      lahde_url: KH_145,
      asiakirjat: [
        {
          url: KH_144,
          otsikko:
            "Suunnitteluvaraushakemus, Asemanseutu 581-421-51-2 (KH 16.6.2026 § 144)",
          laji: "kuulutus",
          muoto: "pdf",
          lainaus:
            "Kaupunginhallitus päättää myöntää Centa Oy / Enertia Oy:lle suunnitteluvarauksen kiinteistölle Asemanseutu 581-421-51-2 voimassa olevaksi 31.12.2027 saakka.",
        },
        {
          url: KH_145,
          otsikko: "Kaavoitusaloite asemakaavan laatimiseksi (KH 16.6.2026 § 145)",
          laji: "kuulutus",
          muoto: "pdf",
          lainaus:
            "Enertia Oy / Centa Oy suunnittelee sähkövaraston, datakeskuksen ja aurinkovoimatuotannon rakentamista alueelle.",
        },
        {
          url: TL_96,
          otsikko:
            "Parkanon Asemanseudun datakeskuksen asemakaava, OAS nähtäville (TL 23.9.2026 § 96)",
          laji: "kuulutus",
          muoto: "pdf",
          lainaus:
            "Tekninen lautakunta hyväksyy osaltaan Parkanon Asemanseudun datakeskuksen asemakaavan osallistumis- ja arviointisuunnitelman liitteen mukaisesti ja päättää asettaa sen nähtäville.",
        },
      ],
    },
    KH_145,
    "Parkanon Asemanseudun viranomaisasiakirjat jonoon hyväksyttäväksi.",
  );
  await hyvaksy(parkanoAsiakirjatId, "Parkano asiakirjat");

  const parkanoHuomId = await jonoTaydennys(
    sb,
    parkanoHankeId,
    {
      huomio: "hanke-huomautus",
      kentat: {
        huomautus: kentta(
          "Asiakirjoissa suunnitellaan samalle alueelle sähkövarastoa, datakeskusta ja aurinkovoimaa. Tehoa ei merkitä ennen kuin datakeskuksen osuus erottuu lähteestä.",
          KH_145,
          "Enertia Oy / Centa Oy suunnittelee sähkövaraston, datakeskuksen ja aurinkovoimatuotannon rakentamista alueelle.",
          1,
        ),
      },
    },
    KH_145,
    "Monitoimi-huomautus (sähkövarasto + datakeskus + aurinkovoima).",
  );
  await hyvaksy(parkanoHuomId, "Parkano huomautus");

  // 2) Raisio § 439 dokumentti
  const raisioDokId = await jonoTaydennys(
    sb,
    ECOGRID_RAISIO,
    {
      kentat: {},
      huomio: "raisio-439-asiakirja",
      julkaisija: "Raision kaupunki",
      julkaisija_lainaus: "Raision kaupunki",
      lahde_tyyppi: "viranomaisasiakirja",
      sitovuustaso: "virallinen",
      lahde_url: RAISIO_439,
      asiakirjat: [
        {
          url: RAISIO_439,
          otsikko:
            "Raisio Data & Energy Campus, suunnitteluvaraussopimuksen hyväksyminen, CompassForge Ventures Oy (KH 15.12.2025 § 439)",
          laji: "kuulutus",
          muoto: "pdf",
          lainaus:
            "Kaupunginhallitus päättää hyväksyä suunnitteluvaraussopimuksen CompassForge Ventures Oy:lle",
        },
      ],
    },
    RAISIO_439,
    "KH 15.12.2025 § 439. Nimi päätöksessä: Raisio Data & Energy Campus. Ecogrid-nimi säilyy. Roolit: CompassForge merkitty hankeyhtiöksi asiakirjan sanamuodon mukaan («perustettu hankeyhtiö CompassForge Ventures Oy»).",
  );
  await hyvaksy(raisioDokId, "Raisio §439 dokumentti");

  const compassId = await jonoRooli(
    sb,
    ECOGRID_RAISIO,
    COMPASSFORGE,
    "CompassForge Ventures Oy",
    "hankeyhtio",
    RAISIO_439,
    "perustettu hankeyhtiö CompassForge Ventures Oy on anonut suunnitteluvarauksen jatkoksi alueelle suunnitteluvaraussopimusta",
    "CompassForge Ventures Oy hankeyhtiönä KH 15.12.2025 § 439 mukaan. Ecogrid säilyy toimijana omalla lähteellään.",
  );
  await hyvaksy(compassId, "CompassForge hankeyhtiö");

  const raisioHuomId = await jonoTaydennys(
    sb,
    ECOGRID_RAISIO,
    {
      huomio: "hanke-huomautus",
      kentat: {
        huomautus: kentta(
          "Kaupunginhallituksen päätös 15.12.2025 § 439 käyttää nimeä Raisio Data & Energy Campus. Rekisterin nimi on toistaiseksi Ecogrid Raisio.",
          RAISIO_439,
          "Raisio Data & Energy Campus, suunnitteluvaraussopimuksen hyväksyminen, CompassForge Ventures Oy",
          1,
        ),
      },
    },
    RAISIO_439,
    "Nimihuomautus § 439.",
  );
  await hyvaksy(raisioHuomId, "Raisio huomautus");

  // 3) Hummastinvaara monitoimi
  const hummaHuomId = await jonoTaydennys(
    sb,
    HUMMASTINVAARA,
    {
      huomio: "hanke-huomautus",
      kentat: {
        huomautus: kentta(
          "Asiakirjoissa suunnitellaan datakeskusta ja sitä palvelevaa akkuvarastoa. Tehoa ei merkitä hanketasolle ennen kuin datakeskuksen osuus on eroteltu rekisteriin omalla lähteellään.",
          HUMMA_PDF,
          "suunnitellaan noin 200 MW:n tehoista datakeskusta ja sitä palvelevaa akkuvarastoa",
          null,
        ),
      },
    },
    HUMMA_PDF,
    "Monitoimi-huomautus (datakeskus + akkuvarasto).",
  );
  await hyvaksy(hummaHuomId, "Hummastinvaara huomautus");

  console.log("Valmis.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
