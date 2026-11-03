import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const p = resolve(".env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[m[1]] ??= v;
  }
}
loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("env puuttuu");
const sb = createClient(url, key, { auth: { persistSession: false } });

const KENTAT = new Set([
  "teho_mw","it_teho_mw","pinta_ala_ha","sijainti_lat","sijainti_lon",
  "sijainti_alue_tyyppi","kaavatunnus","kortteli",
]);

function normNum(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function toMw(n: number, lainaus: string): number {
  const l = lainaus.toLowerCase();
  if (/\bk\s*w\b|\bkw\b/.test(l) && !/\bm\s*w\b|\bmw\b/.test(l) && n > 50) return n / 1000;
  return n;
}
function toHa(n: number, lainaus: string): number {
  const l = lainaus.toLowerCase();
  if (/\bm[²2]\b|\bsqm\b|\bsquare\s*m|\bneliö/.test(l) && n > 100) return n / 10000;
  return n;
}
function lainausSisaltaaArvon(kentta: string, arvo: string | null, lainaus: string): boolean | null {
  if (!arvo || !lainaus) return null;
  const a = arvo.trim();
  if (!a) return null;
  if (["kaavatunnus","kortteli","sijainti_alue_tyyppi"].includes(kentta)) {
    return lainaus.toLowerCase().includes(a.toLowerCase());
  }
  const num = normNum(a);
  if (num == null) return lainaus.includes(a);
  // extract numbers from lainaus
  const nums: number[] = [];
  const re = /-?\d+(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(lainaus))) {
    let n = Number(m[0].replace(",", "."));
    if (kentta.includes("teho") || kentta.includes("it_teho")) n = toMw(n, lainaus);
    if (kentta === "pinta_ala_ha") n = toHa(n, lainaus);
    nums.push(n);
  }
  if (!nums.length) return false;
  const target = kentta === "pinta_ala_ha" ? toHa(num, a) : (kentta.includes("teho") ? toMw(num, a) : num);
  return nums.some((n) => Math.abs(n - target) <= Math.max(0.01 * Math.abs(target), 1e-6));
}

const PINTA_EP = /\bmeters?\b|\bwhite\s*space\b|\bsqm\b|\bcolocation\b|\bfloor\b|\bgross\b|\bgfa\b|\bbuilding\b|\bkerrosala\b/i;
const TEHO_EP = /\bups\b|\bgenerator\b|\bvaravoima\b|\bmodule\b|\bphase\b|\binitial\b|\btarget\b|\bplanned\b/i;
const KOOSTE = /datacentermap|datacenters\.com|dcatlas|datacenterhawk|baxtel|datacenterdynamics|peeringdb/i;

type Row = {
  hanke: string; hanke_id: string; kentta: string; arvo: string | null;
  lainaus: string | null; url: string | null; syyt: string[];
};

async function main() {
  // fetch jm+ehdotus for agentti
  const { data: jm, error } = await sb
    .from("julkaistut_muutokset")
    .select("kentta,uusi_arvo,lahde_url,hanke_id,ehdotus_id,hyvaksytty_pvm, hankkeet!inner(nimi), muutosehdotukset!inner(kasittelija)")
    .eq("muutosehdotukset.kasittelija", "agentti:automaattinen");
  if (error) throw error;

  const focus = (jm ?? []).filter((r: any) => KENTAT.has(r.kentta) || r.kentta === "sijainti_lat" || r.kentta === "sijainti_lon");
  // sources
  const hankeIds = [...new Set(focus.map((r: any) => r.hanke_id))];
  const { data: lahteet } = await sb
    .from("kentta_lahteet")
    .select("rivi_id,kentta,lahde_url,lainaus,luottamus,merkitty,tila")
    .eq("taulu", "hankkeet")
    .in("rivi_id", hankeIds);

  const byKey = new Map<string, any[]>();
  for (const l of lahteet ?? []) {
    const k = `${l.rivi_id}|${l.kentta}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(l);
  }

  const counts: Record<string, number> = {
    i_ei_sisalla: 0, ii_pinta_ep: 0, iii_teho_ep: 0, iv_kooste: 0, v_viranomais_ero: 0, tarkistettu: 0,
  };
  const rows: Row[] = [];

  for (const r of focus as any[]) {
    const lahdeKentta = ["sijainti_lat","sijainti_lon","sijainti_alue_tyyppi"].includes(r.kentta) ? "sijainti" : r.kentta;
    const cands = (byKey.get(`${r.hanke_id}|${lahdeKentta}`) ?? []).filter(
      (l) => !r.lahde_url || l.lahde_url === r.lahde_url,
    );
    const L = cands[0];
    const lainaus = L?.lainaus ?? "";
    const url = r.lahde_url ?? L?.lahde_url ?? "";
    const arvo = r.uusi_arvo;
    const syyt: string[] = [];
    counts.tarkistettu++;

    const sis = lainausSisaltaaArvon(r.kentta, arvo, lainaus);
    if (sis === false) { counts.i_ei_sisalla++; syyt.push("lainaus_ei_sisalla_arvoa"); }

    if (r.kentta === "pinta_ala_ha" && PINTA_EP.test(lainaus)) {
      counts.ii_pinta_ep++; syyt.push("pinta_epaily_yksikko");
    }
    if ((r.kentta === "teho_mw" || r.kentta === "it_teho_mw") && TEHO_EP.test(lainaus)) {
      counts.iii_teho_ep++; syyt.push("teho_epaily_konteksti");
    }
    if (KOOSTE.test(url) || KOOSTE.test(lainaus)) {
      counts.iv_kooste++; syyt.push("koostepalvelu");
    }
    // v: viranomais conflict - other source with different value? We don't have arvo on lahde.
    // Approximate: if another lahde on same field has lainaus with different number
    if (["teho_mw","it_teho_mw","pinta_ala_ha"].includes(r.kentta)) {
      const others = (byKey.get(`${r.hanke_id}|${lahdeKentta}`) ?? []).filter((l) => l.lahde_url !== url);
      const target = normNum(arvo ?? "");
      if (target != null) {
        for (const o of others) {
          const nums: number[] = [];
          const re = /-?\d+(?:[.,]\d+)?/g; let m;
          while ((m = re.exec(o.lainaus ?? ""))) nums.push(Number(m[0].replace(",",".")));
          if (nums.some((n) => Math.abs(n - target) > Math.max(0.05 * Math.abs(target), 0.5) && Math.abs(n - target) / Math.max(Math.abs(target),1e-9) > 0.05)) {
            // only flag if URL looks viranomais
            if (/ymparisto\.fi|finlex|avi\.|ely|kunnan?|oncloudos|tweb|dynasty|paatos/i.test(o.lahde_url ?? "")) {
              counts.v_viranomais_ero++;
              syyt.push("viranomais_lainaus_ero");
              break;
            }
          }
        }
      }
    }

    if (syyt.length) {
      rows.push({
        hanke: r.hankkeet?.nimi ?? r.hanke_id,
        hanke_id: r.hanke_id,
        kentta: r.kentta,
        arvo,
        lainaus: (lainaus || "").slice(0, 120),
        url: (url || "").slice(0, 80),
        syyt,
      });
    }
  }

  rows.sort((a, b) => a.kentta.localeCompare(b.kentta) || a.hanke.localeCompare(b.hanke));
  console.log(JSON.stringify({ counts, n_epaily: rows.length, sample: rows.slice(0, 60) }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
