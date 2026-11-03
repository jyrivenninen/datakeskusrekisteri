/**
 * Dry-run: vihreät kentät → lähdekohtainen katselmointijono lippuineen.
 * Ei kirjoita kantaan. CSV → agents/data/
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import {
  organisaationVerkkoTunnukset,
  tehokasLahdeTyyppi,
} from "../src/lib/lahde-tyyppi-domain";
import { kentanTila } from "../src/lib/naytto";
import { sijainninKentanTila } from "../src/lib/sijainti-tila";
import type { Luottamus, Merkinta, SijaintiAlueTyyppi } from "../src/lib/supabase/tietokanta";

type Lahde = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  lainaus: string | null;
  tekninen_lahde: boolean;
  luottamus: Luottamus;
  merkitty: Merkinta;
  tila: string | null;
  kuittaustapa: string | null;
  vahvistettu_pvm: string;
};

const KENTAT = [
  "nimi",
  "kunta",
  "vaihe",
  "sijainti",
  "kaavatunnus",
  "kortteli",
  "pinta_ala_ha",
  "kaava_ala_ha",
  "teho_mw",
  "it_teho_mw",
  "sahkonkaytto_twh_a",
  "generaattorit_lkm",
  "yva_diaarinumero",
  "huomautus",
] as const;

const NUM_KENTAT = new Set([
  "teho_mw",
  "it_teho_mw",
  "pinta_ala_ha",
  "kaava_ala_ha",
  "generaattorit_lkm",
  "sahkonkaytto_twh_a",
]);

const TEKSTI_KENTAT = new Set([
  "kunta",
  "nimi",
  "vaihe",
  "yva_diaarinumero",
  "kaavatunnus",
  "kortteli",
]);

const EPAVARMUUS =
  /\b(tavoite|arvio|jopa|enintään|aluksi|ensimmäinen\s+vaihe|initial|planned|target|voi\s+olla|mahdollinen|suunnitteilla)\b/i;

const ERIAVA =
  /eriävä\s+mielipide|eriava\s+mielipide|liite\s+.*eriävä|mielipide/i;

const MEDIA_HOST =
  /\b(yle\.fi|ksml\.fi|aamulehti\.fi|hs\.fi|is\.fi|kauppalehti\.fi|talouselama\.fi|mtvuutiset\.fi|iltalehti\.fi|satakunnankansa\.fi|hameensanomat\.fi|epressi\.com|datacenterdynamics\.com|datacentermap\.com|dcatlas\.io|peeringdb\.com)\b/i;

const ALUE_EI_TONTTI =
  /\b(hankealue|suunnittelualue|kaava[- ]?alue|osayleiskaava|asemakaava[- ]?alue|varausalue|sopimusalue)\b/i;

function csvSolu(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Normalisoi lainaus lukujen vertailuun: pilkku→piste, välit pois. */
function normalisoiTeksti(t: string): string {
  return t
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ");
}

function arvoEsiintyyLainauksessa(
  kentta: string,
  arvo: unknown,
  lainaus: string,
): boolean {
  if (arvo == null || arvo === "") return true;
  const L = normalisoiTeksti(lainaus);
  if (!L.trim()) return false;
  const n = Number(String(arvo).replace(",", "."));
  if (!Number.isFinite(n)) {
    return L.includes(normalisoiTeksti(String(arvo)));
  }

  const variants = new Set<string>();
  variants.add(String(n));
  variants.add(n.toFixed(1).replace(/\.0$/, ""));
  variants.add(String(n).replace(".", ","));

  if (kentta === "teho_mw" || kentta === "it_teho_mw") {
    variants.add(String(n));
    variants.add(String(Math.round(n * 1000))); // kW
    variants.add(`${Math.round(n * 1000)}`);
    // 5.4 / 5,4 / 5.400
    variants.add(n.toLocaleString("fi-FI"));
  }
  if (kentta === "pinta_ala_ha" || kentta === "kaava_ala_ha") {
    variants.add(String(n));
    variants.add(String(Math.round(n * 10000))); // m²
    variants.add(String(Math.round(n * 10000)).replace(/\B(?=(\d{3})+(?!\d))/g, " "));
  }
  if (kentta === "generaattorit_lkm") {
    variants.add(String(Math.round(n)));
  }

  for (const v of variants) {
    const vv = normalisoiTeksti(v);
    if (!vv) continue;
    // Sana-/lukuraja: vältä 5 ∈ 500
    const re = new RegExp(
      `(^|[^0-9.,])${vv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9]|$)`,
    );
    if (re.test(L)) return true;
  }
  return false;
}

