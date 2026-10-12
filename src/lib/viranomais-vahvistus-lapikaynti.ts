/**
 * Kentät, joilla on viranomaislähde mutta ei ihmisen vahvistamaa viranomaislähdettä.
 * Käyttää samaa sääntöä kuin mittaa-viranomais-ilman-ihmisen-vahvistusta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { lataaSitovuusHaku } from "@/lib/faktakentta-sitovuus-lataus";
import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";
import {
  organisaationVerkkoTunnukset,
  tehokasLahdeTyyppi,
} from "@/lib/lahde-tyyppi-domain";
import { VARMISTAVAT_LAHDE_TYYPIT } from "@/lib/kentta-varmistus";
import type { Merkinta } from "@/lib/supabase/tietokanta";

const VARM = new Set<string>(VARMISTAVAT_LAHDE_TYYPIT);

export const VIRANOMAIS_VAHVISTUS_RYHMAT = {
  maaraajat: {
    taulu: "maaraajat" as const,
    kentat: ["alkaa_pvm", "paattyy_pvm", "tyyppi"] as const,
  },
  hankkeet: {
    taulu: "hankkeet" as const,
    kentat: [
      "kaavatunnus",
      "kortteli",
      "vaihe",
      "generaattorit_lkm",
      "pinta_ala_ha",
      "sahkonkaytto_twh_a",
      "it_teho_mw",
      "teho_mw",
    ] as const,
  },
  paatokset: {
    taulu: "paatokset" as const,
    kentat: null as null, // kaikki sitovuus_merkittaa (*)
  },
} as const;

export type ViranomaisVahvistusRyhma = keyof typeof VIRANOMAIS_VAHVISTUS_RYHMAT;

export type ViranomaisVahvistusLahde = {
  lahde_id: string;
  lahde_url: string;
  lahde_sivu: number | null;
  lainaus: string | null;
  merkitty: Merkinta;
  lahde_tyyppi: LahdeTyyppi;
};

export type ViranomaisVahvistusRivi = {
  avain: string;
  taulu: string;
  rivi_id: string;
  kentta: string;
  arvo: string | null;
  hanke_id: string | null;
  hanke_nimi: string | null;
  otsikko: string;
  lahteet: ViranomaisVahvistusLahde[];
};

async function haeDocTyypit(sb: SupabaseClient) {
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
  return docTyypit;
}

export async function haeViranomaisVahvistusRivit(
  sb: SupabaseClient,
  ryhma: ViranomaisVahvistusRyhma,
): Promise<ViranomaisVahvistusRivi[]> {
  const maara = VIRANOMAIS_VAHVISTUS_RYHMAT[ryhma];
  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);
  const docTyypit = await haeDocTyypit(sb);

  const orgTunnukset = new Map<string, string[]>();
  const { data: orgt } = await sb
    .from("organisaatiot")
    .select("id, verkko_osoite, verkkotunnus")
    .eq("julkaistu", true);
  for (const o of orgt ?? []) {
    orgTunnukset.set(o.id, organisaationVerkkoTunnukset(o));
  }

  const hankeToimija = new Map<string, string | null>();
  const hankeNimi = new Map<string, string>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("hankkeet")
      .select("id, nimi, toimija_organisaatio_id")
      .eq("julkaistu", true)
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const h of data) {
      hankeToimija.set(h.id, h.toimija_organisaatio_id);
      hankeNimi.set(h.id, h.nimi);
    }
    if (data.length < 1000) break;
  }

  type Acc = {
    taulu: string;
    rivi_id: string;
    kentta: string;
    lahteet: ViranomaisVahvistusLahde[];
  };
  const kartta = new Map<string, Acc>();

  for (let alku = 0; ; alku += 1000) {
    let kysely = sb
      .from("kentta_lahteet")
      .select(
        "id, taulu, rivi_id, kentta, lahde_url, lahde_sivu, lainaus, merkitty, tekninen_lahde, tila",
      )
      .eq("taulu", maara.taulu)
      .neq("tila", "korvattu")
      .range(alku, alku + 999);
    if (maara.kentat) {
      kysely = kysely.in("kentta", [...maara.kentat]);
    }
    const { data, error } = await kysely;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const r of data) {
      if (r.tekninen_lahde) continue;
      if (!sitovuusMerkittaa(r.taulu, r.kentta)) continue;
      const dbTyyppi = docTyypit.get(r.lahde_url) ?? "muu";
      let konteksti: { toimijaTunnukset?: string[] } | undefined;
      if (r.taulu === "hankkeet") {
        const orgId = hankeToimija.get(r.rivi_id);
        if (orgId) {
          const tunnukset = orgTunnukset.get(orgId);
          if (tunnukset?.length) konteksti = { toimijaTunnukset: tunnukset };
        }
      }
      const tyyppi = tehokasLahdeTyyppi(dbTyyppi, r.lahde_url, konteksti);
      if (!VARM.has(tyyppi)) continue;

      const avain = `${r.taulu}:${r.rivi_id}:${r.kentta}`;
      const acc = kartta.get(avain) ?? {
        taulu: r.taulu,
        rivi_id: r.rivi_id,
        kentta: r.kentta,
        lahteet: [],
      };
      acc.lahteet.push({
        lahde_id: r.id,
        lahde_url: r.lahde_url,
        lahde_sivu: r.lahde_sivu,
        lainaus: r.lainaus,
        merkitty: r.merkitty as Merkinta,
        lahde_tyyppi: tyyppi,
      });
      kartta.set(avain, acc);
    }
    if (data.length < 1000) break;
  }

  const erotus = [...kartta.values()].filter(
    (k) => !k.lahteet.some((l) => l.merkitty === "ihmisen_vahvistama"),
  );

  // Arvot + otsikot tauluittain
  const rivit: ViranomaisVahvistusRivi[] = [];

  if (ryhma === "hankkeet") {
    const idt = [...new Set(erotus.map((e) => e.rivi_id))];
    const { data: hankkeet } = await sb
      .from("hankkeet")
      .select(
        "id, nimi, kaavatunnus, kortteli, vaihe, generaattorit_lkm, pinta_ala_ha, sahkonkaytto_twh_a, it_teho_mw, teho_mw",
      )
      .in("id", idt.length ? idt : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((hankkeet ?? []).map((h) => [h.id, h]));
    for (const e of erotus) {
      const h = byId.get(e.rivi_id);
      const raaka = h ? (h as Record<string, unknown>)[e.kentta] : null;
      rivit.push({
        avain: `${e.taulu}:${e.rivi_id}:${e.kentta}`,
        taulu: e.taulu,
        rivi_id: e.rivi_id,
        kentta: e.kentta,
        arvo: raaka == null ? null : String(raaka),
        hanke_id: e.rivi_id,
        hanke_nimi: h?.nimi ?? null,
        otsikko: h?.nimi ?? e.rivi_id,
        lahteet: e.lahteet,
      });
    }
  } else if (ryhma === "maaraajat") {
    const idt = [...new Set(erotus.map((e) => e.rivi_id))];
    const { data: maaraajat } = await sb
      .from("maaraajat")
      .select("id, hanke_id, tyyppi, alkaa_pvm, paattyy_pvm")
      .in("id", idt.length ? idt : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((maaraajat ?? []).map((m) => [m.id, m]));
    // Ryhmitä määräajan id:llä — näytä yksi rivi per määräaja (kaikki 3 kenttää)
    const maaraajaIdt = [...new Set(erotus.map((e) => e.rivi_id))];
    for (const mid of maaraajaIdt) {
      const m = byId.get(mid);
      const kentat = erotus.filter((e) => e.rivi_id === mid);
      const lahteetKartta = new Map<string, ViranomaisVahvistusLahde>();
      for (const k of kentat) {
        for (const l of k.lahteet) lahteetKartta.set(l.lahde_id, l);
      }
      rivit.push({
        avain: `maaraajat:${mid}`,
        taulu: "maaraajat",
        rivi_id: mid,
        kentta: "alkaa_pvm,paattyy_pvm,tyyppi",
        arvo: m
          ? `${m.tyyppi}: ${m.alkaa_pvm ?? "—"} → ${m.paattyy_pvm ?? "—"}`
          : null,
        hanke_id: m?.hanke_id ?? null,
        hanke_nimi: m?.hanke_id ? (hankeNimi.get(m.hanke_id) ?? null) : null,
        otsikko: m?.hanke_id
          ? (hankeNimi.get(m.hanke_id) ?? m.hanke_id)
          : mid,
        lahteet: [...lahteetKartta.values()],
      });
    }
  } else {
    const idt = [...new Set(erotus.map((e) => e.rivi_id))];
    const { data: paatokset } = await sb
      .from("paatokset")
      .select("id, hanke_id, pvm, kuvaus, paattava_organisaatio_id")
      .in("id", idt.length ? idt : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((paatokset ?? []).map((p) => [p.id, p]));
    for (const e of erotus) {
      const p = byId.get(e.rivi_id);
      const raaka = p ? (p as Record<string, unknown>)[e.kentta] : null;
      rivit.push({
        avain: `${e.taulu}:${e.rivi_id}:${e.kentta}`,
        taulu: e.taulu,
        rivi_id: e.rivi_id,
        kentta: e.kentta,
        arvo: raaka == null ? null : String(raaka),
        hanke_id: p?.hanke_id ?? null,
        hanke_nimi: p?.hanke_id ? (hankeNimi.get(p.hanke_id) ?? null) : null,
        otsikko: p
          ? `${p.pvm ?? "—"} · ${(p.kuvaus ?? "").slice(0, 80)}`
          : e.rivi_id,
        lahteet: e.lahteet,
      });
    }
  }

  rivit.sort((a, b) => {
    const n = (a.hanke_nimi ?? "").localeCompare(b.hanke_nimi ?? "", "fi");
    if (n !== 0) return n;
    return a.kentta.localeCompare(b.kentta, "fi");
  });
  return rivit;
}

/** Satunnainen otos ilman sivuvaikutuksia. */
export function satunnainenOtos<T>(rivit: T[], n: number, siemen: number): T[] {
  const kopio = [...rivit];
  let s = siemen >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = kopio.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [kopio[i], kopio[j]] = [kopio[j]!, kopio[i]!];
  }
  return kopio.slice(0, Math.min(n, kopio.length));
}
