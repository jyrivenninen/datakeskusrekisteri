/**
 * hankkeen_oma-domain-osuma: tietokanta, jonossa olevat YTJ-ehdotukset, YTJ-snapshot.
 * Aja: npx tsx scripts/mittaa-hankkeen-oma-domain.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { lataaSitovuusHaku } from "../src/lib/faktakentta-sitovuus-lataus";
import {
  ehdotaLahdeTyyppiUrlille,
  organisaationVerkkoTunnukset,
  verkkotunnusYtjWebsite,
} from "../src/lib/lahde-tyyppi-domain";

const YTJ_JUURI = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; ytj-mittaus)";

async function haeYtjWebsite(yTunnus: string): Promise<string | null> {
  const u = new URL(YTJ_JUURI);
  u.searchParams.set("businessId", yTunnus);
  const vastaus = await fetch(u, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!vastaus.ok) return null;
  const runko = (await vastaus.json()) as {
    companies?: { website?: { url?: string } }[];
  };
  return verkkotunnusYtjWebsite(runko.companies?.[0]?.website?.url);
}

function laskeOsumat(opts: {
  orgTunnukset: Map<string, string[]>;
  hankeToimija: Map<string, string | null>;
  kenttaLahteet: { taulu: string; rivi_id: string; kentta: string; lahde_url: string }[];
  sitovuusMerkittaa: (taulu: string, kentta: string) => boolean;
}) {
  const urlHankkeenOma = new Set<string>();
  const kenttaAvaimet = new Set<string>();

  for (const rivi of opts.kenttaLahteet) {
    if (rivi.taulu !== "hankkeet") continue;
    const orgId = opts.hankeToimija.get(rivi.rivi_id);
    if (!orgId) continue;
    const tunnukset = opts.orgTunnukset.get(orgId);
    if (
      !tunnukset?.length ||
      ehdotaLahdeTyyppiUrlille(rivi.lahde_url, { toimijaTunnukset: tunnukset }) !== "hankkeen_oma"
    ) {
      continue;
    }
    urlHankkeenOma.add(rivi.lahde_url);
    const avain = `${rivi.taulu}:${rivi.rivi_id}:${rivi.kentta}`;
    if (opts.sitovuusMerkittaa(rivi.taulu, rivi.kentta)) {
      kenttaAvaimet.add(avain);
    }
  }

  return { url_hankkeen_oma: urlHankkeenOma.size, kentta_sitovuus_merkittaa: kenttaAvaimet.size };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);

  const { data: orgt } = await sb
    .from("organisaatiot")
    .select("id, nimi, y_tunnus, verkko_osoite, verkkotunnus")
    .eq("julkaistu", true);

  const tunnuksetTietokanta = new Map<string, string[]>();
  for (const o of orgt ?? []) {
    tunnuksetTietokanta.set(o.id, organisaationVerkkoTunnukset(o));
  }

  const tunnuksetJonossa = new Map(tunnuksetTietokanta);
  const { data: odottavat } = await sb
    .from("muutosehdotukset")
    .select("sisalto")
    .eq("tyyppi", "ytj_havainto")
    .eq("tila", "odottaa");
  for (const rivi of odottavat ?? []) {
    const ytj = (rivi.sisalto as { ytj?: { organisaatio_id?: string; verkkotunnus_ehdotus?: string } })
      ?.ytj;
    if (!ytj?.organisaatio_id || !ytj.verkkotunnus_ehdotus) continue;
    const lista = new Set(tunnuksetJonossa.get(ytj.organisaatio_id) ?? []);
    lista.add(ytj.verkkotunnus_ehdotus.toLowerCase());
    tunnuksetJonossa.set(ytj.organisaatio_id, [...lista]);
  }

  const tunnuksetYtjSnapshot = new Map(tunnuksetTietokanta);
  let ytjHaettu = 0;
  let ytjWebsiteLoytyi = 0;
  if (process.env.YTJ_SNAPSHOT === "1") {
    const yTunnusRe = /^[0-9]{7}-[0-9]$/;
    for (const o of orgt ?? []) {
      if (o.verkkotunnus?.trim()) continue;
      const yt = String(o.y_tunnus ?? "");
      if (!yTunnusRe.test(yt)) continue;
      ytjHaettu += 1;
      const t = await haeYtjWebsite(yt);
      if (t) {
        ytjWebsiteLoytyi += 1;
        const lista = new Set(tunnuksetYtjSnapshot.get(o.id) ?? []);
        lista.add(t);
        tunnuksetYtjSnapshot.set(o.id, [...lista]);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const urlit = new Set<string>();
  const kenttaLahteet: { taulu: string; rivi_id: string; kentta: string; lahde_url: string }[] =
    [];
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select("taulu, rivi_id, kentta, lahde_url, tekninen_lahde")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      if (r.tekninen_lahde || !r.lahde_url) continue;
      urlit.add(r.lahde_url);
      kenttaLahteet.push({
        taulu: r.taulu,
        rivi_id: r.rivi_id,
        kentta: r.kentta,
        lahde_url: r.lahde_url,
      });
    }
    if (data.length < 1000) break;
  }

  const hankeToimija = new Map<string, string | null>();
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb.from("hankkeet").select("id, toimija_organisaatio_id").range(alku, alku + 999);
    if (!data?.length) break;
    for (const h of data) hankeToimija.set(h.id, h.toimija_organisaatio_id);
    if (data.length < 1000) break;
  }

  const laskeParam = {
    orgTunnukset: tunnuksetTietokanta,
    hankeToimija,
    kenttaLahteet,
    sitovuusMerkittaa,
  };

  console.log(
    JSON.stringify(
      {
        uniikit_url: urlit.size,
        organisaatioita: orgt?.length ?? 0,
        verkkotunnus_tietokannassa: (orgt ?? []).filter((o) => o.verkkotunnus?.trim()).length,
        verkkotunnus_ehdotuksia_jonossa: (odottavat ?? []).filter(
          (r) =>
            (r.sisalto as { ytj?: { verkkotunnus_ehdotus?: string } })?.ytj?.verkkotunnus_ehdotus,
        ).length,
        ytj_snapshot: { haettu: ytjHaettu, website_loytyi: ytjWebsiteLoytyi },
        tietokanta: laskeOsumat({ ...laskeParam, orgTunnukset: tunnuksetTietokanta }),
        tietokanta_ja_jono: laskeOsumat({ ...laskeParam, orgTunnukset: tunnuksetJonossa }),
        tietokanta_ja_ytj_snapshot: laskeOsumat({
          ...laskeParam,
          orgTunnukset: tunnuksetYtjSnapshot,
        }),
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
