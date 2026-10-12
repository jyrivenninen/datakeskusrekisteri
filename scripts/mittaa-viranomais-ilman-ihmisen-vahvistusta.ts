/**
 * Kentät, joilla on viranomaislähde (paatos/viranomaisasiakirja/rekisteri)
 * mutta ei yhtään ihmisen vahvistamaa viranomaislähdettä.
 * = ero varmistusprosentin ja vihreän valon välillä.
 *
 * Aja: npx tsx scripts/mittaa-viranomais-ilman-ihmisen-vahvistusta.ts
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
import { VARMISTAVAT_LAHDE_TYYPIT } from "../src/lib/kentta-varmistus";
import type { Merkinta } from "../src/lib/supabase/tietokanta";

type LahdeRivi = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  tekninen_lahde: boolean;
  merkitty: Merkinta;
  tila: string | null;
};

type ViranomaisLahde = {
  tyyppi: LahdeTyyppi;
  merkitty: Merkinta;
  url: string;
};

type KenttaMeta = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  viranomaiset: ViranomaisLahde[];
};

const VARM = new Set<string>(VARMISTAVAT_LAHDE_TYYPIT);

function koneellinenRekisteri(url: string): "ytj_prh" | "ryhti" | "mml" | null {
  const u = url.toLowerCase();
  if (
    u.includes("avoindata.prh.fi") ||
    u.includes("ytj.fi") ||
    u.includes("prh.fi/opendata")
  ) {
    return "ytj_prh";
  }
  if (
    u.includes("ryhti") ||
    u.includes("paikkatiedot.ymparisto.fi") ||
    u.includes("api.ymparisto.fi")
  ) {
    return "ryhti";
  }
  if (
    u.includes("maanmittauslaitos.fi") ||
    u.includes("mml.fi") ||
    u.includes("avoin-paikkatieto.maanmittauslaitos")
  ) {
    return "mml";
  }
  return null;
}

function lisaa(map: Map<string, number>, avain: string, n = 1) {
  map.set(avain, (map.get(avain) ?? 0) + n);
}

function jarjesta(map: Map<string, number>, n = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fi"))
    .slice(0, n)
    .map(([k, v]) => ({ nimi: k, lkm: v }));
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);

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
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("hankkeet")
      .select("id, toimija_organisaatio_id")
      .eq("julkaistu", true)
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const h of data) hankeToimija.set(h.id, h.toimija_organisaatio_id);
    if (data.length < 1000) break;
  }

  const kentatMap = new Map<string, KenttaMeta>();

  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select(
        "taulu, rivi_id, kentta, lahde_url, tekninen_lahde, merkitty, tila",
      )
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const rivi of data as LahdeRivi[]) {
      if (rivi.tekninen_lahde) continue;
      if (rivi.tila === "korvattu") continue;
      if (!sitovuusMerkittaa(rivi.taulu, rivi.kentta)) continue;

      const dbTyyppi = docTyypit.get(rivi.lahde_url) ?? "muu";
      let konteksti: { toimijaTunnukset?: string[] } | undefined;
      if (rivi.taulu === "hankkeet") {
        const orgId = hankeToimija.get(rivi.rivi_id);
        if (orgId) {
          const tunnukset = orgTunnukset.get(orgId);
          if (tunnukset?.length) konteksti = { toimijaTunnukset: tunnukset };
        }
      }
      const tyyppi = tehokasLahdeTyyppi(dbTyyppi, rivi.lahde_url, konteksti);
      if (!VARM.has(tyyppi)) continue;

      const avain = `${rivi.taulu}:${rivi.rivi_id}:${rivi.kentta}`;
      const meta = kentatMap.get(avain) ?? {
        taulu: rivi.taulu,
        rivi_id: rivi.rivi_id,
        kentta: rivi.kentta,
        viranomaiset: [],
      };
      meta.viranomaiset.push({
        tyyppi,
        merkitty: rivi.merkitty,
        url: rivi.lahde_url,
      });
      kentatMap.set(avain, meta);
    }
    if (data.length < 1000) break;
  }

  const kaikki = [...kentatMap.values()];
  const erotus = kaikki.filter(
    (k) => !k.viranomaiset.some((v) => v.merkitty === "ihmisen_vahvistama"),
  );

  function raportoi(joukko: KenttaMeta[], otsikko: string) {
    const tyyppi = new Map<string, number>();
    const merkkinta = new Map<string, number>();
    const kentta = new Map<string, number>();
    const koneRek = new Map<string, number>();
    const tyyppiMerk = new Map<string, number>();

    for (const k of joukko) {
      lisaa(kentta, `${k.taulu}.${k.kentta}`);
      // Kentän "edustava" viranomaislähde: ensisijaisesti koneen_ehdottama,
      // muuten ensimmäinen. Tyyppijako kaikista viranomaislähteistä
      // (kenttä voi olla monta).
      const merkit = new Set(k.viranomaiset.map((v) => v.merkitty));
      if (merkit.has("koneen_ehdottama") && !merkit.has("ihmisen_vahvistama")) {
        lisaa(merkkinta, "vain_koneen_ehdottama");
      } else if (![...merkit].every((m) => m === "koneen_ehdottama" || m === "ihmisen_vahvistama")) {
        lisaa(merkkinta, "muu_tai_sekamerkinta");
      } else {
        lisaa(merkkinta, [...merkit].sort().join("+") || "tyhja");
      }

      const tyypitKentalla = new Set(k.viranomaiset.map((v) => v.tyyppi));
      for (const t of tyypitKentalla) lisaa(tyyppi, t);

      // Päätyyppi (jos yksi tyyppi kentällä)
      if (tyypitKentalla.size === 1) {
        const [ainoa] = [...tyypitKentalla];
        const merkitStr = merkit.has("koneen_ehdottama")
          ? "koneen_ehdottama"
          : [...merkit].join("+");
        lisaa(tyyppiMerk, `${ainoa}|${merkitStr}`);
      } else {
        lisaa(tyyppiMerk, `useita_tyyppeja|${[...tyypitKentalla].sort().join("+")}`);
      }

      let koneellinen = false;
      for (const v of k.viranomaiset) {
        if (v.tyyppi !== "rekisteri") continue;
        const koodi = koneellinenRekisteri(v.url);
        if (koodi) {
          lisaa(koneRek, koodi);
          koneellinen = true;
        } else {
          lisaa(koneRek, "rekisteri_muu_url");
        }
      }
      if (tyypitKentalla.has("rekisteri") && !koneellinen) {
        // jo laskettu rekisteri_muu_url per lähde
      }
    }

    // Kenttätason koneellinen: montako erotuskenttää sisältää PRH/Ryhti/MML-URL:n
    const kenttaKone = { ytj_prh: 0, ryhti: 0, mml: 0, rekisteri_ilman_tunnistettua: 0 };
    for (const k of joukko) {
      const koodit = new Set<string>();
      let onRekisteri = false;
      for (const v of k.viranomaiset) {
        if (v.tyyppi !== "rekisteri") continue;
        onRekisteri = true;
        const koodi = koneellinenRekisteri(v.url);
        if (koodi) koodit.add(koodi);
      }
      if (koodit.has("ytj_prh")) kenttaKone.ytj_prh += 1;
      if (koodit.has("ryhti")) kenttaKone.ryhti += 1;
      if (koodit.has("mml")) kenttaKone.mml += 1;
      if (onRekisteri && koodit.size === 0) kenttaKone.rekisteri_ilman_tunnistettua += 1;
    }

    return {
      otsikko,
      lkm: joukko.length,
      lahde_tyyppi_kentilla: Object.fromEntries(
        [...tyyppi.entries()].sort((a, b) => b[1] - a[1]),
      ),
      merkkinta: Object.fromEntries(merkkinta),
      tyyppi_x_merkkinta: Object.fromEntries(
        [...tyyppiMerk.entries()].sort((a, b) => b[1] - a[1]),
      ),
      top10_kentat: jarjesta(kentta, 10),
      koneellinen_rekisteri_kentat: kenttaKone,
      koneellinen_rekisteri_lahteet: Object.fromEntries(
        [...koneRek.entries()].sort((a, b) => b[1] - a[1]),
      ),
    };
  }

  const hankkeet = erotus.filter((k) => k.taulu === "hankkeet");
  const varmistettuja = kaikki.length;
  const vihrea = kaikki.filter((k) =>
    k.viranomaiset.some((v) => v.merkitty === "ihmisen_vahvistama"),
  ).length;

  console.log(
    JSON.stringify(
      {
        huomio:
          "Erotus = sitovuus_merkittaa-kenttä, jolla ≥1 viranomaislähde, mutta ei yhtään ihmisen_vahvistama + viranomainen.",
        vertailu: {
          viranomaislahteella_kaikki: varmistettuja,
          vihrea_valo_viranomainen_ja_ihminen: vihrea,
          erotus: erotus.length,
          hankkeet_erotus: hankkeet.length,
          muut_taulut_erotus: erotus.length - hankkeet.length,
        },
        hankkeet: raportoi(hankkeet, "hankkeet"),
        kaikki_taulut: raportoi(erotus, "kaikki"),
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
