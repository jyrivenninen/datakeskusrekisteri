/**
 * Dry-run: listaa UI-pariteetin mukaiset vihreät kentät (kentanTila / sijainninKentanTila).
 * Ei kirjoita tietokantaan. CSV → agents/data/
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

function csvSolu(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

  function arvoOn(
    h: (typeof hankkeet extends Map<string, infer V> ? V : never),
    kentta: string,
  ) {
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

  function lahteetTyypeilla(ls: Lahde[]) {
    return ls.map((l) => {
      const toimija = hankeToimija.get(l.rivi_id);
      const tunnukset = toimija ? (orgTunnukset.get(toimija) ?? []) : [];
      const dok = docTyypit.get(l.lahde_url) ?? "muu";
      const tyyppi = tehokasLahdeTyyppi(dok, l.lahde_url, {
        toimijaVerkkoTunnukset: tunnukset,
      });
      return {
        ...l,
        lahde_tyyppi: tyyppi,
      };
    });
  }

  const rivit: Array<{
    hanke_id: string;
    hanke_nimi: string;
    kentta: string;
    lahde_url: string;
    lahde_tyyppi: string;
    merkitty: string;
    kuittaustapa: string;
    vahvistettu_pvm: string;
    lainaus_lyhyt: string;
  }> = [];
  const kentittain = new Map<string, number>();

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

      const vihreaLahde = typed.find(
        (l) =>
          l.merkitty === "ihmisen_vahvistama" &&
          l.tila !== "korvattu" &&
          l.tila !== "ei_tue" &&
          !l.tekninen_lahde &&
          ["paatos", "viranomaisasiakirja", "rekisteri"].includes(l.lahde_tyyppi),
      );
      if (!vihreaLahde) continue;

      kentittain.set(kentta, (kentittain.get(kentta) ?? 0) + 1);
      rivit.push({
        hanke_id: h.id,
        hanke_nimi: h.nimi,
        kentta,
        lahde_url: vihreaLahde.lahde_url,
        lahde_tyyppi: vihreaLahde.lahde_tyyppi,
        merkitty: vihreaLahde.merkitty,
        kuittaustapa: vihreaLahde.kuittaustapa ?? "",
        vahvistettu_pvm: String(vihreaLahde.vahvistettu_pvm).slice(0, 10),
        lainaus_lyhyt: (vihreaLahde.lainaus ?? "").slice(0, 120).replace(/\s+/g, " "),
      });
    }
  }

  rivit.sort((a, b) =>
    a.hanke_nimi.localeCompare(b.hanke_nimi, "fi") ||
    a.kentta.localeCompare(b.kentta, "fi"),
  );

  const otsikko = [
    "hanke_id",
    "hanke_nimi",
    "kentta",
    "lahde_url",
    "lahde_tyyppi",
    "merkitty",
    "kuittaustapa",
    "vahvistettu_pvm",
    "lainaus_lyhyt",
  ];
  const csv = [
    otsikko.join(","),
    ...rivit.map((r) =>
      [
        r.hanke_id,
        r.hanke_nimi,
        r.kentta,
        r.lahde_url,
        r.lahde_tyyppi,
        r.merkitty,
        r.kuittaustapa,
        r.vahvistettu_pvm,
        r.lainaus_lyhyt,
      ]
        .map(csvSolu)
        .join(","),
    ),
  ].join("\n");

  const polku = "agents/data/vihreat-kentat-2026-10-13.csv";
  writeFileSync(polku, csv + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        yht: rivit.length,
        kentittain: Object.fromEntries(
          [...kentittain.entries()].sort((a, b) => b[1] - a[1]),
        ),
        ilman_kuittaustapaa: rivit.filter((r) => !r.kuittaustapa).length,
        kuittaustapa_yksittain: rivit.filter((r) => r.kuittaustapa === "yksittain")
          .length,
        kuittaustapa_era: rivit.filter((r) => r.kuittaustapa === "era").length,
        polku,
        esimerkit: rivit.slice(0, 15).map((r) => ({
          hanke: r.hanke_nimi,
          kentta: r.kentta,
          tyyppi: r.lahde_tyyppi,
          kuittaustapa: r.kuittaustapa || null,
        })),
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
