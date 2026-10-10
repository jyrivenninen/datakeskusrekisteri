/**
 * Varmistettujen kenttien osuus hankkeen vaiheen mukaan (sitovuus_merkittaa).
 * Aja: npx tsx scripts/mittaa-varmistus-vaihe.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { lataaSitovuusHaku } from "../src/lib/faktakentta-sitovuus-lataus";
import type { LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import { HANKE_VAIHEET } from "../src/lib/supabase/tietokanta";
import { organisaationVerkkoTunnukset, tehokasLahdeTyyppi } from "../src/lib/lahde-tyyppi-domain";
import { onKenttaVarmistettu, type KenttaLahdeTyyppiInfo } from "../src/lib/kentta-varmistus";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);

  const docTyypit = new Map<string, LahdeTyyppi>();
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb.from("dokumentit").select("url, lahde_tyyppi").range(alku, alku + 999);
    if (!data?.length) break;
    for (const d of data) docTyypit.set(d.url, d.lahde_tyyppi as LahdeTyyppi);
    if (data.length < 1000) break;
  }

  const orgTunnukset = new Map<string, string[]>();
  const { data: orgt } = await sb.from("organisaatiot").select("id, verkko_osoite, verkkotunnus");
  for (const o of orgt ?? []) orgTunnukset.set(o.id, organisaationVerkkoTunnukset(o));

  const hankeVaihe = new Map<string, string>();
  const hankeToimija = new Map<string, string | null>();
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb
      .from("hankkeet")
      .select("id, vaihe, toimija_organisaatio_id")
      .eq("julkaistu", true)
      .range(alku, alku + 999);
    if (!data?.length) break;
    for (const h of data) {
      hankeVaihe.set(h.id, h.vaihe);
      hankeToimija.set(h.id, h.toimija_organisaatio_id);
    }
    if (data.length < 1000) break;
  }

  const maaraajaHanke = new Map<string, string>();
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb.from("maaraajat").select("id, hanke_id").range(alku, alku + 999);
    if (!data?.length) break;
    for (const m of data) maaraajaHanke.set(m.id, m.hanke_id);
    if (data.length < 1000) break;
  }

  const paatosHanke = new Map<string, string>();
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb.from("paatokset").select("id, hanke_id").range(alku, alku + 999);
    if (!data?.length) break;
    for (const p of data) paatosHanke.set(p.id, p.hanke_id);
    if (data.length < 1000) break;
  }

  const hankeKentat = new Map<string, Map<string, KenttaLahdeTyyppiInfo[]>>();

  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select("taulu, rivi_id, kentta, lahde_url, tekninen_lahde")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const rivi of data) {
      if (rivi.tekninen_lahde || !sitovuusMerkittaa(rivi.taulu, rivi.kentta)) continue;

      let hankeId: string | null = null;
      if (rivi.taulu === "hankkeet") hankeId = rivi.rivi_id;
      else if (rivi.taulu === "maaraajat") hankeId = maaraajaHanke.get(rivi.rivi_id) ?? null;
      else if (rivi.taulu === "paatokset") hankeId = paatosHanke.get(rivi.rivi_id) ?? null;
      if (!hankeId || !hankeVaihe.has(hankeId)) continue;

      const orgId = hankeToimija.get(hankeId);
      const tyyppi = tehokasLahdeTyyppi(docTyypit.get(rivi.lahde_url) ?? "muu", rivi.lahde_url, {
        toimijaTunnukset: orgId ? orgTunnukset.get(orgId) : undefined,
      });

      const kenttaAvain = `${rivi.taulu}:${rivi.kentta}`;
      const perHanke = hankeKentat.get(hankeId) ?? new Map();
      const lista = perHanke.get(kenttaAvain) ?? [];
      lista.push({ lahde_tyyppi: tyyppi, tekninen_lahde: false });
      perHanke.set(kenttaAvain, lista);
      hankeKentat.set(hankeId, perHanke);
    }
    if (data.length < 1000) break;
  }

  const vaiheYhteenveto = new Map<
    string,
    { hankkeita: number; faktakenttia: number; varmistettuja: number }
  >();
  for (const vaihe of HANKE_VAIHEET) {
    vaiheYhteenveto.set(vaihe, { hankkeita: 0, faktakenttia: 0, varmistettuja: 0 });
  }

  for (const [hankeId, vaihe] of hankeVaihe) {
    const y = vaiheYhteenveto.get(vaihe);
    if (!y) continue;
    y.hankkeita += 1;
    const kenttaMap = hankeKentat.get(hankeId);
    if (!kenttaMap) continue;
    for (const lahteet of kenttaMap.values()) {
      y.faktakenttia += 1;
      if (onKenttaVarmistettu(lahteet)) y.varmistettuja += 1;
    }
  }

  const rivit = [...vaiheYhteenveto.entries()].map(([vaihe, t]) => ({
    vaihe,
    hankkeita: t.hankkeita,
    faktakenttia_sitovuus_merkittaa: t.faktakenttia,
    varmistettuja: t.varmistettuja,
    varmistettuja_prosentti:
      t.faktakenttia === 0 ? 0 : Math.round((t.varmistettuja / t.faktakenttia) * 1000) / 10,
  }));

  console.log(
    JSON.stringify(
      {
        huomio: "Pooled: kaikki hankkeen sitovuus_merkittaa-kentät (hankkeet + määräajat + päätökset).",
        vaiheittain: rivit,
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