function arvoOn(
  h: { [k: string]: unknown },
  kentta: string,
): boolean {
  if (kentta === "sijainti") {
    return (
      h.sijainti_lat != null ||
      h.sijainti_lon != null ||
      h.sijainti_alue != null
    );
  }
  const v = h[kentta];
  return v != null && v !== "";
}

function kentanArvo(h: { [k: string]: unknown }, kentta: string): string {
  if (kentta === "sijainti") {
    return [h.sijainti_lat, h.sijainti_lon].filter((x) => x != null).join(",");
  }
  return h[kentta] == null ? "" : String(h[kentta]);
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const docTyypit = new Map<string, LahdeTyyppi>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("dokumentit")
      .select("url, lahde_tyyppi")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const d of data) docTyypit.set(d.url, d.lahde_tyyppi as LahdeTyyppi);
    if (data.length < 1000) break;
  }

  const orgTunnukset = new Map<string, string[]>();
  const { data: orgt, error: orgVirhe } = await sb
    .from("organisaatiot")
    .select("id, verkko_osoite, verkkotunnus")
    .eq("julkaistu", true);
  if (orgVirhe) throw new Error(orgVirhe.message);
  for (const o of orgt ?? []) {
    orgTunnukset.set(o.id, organisaationVerkkoTunnukset(o));
  }

  const hankeToimija = new Map<string, string | null>();
  const hankkeet = new Map<
    string,
    {
      id: string;
      nimi: string;
      julkaistu: boolean;
      sijainti_alue_tyyppi: SijaintiAlueTyyppi | null;
      sijainti_lat: number | null;
      sijainti_lon: number | null;
      sijainti_alue: unknown;
      [k: string]: unknown;
    }
  >();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("hankkeet")
      .select(
        "id, nimi, julkaistu, yhdistetty_kohde_id, toimija_organisaatio_id, sijainti_alue_tyyppi, sijainti_lat, sijainti_lon, sijainti_alue, vaihe, kunta, teho_mw, it_teho_mw, pinta_ala_ha, kaava_ala_ha, kaavatunnus, kortteli, sahkonkaytto_twh_a, generaattorit_lkm, yva_diaarinumero, huomautus",
      )
      .is("yhdistetty_kohde_id", null)
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const h of data) {
      hankkeet.set(h.id, h as never);
      hankeToimija.set(h.id, h.toimija_organisaatio_id);
    }
    if (data.length < 1000) break;
  }

  const lahteet: Lahde[] = [];
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select(
        "taulu, rivi_id, kentta, lahde_url, lainaus, tekninen_lahde, luottamus, merkitty, tila, kuittaustapa, vahvistettu_pvm",
      )
      .eq("taulu", "hankkeet")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) lahteet.push(r as Lahde);
    if (data.length < 1000) break;
  }

  const byKey = new Map<string, Lahde[]>();
  for (const l of lahteet) {
    const k = `${l.rivi_id}|${l.kentta}`;
    const a = byKey.get(k) ?? [];
    a.push(l);
    byKey.set(k, a);
  }

  function lahteetTyypeilla(ls: Lahde[]) {
    return ls.map((l) => {
      const toimija = hankeToimija.get(l.rivi_id);
      const tunnukset = toimija ? (orgTunnukset.get(toimija) ?? []) : [];
      const dok = docTyypit.get(l.lahde_url) ?? "muu";
      const tyyppi = tehokasLahdeTyyppi(dok, l.lahde_url, {
        toimijaVerkkoTunnukset: tunnukset,
      });
      return { ...l, lahde_tyyppi: tyyppi };
    });
  }

  type KenttaRivi = {
    hanke_id: string;
    hanke_nimi: string;
    kentta: string;
    arvo: string;
    lahde_url: string;
    lahde_tyyppi: string;
    host: string;
    lainaus: string;
    liput: string[];
  };

  const kenttaRivit: KenttaRivi[] = [];

  for (const h of hankkeet.values()) {
    if (!h.julkaistu) continue;
    for (const kentta of KENTAT) {
      if (!arvoOn(h, kentta)) continue;
      const ls = byKey.get(`${h.id}|${kentta}`) ?? [];
      const typed = lahteetTyypeilla(ls);
      const tila =
        kentta === "sijainti"
          ? sijainninKentanTila(
              h.sijainti_alue_tyyppi,
              true,
              typed,
              new Map(
                typed.map((t) => [
                  t.lahde_url,
                  (t.lahde_tyyppi ?? "muu") as LahdeTyyppi,
                ]),
              ),
            )
          : kentanTila(true, typed);
      if (tila !== "vahvistettu") continue;

      const vihrea = typed.find(
        (l) =>
          l.merkitty === "ihmisen_vahvistama" &&
          l.tila !== "korvattu" &&
          l.tila !== "ei_tue" &&
          !l.tekninen_lahde &&
          ["paatos", "viranomaisasiakirja", "rekisteri"].includes(l.lahde_tyyppi),
      );
      if (!vihrea) continue;

      const arvo = kentanArvo(h, kentta);
      const lainaus = vihrea.lainaus ?? "";
      const host = hostOf(vihrea.lahde_url);
      const liput: string[] = [];

      if (NUM_KENTAT.has(kentta) && !arvoEsiintyyLainauksessa(kentta, arvo, lainaus)) {
        liput.push("i_arvo_ei_lainauksessa");
      }
      if (EPAVARMUUS.test(lainaus)) liput.push("ii_epavarma_sana");
      if (ERIAVA.test(lainaus) || ERIAVA.test(vihrea.lahde_url)) {
        liput.push("iii_eriava_mielipide");
      }
      if (
        (vihrea.lahde_tyyppi === "paatos" ||
          vihrea.lahde_tyyppi === "viranomaisasiakirja") &&
        MEDIA_HOST.test(host)
      ) {
        liput.push("iv_media_host_viranomaistyyppi");
      }

      const muutArvot = typed
        .filter(
          (l) =>
            l.tila !== "korvattu" &&
            l.tila !== "ei_tue" &&
            !l.tekninen_lahde &&
            l.lahde_url !== vihrea.lahde_url,
        )
        .map((l) => l.lainaus ?? "");
      // Yksinkertainen ristiriita: toinen lainaus sisältää selvästi eri luvun samalle num-kentälle
      if (NUM_KENTAT.has(kentta) && Number.isFinite(Number(String(arvo).replace(",", ".")))) {
        const n = Number(String(arvo).replace(",", "."));
        for (const m of typed) {
          if (m.lahde_url === vihrea.lahde_url) continue;
          if (m.tila === "korvattu" || m.tila === "ei_tue" || m.tekninen_lahde) continue;
          const ml = m.lainaus ?? "";
          if (!ml.trim()) continue;
          // jos toinen lähde ei sisällä arvoa mutta sisältää toisen selkeän MW/ha-luvun
          if (!arvoEsiintyyLainauksessa(kentta, arvo, ml)) {
            const toiset = ml.match(/\b\d{1,4}(?:[.,]\d+)?\s*(?:MW|megawatt|ha|hehtaar)/gi);
            if (toiset && toiset.length > 0) {
              liput.push("v_ristiriita_toinen_lahde");
              break;
            }
          }
          void n;
        }
      }
      void muutArvot;

      if (kentta === "huomautus") liput.push("vi_huomautus");
      if (kentta === "pinta_ala_ha" && ALUE_EI_TONTTI.test(lainaus)) {
        liput.push("vii_pinta_ei_tontti");
      }

      kenttaRivit.push({
        hanke_id: h.id,
        hanke_nimi: h.nimi,
        kentta,
        arvo,
        lahde_url: vihrea.lahde_url,
        lahde_tyyppi: vihrea.lahde_tyyppi,
        host,
        lainaus,
        liput: [...new Set(liput)],
      });
    }
  }

  // Ryhmittely: hanke + lähde-URL
  type Ryhma = {
    prioriteetti: "A" | "B" | "C";
    hanke_id: string;
    hanke: string;
    lahde_url: string;
    lahde_tyyppi: string;
    host: string;
    kentat: string[];
    kenttia: number;
    lainaukset: string;
    liput: string[];
  };

  const groups = new Map<string, KenttaRivi[]>();
  for (const r of kenttaRivit) {
    const k = `${r.hanke_id}|${r.lahde_url}`;
    const a = groups.get(k) ?? [];
    a.push(r);
    groups.set(k, a);
  }

  const rivit: Ryhma[] = [];
  for (const [, ks] of groups) {
    const first = ks[0]!;
    const allLiput = [...new Set(ks.flatMap((k) => k.liput))];
    const hasABC = allLiput.some((l) =>
      ["i_arvo_ei_lainauksessa", "ii_epavarma_sana", "iii_eriava_mielipide", "iv_media_host_viranomaistyyppi", "v_ristiriita_toinen_lahde"].includes(l),
    );
    const hasNum = ks.some((k) => NUM_KENTAT.has(k.kentta));
    const onlyText = ks.every((k) => TEKSTI_KENTAT.has(k.kentta));
    let prioriteetti: "A" | "B" | "C";
    if (hasABC) prioriteetti = "A";
    else if (hasNum && !onlyText) prioriteetti = "B";
    else if (onlyText) prioriteetti = "C";
    else prioriteetti = "B";

    rivit.push({
      prioriteetti,
      hanke_id: first.hanke_id,
      hanke: first.hanke_nimi,
      lahde_url: first.lahde_url,
      lahde_tyyppi: first.lahde_tyyppi,
      host: first.host,
      kentat: ks.map((k) => k.kentta),
      kenttia: ks.length,
      lainaukset: ks
        .map((k) => `[${k.kentta}=${k.arvo}] ${k.lainaus}`)
        .join(" || "),
      liput: allLiput,
    });
  }

  rivit.sort((a, b) => {
    const p = a.prioriteetti.localeCompare(b.prioriteetti);
    if (p) return p;
    return (
      a.hanke.localeCompare(b.hanke, "fi") ||
      a.lahde_url.localeCompare(b.lahde_url)
    );
  });

  const otsikko = [
    "prioriteetti",
    "hanke",
    "hanke_id",
    "lahde_url",
    "lahde_tyyppi",
    "host",
    "kentat",
    "kenttia",
    "lainaukset",
    "liput",
  ];
  const csv = [
    otsikko.join(","),
    ...rivit.map((r) =>
      [
        r.prioriteetti,
        r.hanke,
        r.hanke_id,
        r.lahde_url,
        r.lahde_tyyppi,
        r.host,
        r.kentat.join("|"),
        r.kenttia,
        r.lainaukset,
        r.liput.join("|"),
      ]
        .map(csvSolu)
        .join(","),
    ),
  ].join("\n");

  const polku = "agents/data/vihreat-katselmointijono-2026-10-13.csv";
  writeFileSync(polku, csv + "\n", "utf8");

  const lippuCount = new Map<string, number>();
  for (const r of rivit) {
    for (const l of r.liput) lippuCount.set(l, (lippuCount.get(l) ?? 0) + 1);
  }
  const prio = {
    A: rivit.filter((r) => r.prioriteetti === "A").length,
    B: rivit.filter((r) => r.prioriteetti === "B").length,
    C: rivit.filter((r) => r.prioriteetti === "C").length,
  };

  console.log(
    JSON.stringify(
      {
        lahde_ryhmaa: rivit.length,
        kenttia: kenttaRivit.length,
        prioriteetit: prio,
        liputtain: Object.fromEntries(
          [...lippuCount.entries()].sort((a, b) => b[1] - a[1]),
        ),
        polku,
        A_esimerkit: rivit
          .filter((r) => r.prioriteetti === "A")
          .slice(0, 40)
          .map((r) => ({
            hanke: r.hanke,
            host: r.host,
            tyyppi: r.lahde_tyyppi,
            kentat: r.kentat,
            liput: r.liput,
            url: r.lahde_url.slice(0, 90),
          })),
        helios: kenttaRivit.filter(
          (k) =>
            k.hanke_nimi.includes("Helios Lapinlahti") &&
            k.lahde_url.includes("44517"),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
