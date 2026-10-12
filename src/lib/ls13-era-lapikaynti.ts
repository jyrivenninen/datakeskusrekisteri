/**
 * LS13-eräkuittaukset (lahdeselvitys13_era1–3_vahvistus) läpikäyntiin.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  tarkistaArvoLainauksessa,
  type LainausTarkistusTulos,
} from "@/lib/lahde-lainaus-tarkistus";

export const LS13_ERA_TUNNISTEET = [
  "lahdeselvitys13_era1_vahvistus",
  "lahdeselvitys13_era2_vahvistus",
  "lahdeselvitys13_era3_vahvistus",
] as const;

export type Ls13EraRivi = {
  lahde_id: string;
  hanke_id: string;
  hanke_nimi: string;
  kentta: string;
  arvo: string | null;
  lainaus: string | null;
  lahde_sivu: number | null;
  lahde_url: string;
  ehdottaja_tunniste: string;
  ehdotus_id: string;
  kuittaustapa: string | null;
  eratunniste: string | null;
  kone_tarkistus: LainausTarkistusTulos;
};

/** Hakee LS13-eräkuittaukset. Vain ihmisen_vahvistama, ei vielä yksittäin uudelleenkuitattuja. */
export async function haeLs13EraKuittaukset(
  sb: SupabaseClient,
  opts?: { vainEraTaiTyhja?: boolean },
): Promise<Ls13EraRivi[]> {
  const vainEraTaiTyhja = opts?.vainEraTaiTyhja ?? true;

  const { data: ehdotukset, error: e1 } = await sb
    .from("muutosehdotukset")
    .select("id, ehdottaja_tunniste, hanke_id, lahde_url, sisalto")
    .in("ehdottaja_tunniste", [...LS13_ERA_TUNNISTEET])
    .eq("tila", "hyvaksytty");
  if (e1) throw new Error(e1.message);

  type EraOsuma = {
    ehdotus_id: string;
    ehdottaja_tunniste: string;
    hanke_id: string;
    lahde_url: string;
    kentta: string;
    ehdotus_arvo: string | null;
    ehdotus_lainaus: string | null;
  };
  const osumat: EraOsuma[] = [];
  for (const m of ehdotukset ?? []) {
    const kentat = (m.sisalto as { kentat?: Record<string, unknown> } | null)
      ?.kentat;
    if (!kentat || typeof kentat !== "object") continue;
    for (const [kentta, raw] of Object.entries(kentat)) {
      const obj =
        raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : {};
      osumat.push({
        ehdotus_id: m.id as string,
        ehdottaja_tunniste: m.ehdottaja_tunniste as string,
        hanke_id: m.hanke_id as string,
        lahde_url: m.lahde_url as string,
        kentta,
        ehdotus_arvo:
          typeof obj.arvo === "string"
            ? obj.arvo
            : obj.arvo != null
              ? String(obj.arvo)
              : null,
        ehdotus_lainaus:
          typeof obj.lainaus === "string"
            ? obj.lainaus
            : typeof obj.sitaatti === "string"
              ? obj.sitaatti
              : null,
      });
    }
  }

  if (osumat.length === 0) return [];

  const hankeIdt = [...new Set(osumat.map((o) => o.hanke_id))];
  const { data: hankkeet, error: e2 } = await sb
    .from("hankkeet")
    .select(
      "id, nimi, kaavatunnus, kortteli, vaihe, pinta_ala_ha, teho_mw, it_teho_mw, generaattorit_lkm, sahkonkaytto_twh_a",
    )
    .in("id", hankeIdt);
  if (e2) throw new Error(e2.message);
  const hankeKartta = new Map(
    (hankkeet ?? []).map((h) => [h.id as string, h]),
  );

  const { data: lahteet, error: e3 } = await sb
    .from("kentta_lahteet")
    .select(
      "id, rivi_id, kentta, lahde_url, lainaus, lahde_sivu, merkitty, kuittaustapa, eratunniste, tila",
    )
    .eq("taulu", "hankkeet")
    .eq("merkitty", "ihmisen_vahvistama")
    .in("rivi_id", hankeIdt);
  if (e3) throw new Error(e3.message);

  const lahdeAvain = (riviId: string, kentta: string, url: string) =>
    `${riviId}|${kentta}|${url}`;
  const lahdeKartta = new Map<
    string,
    {
      id: string;
      lainaus: string | null;
      lahde_sivu: number | null;
      kuittaustapa: string | null;
      eratunniste: string | null;
    }
  >();
  for (const kl of lahteet ?? []) {
    if (kl.tila === "korvattu" || kl.tila === "ei_tue") continue;
    if (
      vainEraTaiTyhja &&
      kl.kuittaustapa != null &&
      kl.kuittaustapa !== "era"
    ) {
      continue;
    }
    lahdeKartta.set(
      lahdeAvain(kl.rivi_id as string, kl.kentta as string, kl.lahde_url as string),
      {
        id: kl.id as string,
        lainaus: (kl.lainaus as string | null) ?? null,
        lahde_sivu: (kl.lahde_sivu as number | null) ?? null,
        kuittaustapa: (kl.kuittaustapa as string | null) ?? null,
        eratunniste: (kl.eratunniste as string | null) ?? null,
      },
    );
  }

  const rivit: Ls13EraRivi[] = [];
  const nahyty = new Set<string>();
  for (const o of osumat) {
    const kl = lahdeKartta.get(
      lahdeAvain(o.hanke_id, o.kentta, o.lahde_url),
    );
    if (!kl) continue;
    if (nahyty.has(kl.id)) continue;
    nahyty.add(kl.id);

    const h = hankeKartta.get(o.hanke_id);
    const hankeArvo = hankeKenttaArvo(h, o.kentta);
    const arvo = hankeArvo ?? o.ehdotus_arvo;
    const lainaus = kl.lainaus ?? o.ehdotus_lainaus;

    rivit.push({
      lahde_id: kl.id,
      hanke_id: o.hanke_id,
      hanke_nimi: (h?.nimi as string) ?? o.hanke_id,
      kentta: o.kentta,
      arvo,
      lainaus,
      lahde_sivu: kl.lahde_sivu,
      lahde_url: o.lahde_url,
      ehdottaja_tunniste: o.ehdottaja_tunniste,
      ehdotus_id: o.ehdotus_id,
      kuittaustapa: kl.kuittaustapa,
      eratunniste: kl.eratunniste,
      kone_tarkistus: tarkistaArvoLainauksessa(o.kentta, arvo, lainaus),
    });
  }

  /** 1) kone ei_tue, 2) vaihe, 3) loput — sitten nimi+kenttä. */
  rivit.sort((a, b) => {
    const ja = ls13EraJarjestysluokka(a);
    const jb = ls13EraJarjestysluokka(b);
    if (ja !== jb) return ja - jb;
    const n = a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
    if (n !== 0) return n;
    return a.kentta.localeCompare(b.kentta, "fi");
  });
  return rivit;
}

function ls13EraJarjestysluokka(r: Ls13EraRivi): number {
  if (r.kone_tarkistus.tulos === "ei_tue") return 0;
  if (r.kentta === "vaihe") return 1;
  return 2;
}

function hankeKenttaArvo(
  h: Record<string, unknown> | undefined,
  kentta: string,
): string | null {
  if (!h) return null;
  const v = h[kentta];
  if (v == null) return null;
  return String(v);
}

export function ls13EraKoneYhteenveto(rivit: Ls13EraRivi[]) {
  const koneelliset = rivit.filter((r) => r.kentta !== "vaihe");
  const eiTue = koneelliset.filter((r) => r.kone_tarkistus.tulos === "ei_tue");
  const ok = koneelliset.filter((r) => r.kone_tarkistus.tulos === "ok");
  const vaihe = rivit.filter((r) => r.kentta === "vaihe");
  return {
    yhteensa: rivit.length,
    koneelliset: koneelliset.length,
    ok: ok.length,
    ei_tue: eiTue.length,
    vaihe_ihminen: vaihe.length,
    ei_tue_rivit: eiTue,
  };
}
