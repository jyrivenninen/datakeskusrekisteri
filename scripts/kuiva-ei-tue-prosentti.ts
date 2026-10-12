/**
 * Kuiva-ajo: nykyisten LS13-kone-ei_tue-ehdokkaiden vaikutus
 * varmistusprosenttiin, jos tila=ei_tue otettaisiin käyttöön.
 * Ei kirjoita mitään.
 *
 * Aja: npx tsx scripts/kuiva-ei-tue-prosentti.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { lataaSitovuusHaku } from "../src/lib/faktakentta-sitovuus-lataus";
import type { LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import {
  onKenttaVarmistettu,
  type KenttaLahdeTyyppiInfo,
} from "../src/lib/kentta-varmistus";
import {
  haeLs13EraKuittaukset,
  ls13EraKoneYhteenveto,
} from "../src/lib/ls13-era-lapikaynti";
import {
  organisaationVerkkoTunnukset,
  tehokasLahdeTyyppi,
} from "../src/lib/lahde-tyyppi-domain";

async function haeUrlTyypit(sb: ReturnType<typeof createClient>) {
  const map = new Map<string, LahdeTyyppi>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("dokumentit")
      .select("url, lahde_tyyppi")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const d of data) map.set(d.url, d.lahde_tyyppi as LahdeTyyppi);
    if (data.length < 1000) break;
  }
  return map;
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const ls13 = await haeLs13EraKuittaukset(sb, { vainEraTaiTyhja: false });
  const yht = ls13EraKoneYhteenveto(ls13);
  const ehdokkaat = yht.ei_tue_rivit;
  const ehdokasIdt = new Set(ehdokkaat.map((r) => r.lahde_id));

  const sitovuus = await lataaSitovuusHaku(sb);
  const urlTyypit = await haeUrlTyypit(sb);

  const { data: orgt } = await sb
    .from("organisaatiot")
    .select("id, verkko_osoite, verkkotunnus")
    .eq("julkaistu", true);
  const orgTunnukset = new Map<string, string[]>();
  for (const o of orgt ?? []) {
    orgTunnukset.set(o.id, organisaationVerkkoTunnukset(o));
  }

  type Rivi = {
    taulu: string;
    rivi_id: string;
    kentta: string;
    lahde_id: string;
    lahde_url: string;
    tekninen_lahde: boolean;
    tila: string | null;
  };
  const rivit: Rivi[] = [];
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select("id, taulu, rivi_id, kentta, lahde_url, tekninen_lahde, tila")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      rivit.push({
        taulu: r.taulu,
        rivi_id: r.rivi_id,
        kentta: r.kentta,
        lahde_id: r.id,
        lahde_url: r.lahde_url,
        tekninen_lahde: Boolean(r.tekninen_lahde),
        tila: r.tila,
      });
    }
    if (data.length < 1000) break;
  }

  const ryhmittain = new Map<string, KenttaLahdeTyyppiInfo[]>();
  const ryhmittainSim = new Map<string, KenttaLahdeTyyppiInfo[]>();

  for (const r of rivit) {
    if (!sitovuus(r.taulu, r.kentta)) continue;
    const tyyppi = tehokasLahdeTyyppi(
      urlTyypit.get(r.lahde_url) ?? "muu",
      r.lahde_url,
    );
    const info: KenttaLahdeTyyppiInfo = {
      lahde_tyyppi: tyyppi,
      tekninen_lahde: r.tekninen_lahde,
      tila: r.tila,
    };
    const avain = `${r.taulu}|${r.rivi_id}|${r.kentta}`;
    if (!ryhmittain.has(avain)) ryhmittain.set(avain, []);
    ryhmittain.get(avain)!.push(info);

    const simTila = ehdokasIdt.has(r.lahde_id) ? "ei_tue" : r.tila;
    const sim: KenttaLahdeTyyppiInfo = { ...info, tila: simTila };
    if (!ryhmittainSim.has(avain)) ryhmittainSim.set(avain, []);
    ryhmittainSim.get(avain)!.push(sim);
  }

  let kenttia = 0;
  let varmNyt = 0;
  let varmSim = 0;
  const menetetty: string[] = [];
  for (const [avain, lahteet] of ryhmittain) {
    kenttia += 1;
    const sim = ryhmittainSim.get(avain)!;
    const a = onKenttaVarmistettu(lahteet);
    const b = onKenttaVarmistettu(sim);
    if (a) varmNyt += 1;
    if (b) varmSim += 1;
    if (a && !b) menetetty.push(avain);
  }

  const pct = (n: number) =>
    kenttia === 0 ? 0 : Math.round((1000 * n) / kenttia) / 10;

  console.log(
    JSON.stringify(
      {
        ls13_kone_ei_tue_ehdokkaita: ehdokkaat.length,
        ehdokkaat: ehdokkaat.map((r) => ({
          hanke: r.hanke_nimi,
          kentta: r.kentta,
          arvo: r.arvo,
          lahde_id: r.lahde_id,
        })),
        sitovat_kentat: kenttia,
        varmistus_nyt: { lkm: varmNyt, prosentti: pct(varmNyt) },
        varmistus_jos_ei_tue: { lkm: varmSim, prosentti: pct(varmSim) },
        erotus_kenttia: varmNyt - varmSim,
        menetetty_varmistus: menetetty,
        huomio:
          "Kuiva: ei kirjoiteta. Hylkäystä ei käytetä automaattiseen peruutukseen.",
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
