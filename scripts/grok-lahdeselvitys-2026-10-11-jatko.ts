/**
 * Grok lähdeselvitys 2 — jatkotoimet: mitätöinti, kunta-tarkistus, siirto hanke_lahdehaut,
 * hyväksynnät (käyttäjän ohje 6).
 *
 * Aja migraatiot ensin: npx supabase db push
 * Sitten: npx tsx scripts/grok-lahdeselvitys-2026-10-11-jatko.ts [--kuiva]
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";

const EHDOTTAJA = "grok_lahdeselvitys_2026-10-11";
const KASITTELIJA = "agentti:grok-lahdeselvitys-2026-10-11-jatko";
const MOMENT_ID = "cbc424e0-af0f-4812-9ddc-e7396d076b65";

const KUNTA_TARKISTUS: Array<{ haku: string; odotettu: string }> = [
  { haku: "DNA Oulu", odotettu: "Oulu" },
  { haku: "GlobalConnect Espoo", odotettu: "Espoo" },
  { haku: "Louhi Datacenter Espoo", odotettu: "Espoo" },
  { haku: "North Shore AH3", odotettu: "Pietarsaari" },
  { haku: "North Shore ST8", odotettu: "Pietarsaari" },
  { haku: "Packetra", odotettu: "Turku" },
  { haku: "Borealis Finland, Oulu Ruskonselkä", odotettu: "Oulu" },
  { haku: "APL Varkaus", odotettu: "Varkaus" },
  { haku: "Regant Hyperterra, Salo Kärkkä", odotettu: "Salo" },
];

const TYHJAT_SIIRTO: Array<{ hanke_id: string; ehdotus_haku: string }> = [
  { hanke_id: "a166f5ec-ff5d-4daa-9318-0224a5ff83f1", ehdotus_haku: "DNA Oulu" },
  { hanke_id: "fd716a1f-7a41-45df-8363-7c8e89de4082", ehdotus_haku: "GlobalConnect" },
  { hanke_id: "6ceb6771-450b-4d3f-832d-782ef53c6780", ehdotus_haku: "Louhi" },
];

const UUDET_ASIAKIRJAT = [
  "https://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3511873",
  "https://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3778791",
  "https://salo10.oncloudos.com/kokous/2025815-11.PDF",
  "https://salo10.oncloudos.com/kokous/20261089-5.PDF",
];

async function hylkaaTyhjaHaku(
  sb: ReturnType<typeof createClient>,
  hankeId: string,
  syy: string,
  kuiva: boolean,
): Promise<number> {
  const { data } = await sb
    .from("muutosehdotukset")
    .select("id, huomautus")
    .eq("tyyppi", "kunta_havainto")
    .eq("hanke_id", hankeId)
    .eq("ehdottaja_tunniste", EHDOTTAJA)
    .eq("tila", "odottaa")
    .contains("sisalto", { kunta: { haku_tehty_pvm: "2026-10-11" } });
  let n = 0;
  for (const e of data ?? []) {
    if (!kuiva) {
      await sb
        .from("muutosehdotukset")
        .update({
          tila: "hylatty",
          kasittelija: KASITTELIJA,
          kasitelty_pvm: new Date().toISOString(),
          huomautus: `${e.huomautus ?? ""}\nMitätöity: ${syy}`.trim(),
        })
        .eq("id", e.id);
    }
    n += 1;
  }
  return n;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const raportti: Record<string, unknown> = {};

  // 0a Moment mitätöinti
  raportti.mitatoitu_moment = await hylkaaTyhjaHaku(
    sb,
    MOMENT_ID,
    "Haku tehtiin Hangon järjestelmästä; hankkeen kunta on Tampere (toimeksiantovirhe).",
    kuiva,
  );

  // 0b Kunta-tarkistus
  const kuntaRivit: Array<{ nimi: string; rekisteri: string; odotettu: string; ok: boolean }> = [];
  for (const t of KUNTA_TARKISTUS) {
    const { data } = await sb
      .from("hankkeet")
      .select("id, nimi, kunta")
      .ilike("nimi", `%${t.haku.split(",")[0]!.trim()}%`)
      .is("yhdistetty_kohde_id", null)
      .limit(3);
    const h = (data ?? []).find((x) => x.nimi.includes(t.haku.split(",")[0]!.trim())) ?? data?.[0];
    if (!h) {
      kuntaRivit.push({ nimi: t.haku, rekisteri: "—", odotettu: t.odotettu, ok: false });
      continue;
    }
    const ok = h.kunta === t.odotettu;
    kuntaRivit.push({ nimi: h.nimi, rekisteri: h.kunta, odotettu: t.odotettu, ok });
  }
  raportti.kunta_tarkistus = kuntaRivit;

  // 3 Siirto hanke_lahdehaut (3 kelvollista)
  let siirretty = 0;
  for (const kohde of TYHJAT_SIIRTO) {
    const { data: ehd } = await sb
      .from("muutosehdotukset")
      .select("id, huomautus, sisalto")
      .eq("tyyppi", "kunta_havainto")
      .eq("hanke_id", kohde.hanke_id)
      .eq("ehdottaja_tunniste", EHDOTTAJA)
      .eq("tila", "odottaa")
      .contains("sisalto", { kunta: { haku_tehty_pvm: "2026-10-11" } })
      .limit(1)
      .maybeSingle();
    if (!ehd) continue;
    const kunta = (ehd.sisalto as { kunta?: Record<string, string> }).kunta ?? {};
    if (!kuiva) {
      const { error: insVirhe } = await sb.from("hanke_lahdehaut").insert({
        hanke_id: kohde.hanke_id,
        jarjestelma: kunta.jarjestelma ?? "",
        hakusanat: kunta.haku_yhteenveto ?? ehd.huomautus ?? "",
        ajankohta: "2026-10-11",
        osumia: 0,
        yhteenveto: kunta.haku_yhteenveto ?? "",
        suorittaja: EHDOTTAJA,
        hakijan_tyyppi: "ulkopuolinen_selvitys",
        tila: "hyvaksytty",
      });
      if (insVirhe?.message.includes("hanke_lahdehaut")) {
        throw new Error(`hanke_lahdehaut puuttuu — aja db push: ${insVirhe.message}`);
      }
      if (insVirhe) throw new Error(insVirhe.message);
      await sb
        .from("muutosehdotukset")
        .update({
          tila: "hyvaksytty",
          kasittelija: KASITTELIJA,
          kasitelty_pvm: new Date().toISOString(),
          huomautus: `${ehd.huomautus ?? ""}\nSiirretty hanke_lahdehaut-tauluun.`.trim(),
        })
        .eq("id", ehd.id);
    }
    siirretty += 1;
  }
  raportti.siirretty_hanke_lahdehaut = siirretty;

  // 6 Hyväksy 6 osa A metatietoa
  const { data: metaEhd } = await sb
    .from("muutosehdotukset")
    .select("id, lahde_url, sisalto")
    .eq("tyyppi", "lahde_tyyppi_havainto")
    .eq("tila", "odottaa")
    .eq("ehdottaja_tunniste", EHDOTTAJA);
  let metaHyvaksytty = 0;
  for (const e of metaEhd ?? []) {
    const meta = (e.sisalto as EhdotusSisalto).lahde_metatiedot;
    if (!meta?.dokumentti_id) continue;
    const tyyppi = meta.ehdotettu_lahde_tyyppi as LahdeTyyppi;
    const sitovuus = (meta.ehdotettu_sitovuustaso as string) || oletusSitovuustaso(tyyppi);
    if (!kuiva) {
      const { error } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
        p_dokumentti_id: meta.dokumentti_id,
        p_lahde_tyyppi: tyyppi,
        p_sitovuustaso: sitovuus,
        p_otsikko: meta.ehdotettu_otsikko?.trim() ?? "",
        p_ehdotus_id: e.id,
        p_kasittelija: KASITTELIJA,
      });
      if (error) throw new Error(error.message);
    }
    metaHyvaksytty += 1;
  }
  raportti.hyvaksytty_meta = metaHyvaksytty;

  // 6 Hyväksy 4 uutta asiakirjaa
  let asiakirjaHyvaksytty = 0;
  for (const url of UUDET_ASIAKIRJAT) {
    const { data: ehd } = await sb
      .from("muutosehdotukset")
      .select("id, hanke_id, sisalto")
      .eq("tyyppi", "kunta_havainto")
      .eq("lahde_url", url)
      .eq("tila", "odottaa")
      .eq("ehdottaja_tunniste", EHDOTTAJA)
      .maybeSingle();
    if (!ehd?.hanke_id) continue;

    let sisaltoTiiviste: string | null = null;
    try {
      const vastaus = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const tavut = new Uint8Array(await vastaus.arrayBuffer());
      sisaltoTiiviste = createHash("sha256").update(tavut).digest("hex");
    } catch {
      /* jatka ilman tiivistettä */
    }

    if (!kuiva) {
      const sisalto = ehd.sisalto as { kunta?: { dokumentit?: Array<Record<string, string>> } };
      const dokumentit = sisalto.kunta?.dokumentit ?? [];
      if (sisaltoTiiviste && dokumentit[0]) {
        dokumentit[0].sisalto_tiiviste = sisaltoTiiviste;
        await sb.from("muutosehdotukset").update({ sisalto: { ...sisalto, kunta: { ...sisalto.kunta, dokumentit } } }).eq("id", ehd.id);
      }

      const { error } = await sb.rpc("julkaise_kunta_havainto", {
        p_ehdotus_id: ehd.id,
        p_kasittelija: KASITTELIJA,
        p_hanke_id: ehd.hanke_id,
        p_dokumentit_url: [url],
      });
      if (error) throw new Error(`${url}: ${error.message}`);
    }
    asiakirjaHyvaksytty += 1;
  }
  raportti.hyvaksytty_asiakirjat = asiakirjaHyvaksytty;

  console.log(JSON.stringify({ kuiva, ...raportti }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
