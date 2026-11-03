/**
 * Magnora Hämeenlinna MORE:
 * 1) Hylkää vaihe-ehdotus "kaava hyväksytty" (asiakirja jo hankkeessa).
 * 2) Etsi rakentamislupapäätös → ehdotus vaihe-lähteeksi jos löytyy.
 * 3) Kirjaa Kv 19.5.2025 § 58 päätösosa.
 *
 * Aja: npx tsx scripts/magnora-hameenlinna-2026-10-12.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hylkaaMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const HANKE_ID = "c23d46c9-5b9e-40ca-a78e-9e2fb4deaf01";
const VAIHE_EHDOTUS_ID = "800f0321-a8b3-4c02-b656-685186c1a5b6";
const KV_URL = "https://hameenlinna.tweb.fi/ktwebscr/fileshow?doctype=7&docid=984348";
const KASITTELIJA = "ylläpito";

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: hanke, error: hVirhe } = await sb
    .from("hankkeet")
    .select("id, nimi, vaihe")
    .eq("id", HANKE_ID)
    .single();
  if (hVirhe || !hanke) throw new Error(hVirhe?.message ?? "Hanke puuttuu");
  console.log("Hanke:", hanke.nimi, "vaihe=", hanke.vaihe);

  // 1) Asiakirja jo hankkeessa?
  const { data: dok } = await sb
    .from("dokumentit")
    .select("id, url, otsikko")
    .eq("hanke_id", HANKE_ID)
    .eq("url", KV_URL)
    .maybeSingle();
  console.log(
    "Kv §58 asiakirja hankkeessa:",
    dok ? `kyllä (${dok.otsikko})` : "ei — lisättäisiin",
  );

  // 1) Hylkää vaihe-ehdotus
  const perustelu =
    "Vaihe säilyy lupamenettely. Kv 19.5.2025 § 58 hyväksyi asemakaavan nro 2642; " +
    "se ei ole vaihe-arvo \"kaava hyväksytty\". Asiakirja on jo hankkeen asiakirjoissa.";
  if (kuiva) {
    console.log("[kuiva] hylkäisi", VAIHE_EHDOTUS_ID, perustelu);
  } else {
    await hylkaaMuutosehdotus(VAIHE_EHDOTUS_ID, KASITTELIJA, perustelu);
    console.log("Hylätty vaihe-ehdotus", VAIHE_EHDOTUS_ID);
  }

  // 3) Kv päätösosa → paatos-ehdotus jonoon (jos ei jo)
  const paatosKuvaus =
    "Hämeenlinnan kaupunginvaltuusto hyväksyi 19.5.2025 § 58 asemakaavan nro 2642 (Graniittikadun ympäristö).";
  const paatosLainaus = "Kaupunginvaltuusto hyväksyi kaupunginhallituksen ehdotuksen.";
  const { data: vanhaPaatos } = await sb
    .from("muutosehdotukset")
    .select("id, tila")
    .eq("hanke_id", HANKE_ID)
    .eq("ehdottaja_tunniste", "yllapito-kv58-2026-10-12")
    .maybeSingle();

  if (vanhaPaatos) {
    console.log("Kv §58 ehdotus jo jonossa/käsitelty:", vanhaPaatos.id, vanhaPaatos.tila);
  } else if (kuiva) {
    console.log("[kuiva] lisäisi paatos-ehdotuksen:", paatosKuvaus);
  } else {
    // Hae Hämeenlinnan kaupunki organisaatio
    const { data: org } = await sb
      .from("organisaatiot")
      .select("id, nimi")
      .eq("julkaistu", true)
      .ilike("nimi", "%Hämeenlinna%")
      .eq("tyyppi", "kunta")
      .maybeSingle();
    const { error: pVirhe } = await sb.from("muutosehdotukset").insert({
      tyyppi: "taydennys",
      hanke_id: HANKE_ID,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: "yllapito-kv58-2026-10-12",
      lahde_url: KV_URL,
      huomautus:
        "Kv 19.5.2025 § 58: päätösosa — hyväksyi KH:n ehdotuksen (= hyväksyi asemakaavan nro 2642). Ei ehdotusteksti.",
      tila: "odottaa",
      sisalto: {
        kentat: {},
        paatos: {
          pvm: "2025-05-19",
          kuvaus: paatosKuvaus,
          paattava_organisaatio_id: org?.id ?? null,
          paattava_organisaatio_nimi: org?.nimi ?? "Hämeenlinnan kaupunginvaltuusto",
          lahteet: [
            {
              kentta: "kuvaus",
              lahde_url: KV_URL,
              lahde_sivu: null,
              lahde_laji: "html",
              vahvistettu_pvm: new Date().toISOString().slice(0, 10),
              luottamus: "vahvistettu",
              lainaus: paatosLainaus,
              merkitty: "ihmisen_vahvistama",
            },
            {
              kentta: "pvm",
              lahde_url: KV_URL,
              lahde_sivu: null,
              lahde_laji: "html",
              vahvistettu_pvm: new Date().toISOString().slice(0, 10),
              luottamus: "vahvistettu",
              lainaus: "Kaupunginvaltuusto 19.5.2025 § 58",
              merkitty: "ihmisen_vahvistama",
            },
            {
              kentta: "paattava_organisaatio_id",
              lahde_url: KV_URL,
              lahde_sivu: null,
              lahde_laji: "html",
              vahvistettu_pvm: new Date().toISOString().slice(0, 10),
              luottamus: "vahvistettu",
              lainaus: "Kaupunginvaltuusto 19.5.2025 § 58",
              merkitty: "ihmisen_vahvistama",
            },
          ],
        },
      },
    });
    if (pVirhe) throw new Error(pVirhe.message);
    console.log("Jonoon: Kv §58 paatos-ehdotus");
  }

  console.log(
    JSON.stringify(
      {
        rakentamislupa_haku:
          "Hämeen Sanomat 29.4.2026 ja 6.5.2026 kertovat myönnetystä luvasta; " +
          "julkista rakennusvalvonnan päätösasiakirjaa (Lupapiste/tweb) ei löytynyt haulla. " +
          "Vaihe-lähdettä ei ehdoteta ennen viranomaisasiakirjaa.",
        vaihe_nyt: hanke.vaihe,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
