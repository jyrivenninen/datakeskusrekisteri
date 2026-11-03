/**
 * Soft HE4/HE5 → ei_tue; Verne datalehti + datacentermap ei_tue.
 * Aja: npx tsx scripts/soft-he45-verne-2026-10-12.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hyvaksyMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";
const VERNE_ID = "9dc36ac7-a024-445f-b681-2e92b1d42a15";
const VERNE_PDF =
  "https://www.verneglobal.com/hubfs/Datasheets%202025/Helsinki%20Datasheet-1.pdf";
const DATACENTERMAP =
  "https://www.datacentermap.com/finland/helsinki/";

const SOFT_IDS = [
  "60a798c7-1cbb-40bc-9b1e-74425ec666b1", // HE4 teho_mw Soft
  "1a2e776a-bf6c-49c6-861d-6d7fb8f6741a", // HE5 teho_mw Soft
] as const;

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: nSoft, error: softVirhe } = await sb.rpc(
    "peruuta_kentta_lahde_kuittaus",
    {
      p_lahde_idt: [...SOFT_IDS],
      p_kasittelija: KASITTELIJA,
      p_huomautus:
        "Lainaus on sisäinen Soft-merkintä («Soft teho_mw=it_teho_mw … already on record»), ei lähteen tekstiä.",
    },
  );
  if (softVirhe) throw new Error(softVirhe.message);
  console.log("Soft → ei_tue:", nSoft);

  const { data: dcMap } = await sb
    .from("kentta_lahteet")
    .select("id, tila")
    .eq("rivi_id", VERNE_ID)
    .eq("kentta", "teho_mw")
    .eq("lahde_url", DATACENTERMAP)
    .maybeSingle();
  if (!dcMap) throw new Error("Verne datacentermap-riviä ei löydy");
  if (dcMap.tila === "ei_tue") {
    console.log("datacentermap jo ei_tue", dcMap.id);
  } else {
    const { data: nDc, error: dcVirhe } = await sb.rpc(
      "peruuta_kentta_lahde_kuittaus",
      {
        p_lahde_idt: [dcMap.id],
        p_kasittelija: KASITTELIJA,
        p_huomautus:
          "datacentermap aggregaattori, lainaus «70+ MW» (alaraja). Korvataan Vernen omalla datalehdellä.",
      },
    );
    if (dcVirhe) throw new Error(dcVirhe.message);
    console.log("datacentermap → ei_tue:", nDc);
  }

  const { data: pdfJo } = await sb
    .from("kentta_lahteet")
    .select("id")
    .eq("rivi_id", VERNE_ID)
    .eq("kentta", "teho_mw")
    .eq("lahde_url", VERNE_PDF)
    .eq("tila", "voimassa")
    .maybeSingle();
  if (pdfJo) {
    console.log("Verne PDF jo lähteenä", pdfJo.id);
  } else {
    const { data: dok } = await sb
      .from("dokumentit")
      .select("id, url")
      .eq("url", VERNE_PDF)
      .maybeSingle();
    if (!dok) {
      const { error: dokVirhe } = await sb.rpc("lisaa_hanke_dokumentti", {
        p_hanke_id: VERNE_ID,
        p_url: VERNE_PDF,
        p_otsikko: "Verne Helsinki Datasheet (2025)",
        p_lahde_tyyppi: "hankkeen_oma",
        p_julkaisija: "Verne Global",
        p_muoto: "pdf",
      });
      if (dokVirhe) {
        // rpc voi olla eri nimi — yritä julkaise dokumentti metatiedot
        console.warn("lisaa_hanke_dokumentti:", dokVirhe.message);
      } else {
        console.log("dokumentti lisätty");
      }
    }

    const { data: ehdotus, error } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "taydennys",
        hanke_id: VERNE_ID,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: KASITTELIJA,
        tila: "odottaa",
        lahde_url: VERNE_PDF,
        huomautus:
          "Verne Helsinki Datasheet: Overall campus capacity 70MW (erittelemätön). PDF-metatiedot luotu 14.3.2025, muokattu 17.9.2025 — ei asiakirjan omaa päiväystä.",
        sisalto: {
          kentat: {
            teho_mw: {
              arvo: 70,
              lahde_url: VERNE_PDF,
              lahde_laji: "dokumentti",
              lahde_sivu: 1,
              luottamus: "epavarma",
              lainaus:
                "Overall campus capacity 70MW. [PDF-metatiedot: luotu 14.3.2025, muokattu 17.9.2025; ei asiakirjan omaa päiväystä. Laji erittelemätön.]",
              merkitty: "ihmisen_vahvistama",
            },
          },
        },
      })
      .select("id")
      .single();
    if (error || !ehdotus) throw new Error(error?.message ?? "verne pdf");
    await hyvaksyMuutosehdotus(ehdotus.id, KASITTELIJA);
    console.log("Verne PDF lähde OK", ehdotus.id);
  }

  for (const nimi of ["Equinix HE4", "Equinix HE5", "Verne, Mittalinja"]) {
    const { data: h } = await sb
      .from("hankkeet")
      .select("id, teho_mw, it_teho_mw")
      .eq("nimi", nimi)
      .eq("julkaistu", true)
      .maybeSingle();
    if (!h) continue;
    const { data: lahteet } = await sb
      .from("kentta_lahteet")
      .select("kentta, tila, lainaus, lahde_url, merkitty, luottamus")
      .eq("rivi_id", h.id)
      .in("kentta", ["teho_mw", "it_teho_mw"])
      .order("kentta");
    console.log(
      JSON.stringify(
        { nimi, teho_mw: h.teho_mw, it_teho_mw: h.it_teho_mw, lahteet },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
