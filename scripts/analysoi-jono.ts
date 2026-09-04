/**
 * Analysoi odottavat muutosehdotukset. Aja: npx tsx scripts/analysoi-jono.ts
 * Älä commitoi tulostetta; ei muuta dataa.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat .env.local-tiedostosta.");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await sb
    .from("muutosehdotukset")
    .select("id,tyyppi,hanke_id,huomautus,sisalto,lahde_url,ehdottaja_tunniste,luotu_pvm")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });
  if (error) throw error;

  const ids = [...new Set((rows ?? []).map((r) => r.hanke_id).filter(Boolean))] as string[];
  const { data: hankkeet } = await sb.from("hankkeet").select("id,nimi,kunta,vaihe").in("id", ids);
  const hm = new Map((hankkeet ?? []).map((h) => [h.id, h]));

  type Rivit = NonNullable<typeof rows>[number];
  type Sisalto = Record<string, unknown>;

  for (const r of rows ?? []) {
    const s = (r.sisalto ?? {}) as Sisalto;
    const h = r.hanke_id ? hm.get(r.hanke_id) : null;
    const rivi: Record<string, unknown> = {
      id: r.id,
      tyyppi: r.tyyppi,
      hanke: h?.nimi ?? null,
      kunta: h?.kunta ?? null,
      vaihe: h?.vaihe ?? null,
      hanke_id: r.hanke_id,
      huomautus: r.huomautus,
      ehdottaja: r.ehdottaja_tunniste,
    };

    if (r.tyyppi === "ristiriita_havainto") {
      const ri = s.ristiriita as { saanto?: string; avain?: string; huomautus?: string } | undefined;
      if (!ri?.saanto) {
        rivi.luokka = "grok_vaara_muoto";
        rivi.kentta = s.kentta;
        rivi.ehdotettu_toimenpide = s.ehdotettu_toimenpide;
        rivi.havainto = s.havainto;
      } else {
        rivi.luokka = "sql_ristiriita";
        rivi.saanto = ri.saanto;
        rivi.avain = ri.avain;
      }
    } else if (r.tyyppi === "taydennys" || r.tyyppi === "korjaus") {
      const kentat = (s.kentat ?? {}) as Record<string, { arvo?: string }>;
      rivi.kentat = Object.fromEntries(
        Object.entries(kentat).map(([k, v]) => [k, v.arvo]),
      );
    } else if (r.tyyppi === "paatos") {
      const p = s.paatos as { kuvaus?: string; pvm?: string; lahteet?: unknown[] } | undefined;
      rivi.paatos_kuvaus = p?.kuvaus;
      rivi.paatos_pvm = p?.pvm;
      rivi.lahteet_ok = Array.isArray(p?.lahteet) && p.lahteet.length > 0;
    } else if (r.tyyppi === "maaraaja") {
      const m = s.maaraaja as {
        tyyppi?: string;
        alkaa_pvm?: string;
        paattyy_pvm?: string;
        lahteet?: unknown[];
      } | undefined;
      rivi.maaraaja_tyyppi = m?.tyyppi;
      rivi.maaraaja_alkaa = m?.alkaa_pvm;
      rivi.maaraaja_paattyy = m?.paattyy_pvm;
      rivi.lahteet_ok = Array.isArray(m?.lahteet) && m.lahteet.length > 0;
    } else if (r.tyyppi === "linkki_rikki") {
      rivi.linkki = (s.linkki as { url?: string; http_tila?: number })?.url;
      rivi.http = (s.linkki as { http_tila?: number })?.http_tila;
    } else if (r.tyyppi === "ryhti_havainto") {
      rivi.hakuehto = (s.ryhti as { hakuehto?: string })?.hakuehto;
    }

    console.log(JSON.stringify(rivi));
  }
  console.error(`Yhteensä: ${rows?.length ?? 0}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
