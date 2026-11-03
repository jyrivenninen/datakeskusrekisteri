/**
 * Lähdeselvitys 9: Parkanon Asemanseudun datakeskus jonoon,
 * Centa Oy organisaatioksi, Arcem-vihjeen hakupolku.
 * Ei hyväksy hanketta eikä merkitse Enertia-vihjettä löydetyksi.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const EHDOTTAJA = "ylläpito";
const CENTA_Y = "3630093-7";
const CENTA_NIMI = "Centa Oy";
const ENERTIA_ID = "55dabff2-b74d-44df-afb1-5613ac2b0788";
const ARCEM_VINKKI_ID = "6577db94-7fe7-4f65-9561-3d1376bc2e58";
const ENERTIA_VINKKI_ID = "09a00089-7280-4e8b-816f-be8e37efa10b";

const KH_144 =
  "https://parkanod10.oncloudos.com/kokous/2026541-14.PDF";
const KH_145 =
  "https://parkanod10.oncloudos.com/kokous/2026541-15.PDF";
const TL_96 =
  "https://parkanod10.oncloudos.com/kokous/2026557-3.PDF";

const HUOMAUTUS =
  "Kaupunginhallitus 16.6.2026 § 144–145 ja tekninen lautakunta 23.9.2026 § 96 (OAS nähtäville). " +
  "Asiakirjoissa suunnitellaan samalle alueelle sähkövarastoa/sähköasemaa, datakeskusta ja aurinkovoimaa. " +
  "Teholukuja ei merkitä ennen kuin tiedetään, mikä osa tehosta on datakeskusta. " +
  "Pinta-ala: KH § 145 noin 63,3 ha; OAS/TL § 96 noin 76 ha (alue laajentunut). " +
  "Toimijoina asiakirjoissa Enertia Oy ja Centa Oy; yhtiöiden suhdetta ei ole päätelty. " +
  "Ei sama kuin julkaisematon Parkano Asemanseutu (yhdistetty Vakerinmäkeen).";

const ARCEM_YHTEENVETO =
  "Arcem AS, Salo/Halikko Riikki. Tila: selvitettava. " +
  "Grokin hakupolku (Dynasty Salo, https://salo10.oncloudos.com/cgi/DREQUEST.PHP, vapaateksti, kaikki toimielimet; aineisto alkaa 12.10.2022, 6031 kokousasiaa): " +
  "Arcem 0; Hexeberg 0; norjalai 0; datakeskus 1 (KH 8.12.2025 § 230 etuosto Kärkkä — toinen hanke); " +
  "konesali 0; Riikki 15 (yleiskaava/asemakaava/poikkeamiset, ei Arcem- eikä datakeskusmainintaa); " +
  "tontinvaraus 1 (ei liity); varaussopimus 4 (ei liity); otsikkohaku Arcem/datakeskus/konesali/Riikki/varaus 0 (datakeskus otsikossa sama etuosto); " +
  "Riikin teollisuusalueen asemakaavan muutoksen esityslistaliitteet (kaavakartta, selostus, OAS) — hakusanat datakes/arcem/konesal = 0. " +
  "Julkista viranomaispäätöstä varauksesta ei löytynyt. Seuraava askel: tietopyyntö (ihminen).";

const ENERTIA_YHTEENVETO =
  "Enertia Oy / Centa Oy, Parkanon Asemanseutu. Lähteet löytyivät (KH 16.6.2026 § 144–145, TL 23.9.2026 § 96 OAS). " +
  "Uusi hanke «Parkanon Asemanseudun datakeskus» on muutosehdotusjonossa (ei hyväksytty). " +
  "Vihje merkitään löydetyksi vasta kun hanke julkaistaan.";

function kentta(
  arvo: string | number,
  lahde_url: string,
  lainaus: string,
  lahde_sivu: number | null = null,
) {
  return {
    arvo: String(arvo),
    lahde_url,
    lahde_sivu,
    lainaus,
    luottamus: "epavarma" as const,
    lahde_laji: "dokumentti" as const,
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-ympäristö puuttuu");

  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: centaOlemassa } = await sb
    .from("organisaatiot")
    .select("id")
    .eq("y_tunnus", CENTA_Y)
    .maybeSingle();

  let centaId = (centaOlemassa?.id as string) ?? null;
  if (!centaId) {
    const { data, error } = await sb.rpc("julkaise_organisaatio_yritys", {
      p_nimi: CENTA_NIMI,
      p_y_tunnus: CENTA_Y,
      p_lahde_url: KH_144,
      p_vahvistettu_pvm: "2026-06-16",
      p_lainaus:
        "Kaupunginhallitus päättää myöntää Centa Oy / Enertia Oy:lle suunnitteluvarauksen kiinteistölle Asemanseutu 581-421-51-2",
      p_merkitty: "ihmisen_vahvistama",
      p_ytj_lahde_url: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=${CENTA_Y}`,
    });
    if (error) throw new Error(`Centa Oy: ${error.message}`);
    centaId = data as string;
    console.log("Centa Oy luotu:", centaId);
  } else {
    console.log("Centa Oy jo olemassa:", centaId);
  }

  const { data: joJonossa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "uusi_hanke")
    .eq("tila", "odottaa")
    .filter("sisalto->kentat->nimi->>arvo", "eq", "Parkanon Asemanseudun datakeskus");

  if (joJonossa && joJonossa.length > 0) {
    console.log("Uusi hanke jo jonossa:", joJonossa.map((r) => r.id).join(", "));
  } else {
    const sisalto = {
      kentat: {
        nimi: kentta(
          "Parkanon Asemanseudun datakeskus",
          KH_145,
          "Parkanon Asemanseudun datakeskuksen asemakaava",
          1,
        ),
        kunta: kentta("Parkano", KH_145, "Parkanon kaupunki", 1),
        maakunta: kentta("Pirkanmaa", TL_96, "Pirkanmaan maakuntakaava 2040", 2),
        vaihe: kentta(
          "kaavoitus",
          TL_96,
          "Tekninen lautakunta hyväksyy osaltaan Parkanon Asemanseudun datakeskuksen asemakaavan osallistumis- ja arviointisuunnitelman liitteen mukaisesti ja päättää asettaa sen nähtäville",
          3,
        ),
        pinta_ala_ha: kentta(
          "76",
          TL_96,
          "Asemakaavoitettavan alueen pinta-ala on noin 76 hehtaaria.",
          2,
        ),
        toimija_nimi: kentta(
          "Enertia Oy",
          KH_145,
          "Enertia Oy / Centa Oy suunnittelee sähkövaraston, datakeskuksen ja aurinkovoimatuotannon rakentamista alueelle.",
          1,
        ),
        sijainti_alue: kentta(
          "Asemanseutu",
          TL_96,
          "Asemakaavoitettava alue sijaitsee Parkanon Asemanseudulla, kaupungin keskustasta noin 5,2 kilometriä koilliseen.",
          2,
        ),
      },
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
            "Enertia Oy / Centa Oy suunnittelee sähkövaraston, datakeskuksen ja aurinkovoimatuotannon rakentamista alueelle. Hankealueen pinta-ala on noin 63,3 hehtaaria.",
        },
        {
          url: TL_96,
          otsikko:
            "Parkanon Asemanseudun datakeskuksen asemakaava, OAS nähtäville (TL 23.9.2026 § 96)",
          laji: "kuulutus",
          muoto: "pdf",
          lainaus:
            "Asemakaavoitettavan alueen pinta-ala on noin 76 hehtaaria. Tekninen lautakunta hyväksyy osaltaan osallistumis- ja arviointisuunnitelman ja päättää asettaa sen nähtäville.",
        },
      ],
      huomio: "monitoiminen-alue-ei-tehoa",
    };

    const { data, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "uusi_hanke",
        hanke_id: null,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: EHDOTTAJA,
        sisalto,
        tila: "odottaa",
        huomautus: HUOMAUTUS,
        lahde_url: KH_145,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "uusi_hanke insert");
    console.log("Uusi hanke jonoon:", data.id);
  }

  const { error: arcemVirhe } = await sb
    .from("hankevinkit")
    .update({ yhteenveto: ARCEM_YHTEENVETO, tila: "selvitettava" })
    .eq("id", ARCEM_VINKKI_ID);
  if (arcemVirhe) throw new Error(`Arcem-vihje: ${arcemVirhe.message}`);
  console.log("Arcem-vihje päivitetty (selvitettävä + hakupolku)");

  const { error: enertiaVirhe } = await sb
    .from("hankevinkit")
    .update({ yhteenveto: ENERTIA_YHTEENVETO, tila: "selvitettava" })
    .eq("id", ENERTIA_VINKKI_ID);
  if (enertiaVirhe) throw new Error(`Enertia-vihje: ${enertiaVirhe.message}`);
  console.log("Enertia-vihje päivitetty (selvitettävä, jono mainittu)");

  console.log("Enertia org id (viite):", ENERTIA_ID);
  console.log("Centa org id:", centaId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
