/**
 * Regressio: koodin B2-vaihtelväli (tyhjät havainnot) = live-etusivulogikka.
 * Vertaa myös hanke_teho_julkinen.mukana_summassa. Ei kirjoita.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { hankeVaihtelvalit } from "../src/lib/hanke-vaihtelvali";
import { hankeTehoVaihtelvaliB2 } from "../src/lib/tehohavainnot";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: hankkeet, error } = await sb
    .from("hankkeet")
    .select("id, nimi, vaihe, it_teho_mw, teho_mw, teho_erittelematon_mw")
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null);
  if (error) throw new Error(error.message);

  const { data: ve } = await sb
    .from("hanke_vaihtoehdot")
    .select("hanke_id, tunnus, it_teho_mw, teho_mw");

  const veBy = new Map<string, typeof ve>();
  for (const r of ve ?? []) {
    const a = veBy.get(r.hanke_id) ?? [];
    a.push(r);
    veBy.set(r.hanke_id, a);
  }

  let min = 0;
  let max = 0;
  let n = 0;
  let b2min = 0;
  let b2max = 0;
  let b2n = 0;
  let suljettuMin = 0;
  let suljettuMax = 0;
  let suljettuN = 0;
  for (const h of hankkeet ?? []) {
    const vaihtoehdot = veBy.get(h.id) ?? [];
    const vanha = hankeVaihtelvalit(h, vaihtoehdot).teho;
    const b2 = hankeTehoVaihtelvaliB2(h, vaihtoehdot, []);
    const suljettu = hankeTehoVaihtelvaliB2(h, vaihtoehdot, [], { suljePerutut: true });
    if (vanha) {
      min += vanha.min;
      max += vanha.max;
      n += 1;
    }
    if (b2) {
      b2min += b2.min;
      b2max += b2.max;
      b2n += 1;
    }
    if (suljettu) {
      suljettuMin += suljettu.min;
      suljettuMax += suljettu.max;
      suljettuN += 1;
    }
    if ((vanha?.min ?? null) !== (b2?.min ?? null) || (vanha?.max ?? null) !== (b2?.max ?? null)) {
      console.error("ERO", h.nimi, vanha, b2);
      process.exit(2);
    }
  }

  const { data: nakyma, error: nErr } = await sb
    .from("hanke_teho_julkinen")
    .select("teho_min_mw, teho_max_mw, mukana_summassa");
  if (nErr) throw new Error(nErr.message);
  let nMin = 0;
  let nMax = 0;
  let nN = 0;
  for (const r of nakyma ?? []) {
    if (!r.mukana_summassa) continue;
    if (r.teho_min_mw != null) nMin += Number(r.teho_min_mw);
    nMax += Number(r.teho_max_mw ?? r.teho_min_mw ?? 0);
    nN += 1;
  }

  console.log(
    JSON.stringify(
      {
        koodi_vanha: { min: round2(min), max: round2(max), n },
        koodi_b2_tyhja_push1: { min: round2(b2min), max: round2(b2max), n: b2n },
        koodi_sulje_perutut: {
          min: round2(suljettuMin),
          max: round2(suljettuMax),
          n: suljettuN,
        },
        nakyma_mukana: { min: round2(nMin), max: round2(nMax), n: nN },
        TEHO_SULJE_PERUTUT_oletus: false,
        identtinen_push1_vs_live: round2(b2min) === 13586.05 && b2n === 107,
        identtinen_suljettu_vs_nakyma:
          round2(suljettuMin) === round2(nMin) && suljettuN === nN,
        odotus_live: "13586.05-14212.05/107",
        odotus_mukana: "13546.05-14172.05/106",
      },
      null,
      2,
    ),
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
