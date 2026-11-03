/**
 * Rikastaa eniten viitatut käsittelemättömät URL:t (domain + otsikko HTML:stä).
 * Julkaisee selkeät muu/rekisteri/media-tyypit ilman ehdotusjonoa.
 *
 * Aja: npx tsx scripts/rikasta-lahde-tyypit-top.ts [--kuiva] [--raja=30]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { haeHtmlOtsikko } from "../agents/lahde-html-otsikko";
import { ehdotaLahdeTyyppiUrlille, onKoostepalveluUrl, puraDomain } from "../src/lib/lahde-tyyppi-domain";
import {
  ehdotaHankkeenOmaToimijanPerusteella,
  rakennaYksilollisetToimijaTunnukset,
} from "../src/lib/hankkeen-oma-tunnistus";
import { oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";

const KASITTELIJA = "agentti:rikasta-lahde-tyypit-top";

function otsikkoUrlista(url: string): string {
  try {
    const polku = new URL(url).pathname;
    const viimeinen = decodeURIComponent(polku.split("/").filter(Boolean).pop() ?? "");
    if (viimeinen && viimeinen.length > 3) return viimeinen.replace(/[-_]/g, " ");
  } catch {
    /* */
  }
  return url;
}

function otsikkoDatacentermap(url: string): string {
  const m = url.match(/datacentermap\.com\/finland\/([^/]+)(?:\/([^/]+))?/i);
  if (!m) return otsikkoUrlista(url);
  const kunta = m[1].replace(/-/g, " ");
  const kohde = m[2]?.replace(/-/g, " ");
  return kohde ? `Data Center Map: ${kohde}, ${kunta}` : `Data Center Map: ${kunta}`;
}

function otsikkoWikipedia(url: string): string {
  if (url.includes("Luettelo_Suomen_kunnista")) return "Wikipedia: Luettelo Suomen kunnista";
  return otsikkoUrlista(url);
}

function paataOtsikko(url: string, htmlOtsikko: string | null): string {
  const host = puraDomain(url);
  if (host?.includes("datacentermap.com")) return otsikkoDatacentermap(url);
  if (host?.includes("wikipedia.org")) return otsikkoWikipedia(url);
  const html = htmlOtsikko?.trim();
  if (html && html.length > 5 && html.length < 200) return html;
  return otsikkoUrlista(url);
}

/** Kuntien /ajankohtaista/ pysyy muu — ei viranomaisasiakirja-automaatiota. */
function kunnanUutisSivu(url: string): boolean {
  const host = puraDomain(url) ?? "";
  const polku = new URL(url).pathname.toLowerCase();
  const kuntaHostit = ["sievi.fi", "mikseimikkeli.fi", "tuusula.fi", "akaa.fi", "alajarvi.fi"];
  if (kuntaHostit.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  return polku.includes("/ajankohtaista/");
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const raja = Number(process.argv.find((a) => a.startsWith("--raja="))?.slice(7) ?? "30");

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const organisaatiot: Array<{ id: string; verkkotunnus: string | null; verkko_osoite: string | null }> = [];
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb.from("organisaatiot").select("id, verkkotunnus, verkko_osoite").range(alku, alku + 999);
    if (!data?.length) break;
    organisaatiot.push(...data);
    if (data.length < 1000) break;
  }
  const yksilollisetTunnukset = rakennaYksilollisetToimijaTunnukset(organisaatiot);

  const { data: top, error } = await sb.rpc("rikasta_top_kasittelemattomat", { p_raja: raja });
  // fallback if RPC missing — use raw query via multiple calls
  let kohdeet: Array<{ dokumentti_id: string; url: string; viitteet: number }> = [];
  if (error?.message.includes("Could not find")) {
    const { data: rows } = await sb.from("dokumentit").select("id, url").is("lahde_metatiedot_kasitelty_pvm", null);
    const urlMaara = new Map<string, number>();
    for (let alku = 0; ; alku += 1000) {
      const { data: kl } = await sb.from("kentta_lahteet").select("lahde_url").range(alku, alku + 999);
      if (!kl?.length) break;
      for (const r of kl) {
        if (r.lahde_url) urlMaara.set(r.lahde_url, (urlMaara.get(r.lahde_url) ?? 0) + 1);
      }
      if (kl.length < 1000) break;
    }
    kohdeet = (rows ?? [])
      .map((d) => ({ dokumentti_id: d.id, url: d.url, viitteet: urlMaara.get(d.url) ?? 0 }))
      .sort((a, b) => b.viitteet - a.viitteet)
      .slice(0, raja);
  } else if (error) {
    throw new Error(error.message);
  } else {
    kohdeet = (top ?? []) as typeof kohdeet;
  }

  let kasitelty = 0;
  let ohitettu = 0;
  const epaselvat: string[] = [];
  const manuaalinen: string[] = [];

  for (const d of kohdeet) {
    let lahdeTyyppi: LahdeTyyppi;
    if (ehdotaHankkeenOmaToimijanPerusteella(d.url, yksilollisetTunnukset)) {
      lahdeTyyppi = "hankkeen_oma";
    } else {
      lahdeTyyppi = ehdotaLahdeTyyppiUrlille(d.url) ?? "muu";
      if (kunnanUutisSivu(d.url)) lahdeTyyppi = "muu";
      if (onKoostepalveluUrl(d.url)) lahdeTyyppi = "muu";
    }

    const selkea = ["rekisteri", "media", "menetelma", "muu", "hankkeen_oma"].includes(lahdeTyyppi);
    if (!selkea) {
      epaselvat.push(`${d.url} (ehdotus ${lahdeTyyppi})`);
      ohitettu += 1;
      continue;
    }

    let htmlOtsikko: string | null = null;
    if (
      !d.url.includes("datacentermap") &&
      !d.url.includes("wikipedia") &&
      !/\.pdf(\?|$)/i.test(d.url)
    ) {
      htmlOtsikko = await haeHtmlOtsikko(d.url);
    }

    const otsikko = paataOtsikko(d.url, htmlOtsikko);
    const sitovuus = oletusSitovuustaso(lahdeTyyppi);

    if (!kuiva) {
      const { error: rpcVirhe } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
        p_dokumentti_id: d.dokumentti_id,
        p_lahde_tyyppi: lahdeTyyppi,
        p_sitovuustaso: sitovuus,
        p_otsikko: otsikko,
        p_ehdotus_id: null,
        p_kasittelija: KASITTELIJA,
      });
      if (rpcVirhe) {
        epaselvat.push(`${d.url}: ${rpcVirhe.message}`);
        ohitettu += 1;
        continue;
      }
    }
    kasitelty += 1;
    console.log(`${lahdeTyyppi} (${d.viitteet} viit.) ${otsikko.slice(0, 70)}`);
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(JSON.stringify({ kuiva, kasitelty, ohitettu, epaselvat, manuaalinen }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
