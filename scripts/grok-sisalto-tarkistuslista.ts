/**
 * Grok-jatkotoimet §3: tarkistuslistat (ei kirjoita tietokantaan).
 * Aja: npx tsx scripts/grok-sisalto-tarkistuslista.ts
 */
import { createClient } from "@supabase/supabase-js";
import { ehdotaLahdeTyyppiUrlille, onKoostepalveluUrl } from "../src/lib/lahde-tyyppi-domain";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

function lahdeLuokka(url: string): string {
  if (onKoostepalveluUrl(url)) return "koostepalvelu";
  const e = ehdotaLahdeTyyppiUrlille(url);
  if (e === "media") return "media";
  if (e === "muu" && !onKoostepalveluUrl(url)) return "muu";
  return e ?? "tunnistamaton";
}

async function hankkeenLahteet(sb: ReturnType<typeof createClient>, hankeId: string) {
  const { data } = await sb
    .from("kentta_lahteet")
    .select("kentta, lahde_url, luottamus, merkitty")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", hankeId)
    .order("kentta");
  return data ?? [];
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const nebiusId = "6df78b4b-ae27-4a9a-b264-1ea50ad2a390";
  const voikkaaId = "d92e39ef-2054-4ecb-9e5c-24eea5a3e9ed";
  const koriaId = "a1e05756-f6ec-4859-88ed-0ccde9065fda";

  const nebius = await hankkeenLahteet(sb, nebiusId);
  const byKenttaN = new Map<string, Array<{ url: string; luokka: string; luottamus: string; merkitty: string }>>();
  for (const r of nebius) {
    const luokka = lahdeLuokka(r.lahde_url);
    const lista = byKenttaN.get(r.kentta) ?? [];
    if (!lista.some((x) => x.url === r.lahde_url)) {
      lista.push({
        url: r.lahde_url,
        luokka,
        luottamus: r.luottamus,
        merkitty: r.merkitty,
      });
    }
    byKenttaN.set(r.kentta, lista);
  }

  type LahdeRivi = { url: string; luokka: string; luottamus: string; merkitty: string };
  const pelkkaMediaTaiKooste: Record<string, LahdeRivi[]> = {};
  for (const [k, lista] of byKenttaN) {
    const onMediaTaiKooste = (x: LahdeRivi) =>
      x.luokka === "media" || x.luokka === "koostepalvelu";
    if (lista.length > 0 && lista.every(onMediaTaiKooste)) {
      pelkkaMediaTaiKooste[k] = lista;
    }
  }

  /** Grokin kuvaus pöytäkirjasta — ei rekisteridataa. */
  const poytakirjaMainitseeAiheet = [
    "kortteli 2319 tontti 1",
    "vuokralainen FinCap DC Corp Oy / FCDC Corp Oy",
    "Kunnanhallitus 15.6.2026 § 112",
  ];

  const voikkaaLahteet = await hankkeenLahteet(sb, voikkaaId);
  const koriaLahteet = await hankkeenLahteet(sb, koriaId);

  function kentatRinnakkain(lahteet: typeof voikkaaLahteet) {
    const m = new Map<string, Array<{ url: string; luokka: string }>>();
    for (const r of lahteet) {
      if (!["nimi", "sijainti", "kaavatunnus"].includes(r.kentta)) continue;
      const l = m.get(r.kentta) ?? [];
      if (!l.some((x) => x.url === r.lahde_url)) {
        l.push({ url: r.lahde_url, luokka: lahdeLuokka(r.lahde_url) });
      }
      m.set(r.kentta, l);
    }
    return Object.fromEntries(m);
  }

  console.log(
    JSON.stringify(
      {
        nebius_mantsala_2_kapuli: {
          kentat_joissa_lahteet_vain_media_tai_koostepalvelu: pelkkaMediaTaiKooste,
          poytakirja_2026567_6_grokin_kuvaus: poytakirjaMainitseeAiheet,
        },
        hyperco: {
          voikkaa: kentatRinnakkain(voikkaaLahteet),
          koria_fin_holdco: kentatRinnakkain(koriaLahteet),
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
