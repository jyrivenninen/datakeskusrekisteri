/**
 * Mittaa varmistettujen / varmistamattomien faktakenttien määrä (ei kirjoita mitään).
 * Aja: npx tsx scripts/mittaa-varmistamattomuus.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { lataaSitovuusHaku } from "../src/lib/faktakentta-sitovuus-lataus";
import type { LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import { organisaationVerkkoTunnukset, tehokasLahdeTyyppi } from "../src/lib/lahde-tyyppi-domain";
import {
  onKenttaVarmistettu,
  varmistamatonSyy,
  type KenttaLahdeTyyppiInfo,
  type VarmistamatonSyy,
} from "../src/lib/kentta-varmistus";

type LahdeRivi = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  tekninen_lahde: boolean;
};

type KenttaMeta = {
  taulu: string;
  kentta: string;
  lahteet: KenttaLahdeTyyppiInfo[];
};

function laske(
  kentat: KenttaMeta[],
  sitovuusMerkittaa: (taulu: string, kentta: string) => boolean,
  suodatinTaulu?: string,
) {
  let faktakenttia = 0;
  let varmistettuja = 0;
  let varmistamattomia = 0;
  let ulkopuolella = 0;
  const syyt: Record<VarmistamatonSyy, number> = {
    ainoa_media: 0,
    ainoa_hankkeen_oma: 0,
    ainoa_muu: 0,
    tyypittamaton: 0,
  };

  for (const k of kentat) {
    if (suodatinTaulu && k.taulu !== suodatinTaulu) continue;
    if (!sitovuusMerkittaa(k.taulu, k.kentta)) {
      ulkopuolella += 1;
      continue;
    }
    faktakenttia += 1;
    if (onKenttaVarmistettu(k.lahteet)) {
      varmistettuja += 1;
    } else {
      varmistamattomia += 1;
      syyt[varmistamatonSyy(k.lahteet)] += 1;
    }
  }

  const pros = (osa: number) =>
    faktakenttia === 0 ? 0 : Math.round((osa / faktakenttia) * 1000) / 10;

  return {
    faktakenttia_sitovuus_merkittaa: faktakenttia,
    ulkopuolella_sitovuus_luokituksessa: ulkopuolella,
    varmistettuja,
    varmistettuja_prosentti: pros(varmistettuja),
    varmistamattomia,
    varmistamattomia_prosentti: pros(varmistamattomia),
    varmistamattomien_syyt: syyt,
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);

  const docTyypit = new Map<string, LahdeTyyppi>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb.from("dokumentit").select("url, lahde_tyyppi").range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const d of data) docTyypit.set(d.url, d.lahde_tyyppi as LahdeTyyppi);
    if (data.length < 1000) break;
  }

  const orgTunnukset = new Map<string, string[]>();
  const { data: orgt } = await sb
    .from("organisaatiot")
    .select("id, verkko_osoite, verkkotunnus")
    .eq("julkaistu", true);
  for (const o of orgt ?? []) {
    orgTunnukset.set(o.id, organisaationVerkkoTunnukset(o));
  }

  const { data: odottavatYtj } = await sb
    .from("muutosehdotukset")
    .select("sisalto")
    .eq("tyyppi", "ytj_havainto")
    .eq("tila", "odottaa");
  for (const rivi of odottavatYtj ?? []) {
    const ytj = (rivi.sisalto as { ytj?: { organisaatio_id?: string; verkkotunnus_ehdotus?: string } })
      ?.ytj;
    if (!ytj?.organisaatio_id || !ytj.verkkotunnus_ehdotus) continue;
    const lista = new Set(orgTunnukset.get(ytj.organisaatio_id) ?? []);
    lista.add(ytj.verkkotunnus_ehdotus.toLowerCase());
    orgTunnukset.set(ytj.organisaatio_id, [...lista]);
  }

  const hankeToimija = new Map<string, string | null>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("hankkeet")
      .select("id, toimija_organisaatio_id")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const h of data) hankeToimija.set(h.id, h.toimija_organisaatio_id);
    if (data.length < 1000) break;
  }

  const kentatMap = new Map<string, KenttaMeta>();

  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select("taulu, rivi_id, kentta, lahde_url, tekninen_lahde")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const rivi of data as LahdeRivi[]) {
      if (rivi.tekninen_lahde) continue;
      const avain = `${rivi.taulu}:${rivi.rivi_id}:${rivi.kentta}`;
      const dbTyyppi = docTyypit.get(rivi.lahde_url) ?? "muu";
      let konteksti: { toimijaTunnukset?: string[] } | undefined;
      if (rivi.taulu === "hankkeet") {
        const orgId = hankeToimija.get(rivi.rivi_id);
        if (orgId) {
          const tunnukset = orgTunnukset.get(orgId);
          if (tunnukset?.length) konteksti = { toimijaTunnukset: tunnukset };
        }
      }
      const tyyppi = tehokasLahdeTyyppi(dbTyyppi, rivi.lahde_url, konteksti);
      const meta = kentatMap.get(avain) ?? {
        taulu: rivi.taulu,
        kentta: rivi.kentta,
        lahteet: [] as KenttaLahdeTyyppiInfo[],
      };
      meta.lahteet.push({ lahde_tyyppi: tyyppi, tekninen_lahde: false });
      kentatMap.set(avain, meta);
    }
    if (data.length < 1000) break;
  }

  const kentat = [...kentatMap.values()];

  console.log(
    JSON.stringify(
      {
        huomio:
          "Tehokas lahde_tyyppi (DB muu + domain + toimija-tunnus hankkeilla). Denominator = vain faktakentta_sitovuus.sitovuus_merkittaa.",
        tehokas_lahde_tyyppi: {
          kaikki_taulut: laske(kentat, sitovuusMerkittaa),
          taulu_hankkeet: laske(kentat, sitovuusMerkittaa, "hankkeet"),
        },
        vertailu_ilman_sitovuus_rajauksia: {
          kaikki_taulut: laske(
            kentat,
            () => true,
          ),
        },
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
