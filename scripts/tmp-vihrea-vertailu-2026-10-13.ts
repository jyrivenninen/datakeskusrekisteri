/**
 * Dry-run: vertaa vihreää valoa ennen/jälkeen 6a64eaa samalla DB:llä.
 * Ei kirjoita mitään.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { lataaSitovuusHaku } from "../src/lib/faktakentta-sitovuus-lataus";
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
};

function laskeKentittain(m: Map<string, number>) {
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const sitovuus = await lataaSitovuusHaku(sb);
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
  const { data: orgt } = await sb
    .from("organisaatiot")
    .select("id, verkko_osoite, verkkotunnus")
    .eq("julkaistu", true);
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
        "id, nimi, julkaistu, yhdistetty_kohde_id, toimija_organisaatio_id, sijainti_alue_tyyppi, sijainti_lat, sijainti_lon, sijainti_alue, vaihe, kunta, teho_mw, it_teho_mw, pinta_ala_ha, kaava_ala_ha, kaavatunnus, kortteli, sahkonkaytto_twh_a, generaattorit_lkm, yva_diaarinumero, huomautus, nimi",
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
        "taulu, rivi_id, kentta, lahde_url, lainaus, tekninen_lahde, luottamus, merkitty, tila",
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

  function arvoOn(h: (typeof hankkeet extends Map<string, infer V> ? V : never), kentta: string) {
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
      const tunnukset = toimija ? orgTunnukset.get(toimija) ?? [] : [];
      const dok = docTyypit.get(l.lahde_url) ?? "muu";
      const tyyppi = tehokasLahdeTyyppi(dok, l.lahde_url, {
        toimijaVerkkoTunnukset: tunnukset,
      });
      return {
        luottamus: l.luottamus,
        merkitty: l.merkitty,
        tila: l.tila,
        tekninen_lahde: l.tekninen_lahde,
        lahde_tyyppi: tyyppi,
        lahde_url: l.lahde_url,
        lainaus: l.lainaus,
      };
    });
  }

  const pre = new Map<string, number>();
  const post = new Map<string, number>();
  const ihminen = new Map<string, number>();
  const preIds = new Set<string>();
  const postIds = new Set<string>();
  const erot: Array<{ hanke: string; kentta: string; pre: string; post: string }> = [];

  let tarkastettu = 0;
  for (const h of hankkeet.values()) {
    if (!h.julkaistu) continue;
    for (const kentta of KENTAT) {
      if (!arvoOn(h, kentta)) continue;
      tarkastettu++;
      const ls = byKey.get(`${h.id}|${kentta}`) ?? [];
      const typed = lahteetTyypeilla(ls);
      const tilaPre = kentanTila(true, typed);
      const tilaPost =
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
      const tilaIhminen = typed.some(
        (l) =>
          l.merkitty === "ihmisen_vahvistama" &&
          l.tila !== "korvattu" &&
          l.tila !== "ei_tue" &&
          !l.tekninen_lahde,
      )
        ? "vahvistettu"
        : "vahvistamaton";

      if (tilaPre === "vahvistettu") {
        pre.set(kentta, (pre.get(kentta) ?? 0) + 1);
        preIds.add(`${h.id}|${kentta}`);
      }
      if (tilaPost === "vahvistettu") {
        post.set(kentta, (post.get(kentta) ?? 0) + 1);
        postIds.add(`${h.id}|${kentta}`);
      }
      if (tilaIhminen === "vahvistettu") {
        ihminen.set(kentta, (ihminen.get(kentta) ?? 0) + 1);
      }
      if (tilaPre !== tilaPost) {
        erot.push({
          hanke: h.nimi,
          kentta,
          pre: tilaPre,
          post: tilaPost,
        });
      }
    }
  }

  const sum = (m: Map<string, number>) =>
    [...m.values()].reduce((a, b) => a + b, 0);

  console.log(
    JSON.stringify(
      {
        tarkastettu,
        pre_6a64eaa_kentanTila_kaikille: {
          yht: sum(pre),
          kentittain: laskeKentittain(pre),
        },
        post_6a64eaa_sijaintiTiukka: {
          yht: sum(post),
          kentittain: laskeKentittain(post),
        },
        ihminen_ilman_tyyppia: {
          yht: sum(ihminen),
          kentittain: laskeKentittain(ihminen),
        },
        erot_pre_vs_post_lkm: erot.length,
        erot_esimerkit: erot.slice(0, 25),
        vain_pre: [...preIds].filter((k) => !postIds.has(k)).slice(0, 20),
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
