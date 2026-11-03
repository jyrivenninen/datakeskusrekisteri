/**
 * Scale42 Kitee Puhos: Kh 6.7.2026 §213 asiakirjoihin + huomautus.
 * Ei liitä päätöstä vaihe-lähteeksi (Scale42↔Northern yhteys puuttuu).
 * Ei merkitse Northern DC AS:ää toimijaksi.
 *
 * Aja: npx tsx scripts/scale42-kitee-kh213-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hyvaksyMuutosehdotus,
  julkaiseDokumenttiLahdeMetatiedot,
} from "../src/lib/supabase/hyvaksynta";

const HANKE_ID = "9118093b-663b-47e1-8970-3aef182d27b8";
const KASITTELIJA = "ylläpito";
const MEETING_URL =
  "https://dynastyjulkaisu.pohjoiskarjala.net/kitee/cgi/DREQUEST.PHP?page=meetingitem&id=2026823-4";
const PDF_URL =
  "https://dynastyjulkaisu.pohjoiskarjala.net/kitee/kokous/2026823-4.PDF";
const JULKAISIJA = "Kiteen kaupunki, kunnanhallitus";

const HUOMAUTUS = [
  "Poikkeamislupa myönnetty Kh 6.7.2026 § 213; päätös perustuu vuoden 2007 asemakaavaan (\"on voimassa Puhoksen/Suorlahden teollisuusalueen asemakaava (hyväksytty Kiteen kaupunginvaltuustossa. 29.1.2007 § 6)\").",
  "Uusi asemakaavamuutos on käynnistetty 24.2.2025 (\"Alueelle on käynnistetty asemakaavamuutoksen laadinta 24.2.2025\"), mutta se ei ole poikkeamisluvan peruste.",
  "OAS 20.1.2026: suunnittelualue esitetään karttakuvana (\"Asemakaava-alueen alustava rajaus\"); tekstissä ei ole hehtaarilukua eikä kaavatunnusta.",
  "Poikkeamislupapäätös (Kh 6.7.2026 § 213) on liitetty hankkeen asiakirjoihin paikan perusteella. Hakijan nimi on päätöstekstissä peitetty; toimijaa ei päätellä tästä päätöksestä. Northern DC AS mainitaan hankkeen lausunnoissa (Tekla 16.6.2026 § 64, Ympäristölautakunta 17.6.2026 § 38), ei päätöksen hakijakenttänä.",
].join("\n\n");

async function lisaaDokumentti(
  sb: ReturnType<typeof createClient>,
  url: string,
  otsikko: string,
  muoto: "html" | "pdf",
) {
  const { data: olemassa } = await sb
    .from("dokumentit")
    .select("id, hanke_id, lahde_tyyppi, julkaisija, otsikko")
    .eq("url", url)
    .maybeSingle();

  let dokumenttiId = olemassa?.id as string | undefined;
  if (!dokumenttiId || olemassa?.hanke_id !== HANKE_ID) {
    const { data: id, error } = await sb.rpc("lisaa_hanke_dokumentti", {
      p_hanke_id: HANKE_ID,
      p_url: url,
      p_otsikko: otsikko,
      p_laji: "muu",
      p_muoto: muoto,
      p_lahde_url: url,
      p_kasittelija: KASITTELIJA,
    });
    if (error) throw new Error(`lisaa_hanke_dokumentti ${url}: ${error.message}`);
    dokumenttiId = id as string;
    console.log("  ✓ liitetty", otsikko, dokumenttiId);
  } else {
    console.log("  jo listalla", dokumenttiId);
  }

  // trg_dokumentit_lahteet vaatii lähteen ennen julkaisija-kenttää
  const { error: lahdeVirhe } = await sb.rpc("tallenna_kentta_lahde", {
    p_taulu: "dokumentit",
    p_rivi_id: dokumenttiId,
    p_kentta: "julkaisija",
    p_lahde_url: url,
    p_lahde_sivu: null,
    p_vahvistettu_pvm: new Date().toISOString().slice(0, 10),
    p_luottamus: "epavarma",
    p_lainaus: JULKAISIJA,
    p_merkitty: "ihmisen_vahvistama",
    p_lahde_laji: muoto === "pdf" ? "dokumentti" : "html",
  });
  if (lahdeVirhe) throw new Error(`julkaisija-lahde: ${lahdeVirhe.message}`);

  const { data: odottaa } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("hanke_id", HANKE_ID)
    .eq("lahde_url", url)
    .eq("tyyppi", "lahde_tyyppi_havainto")
    .eq("tila", "odottaa")
    .maybeSingle();

  let ehdotusId = odottaa?.id as string | undefined;
  if (!ehdotusId) {
    const { data: ehdotus, error: eVirhe } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "lahde_tyyppi_havainto",
        hanke_id: HANKE_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: url,
        sisalto: {
          lahde_metatiedot: {
            dokumentti_id: dokumenttiId,
            ehdotettu_lahde_tyyppi: "paatos",
            ehdotettu_sitovuustaso: "virallinen",
            ehdotettu_otsikko: otsikko,
            ehdotettu_julkaisija: JULKAISIJA,
            nykyinen_lahde_tyyppi: olemassa?.lahde_tyyppi ?? "muu",
            nykyinen_sitovuustaso: "epavirallinen",
          },
        },
      })
      .select("id")
      .single();
    if (eVirhe || !ehdotus) throw new Error(eVirhe?.message ?? "metatieto-ehdotus");
    ehdotusId = ehdotus.id;
  }

  await julkaiseDokumenttiLahdeMetatiedot(
    {
      dokumenttiId: dokumenttiId!,
      lahdeTyyppi: "paatos",
      sitovuustaso: "virallinen",
      otsikko,
      ehdotusId: ehdotusId!,
    },
    KASITTELIJA,
  );
  console.log("  ✓ metatiedot paatos /", JULKAISIJA);
  return dokumenttiId!;
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log("1) Kh 6.7.2026 §213 asiakirjat…");
  await lisaaDokumentti(
    sb,
    MEETING_URL,
    "Kh 6.7.2026 §213 Teollisuusalue-nimisen kiinteistön poikkeamislupahakemus",
    "html",
  );
  await lisaaDokumentti(
    sb,
    PDF_URL,
    "Kh 6.7.2026 §213 poikkeamislupapäätös (PDF)",
    "pdf",
  );

  console.log(
    "2) Scale42↔Northern: ei yhteistä asiakirjaa (Yle=Scale42, lausunnot=Northern, Kh §213 peitetty). Ei vaihe-lähdettä.",
  );

  console.log("3) Huomautus…");
  const { data: hanke } = await sb
    .from("hankkeet")
    .select("huomautus, kaavatunnus, kaava_ala_ha, vaihe")
    .eq("id", HANKE_ID)
    .single();
  const vanha = (hanke?.huomautus ?? "").trim();
  if (vanha.includes("Kh 6.7.2026 § 213")) {
    console.log("  huomautus jo sisältää §213");
  } else {
    const huom = vanha ? `${vanha}\n\n${HUOMAUTUS}` : HUOMAUTUS;
    const { data: ehdotus, error } = await sb
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
              arvo: huom,
              lahde_url: PDF_URL,
              lahde_sivu: 1,
              lahde_laji: "dokumentti",
              luottamus: "epavarma",
              lainaus:
                "Päätösehdotus hyväksyttiin yksimielisesti. … on voimassa Puhoksen/Suorlahden teollisuusalueen asemakaava (hyväksytty Kiteen kaupunginvaltuustossa. 29.1.2007 § 6)",
            },
          },
        },
      })
      .select("id")
      .single();
    if (error || !ehdotus) throw new Error(error?.message ?? "huomautus insert");
    await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
    console.log("  ✓ huomautus päivitetty");
  }

  console.log("4) kaavatunnus tyhjäksi (ei ole tunnusta)…");
  const { data: hankeNyt } = await sb
    .from("hankkeet")
    .select("kaavatunnus, kaava_ala_ha")
    .eq("id", HANKE_ID)
    .single();
  if (hankeNyt?.kaavatunnus) {
    const perustelu =
      "OAS/kaavapäätökset eivät anna kaavatunnusta; merkitty nimi ei ole kaavatunnus.";
    const tyhjennysSisalto = {
      tyhjennys: {
        taulu: "hankkeet",
        kentta: "kaavatunnus",
        perustelu,
        lainaus:
          "Asemakaava-alueen alustava rajaus (OAS 20.1.2026); kaavatunnusta ei ilmoiteta.",
        lahde_url:
          "https://www.kitee.fi/documents/1486274/0/Puhoksen_Suorlahden_teollisuusalueen+muutos_OAS.pdf/b9c13cda-66d2-62a7-68b9-449b73f96875",
      },
    };
    const { data: tyhjOdottaa } = await sb
      .from("muutosehdotukset")
      .select("id")
      .eq("hanke_id", HANKE_ID)
      .eq("tyyppi", "kentta_tyhjennys")
      .eq("tila", "odottaa")
      .maybeSingle();
    let tyhjId = tyhjOdottaa?.id as string | undefined;
    if (!tyhjId) {
      const { data: tyhj, error: tVirhe } = await sb
        .from("muutosehdotukset")
        .insert({
          tyyppi: "kentta_tyhjennys",
          hanke_id: HANKE_ID,
          ehdottaja_tyyppi: "yllapitaja",
          ehdottaja_tunniste: KASITTELIJA,
          tila: "odottaa",
          lahde_url: MEETING_URL,
          sisalto: tyhjennysSisalto,
        })
        .select("id")
        .single();
      if (tVirhe || !tyhj) throw new Error(tVirhe?.message ?? "tyhjennys");
      tyhjId = tyhj.id;
    } else {
      const { error: paivVirhe } = await sb
        .from("muutosehdotukset")
        .update({ sisalto: tyhjennysSisalto })
        .eq("id", tyhjId)
        .eq("tila", "odottaa");
      if (paivVirhe) throw new Error(paivVirhe.message);
    }
    await hyvaksyMuutosehdotus(tyhjId!, KASITTELIJA);
    console.log("  ✓ kaavatunnus tyhjennetty (oli:", hankeNyt.kaavatunnus, ")");
  } else {
    console.log("  kaavatunnus jo tyhjä");
  }
  console.log("  kaava_ala_ha:", hanke?.kaava_ala_ha ?? null, "(pidetään tyhjänä)");

  const { data: loppu } = await sb
    .from("hankkeet")
    .select("huomautus, kaavatunnus, kaava_ala_ha, vaihe")
    .eq("id", HANKE_ID)
    .single();
  const { data: doks } = await sb
    .from("dokumentit")
    .select("otsikko, url, lahde_tyyppi, julkaisija")
    .eq("hanke_id", HANKE_ID)
    .or("url.ilike.%2026823%,otsikko.ilike.%213%");

  console.log(
    JSON.stringify(
      {
        vaihe: loppu?.vaihe,
        kaavatunnus: loppu?.kaavatunnus,
        kaava_ala_ha: loppu?.kaava_ala_ha,
        dokumentit_213: doks,
        huomautus_pituus: (loppu?.huomautus ?? "").length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
