/**
 * Kuiva-ajo: liikennevalojen jakauma ennen ja jälkeen kentanTila-säännön muutosta.
 * Vahvistaa samalla varmistusprosentin (onKenttaVarmistettu, ei muutu).
 *
 * Aja: npx tsx scripts/kuiva-kentan-tila-viranomaisvalo.ts
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
import {
  onKenttaVarmistettu,
  VARMISTAVAT_LAHDE_TYYPIT,
  type KenttaLahdeTyyppiInfo,
} from "../src/lib/kentta-varmistus";
import type { Luottamus, Merkinta } from "../src/lib/supabase/tietokanta";

type LahdeRivi = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  tekninen_lahde: boolean;
  luottamus: Luottamus;
  merkitty: Merkinta;
  tila: string | null;
};

type KenttaMeta = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahteet: Array<{
    luottamus: Luottamus;
    merkitty: Merkinta;
    tila: string | null;
    lahde_tyyppi: LahdeTyyppi;
    tekninen_lahde: boolean;
  }>;
};

function vanhaTila(meta: KenttaMeta): "vihrea" | "keltainen" | "punainen" {
  const voimassa = meta.lahteet.filter(
    (l) => l.tila !== "korvattu" && !l.tekninen_lahde,
  );
  if (voimassa.length === 0) return "keltainen";
  if (voimassa.some((l) => l.luottamus === "ristiriitainen")) return "keltainen";
  if (voimassa.some((l) => l.merkitty === "ihmisen_vahvistama")) return "vihrea";
  return "keltainen";
}

function uusiTila(meta: KenttaMeta): "vihrea" | "keltainen" | "punainen" {
  const voimassa = meta.lahteet.filter(
    (l) => l.tila !== "korvattu" && !l.tekninen_lahde,
  );
  if (voimassa.length === 0) return "keltainen";
  if (voimassa.some((l) => l.luottamus === "ristiriitainen")) return "keltainen";
  const varm = VARMISTAVAT_LAHDE_TYYPIT as readonly string[];
  if (
    voimassa.some(
      (l) => l.merkitty === "ihmisen_vahvistama" && varm.includes(l.lahde_tyyppi),
    )
  ) {
    return "vihrea";
  }
  return "keltainen";
}

function jakauma(tilat: Array<"vihrea" | "keltainen" | "punainen">) {
  const j = { vihrea: 0, keltainen: 0, punainen: 0 };
  for (const t of tilat) j[t] += 1;
  return j;
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
        "taulu, rivi_id, kentta, lahde_url, tekninen_lahde, luottamus, merkitty, tila",
      )
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const rivi of data as LahdeRivi[]) {
      if (rivi.tekninen_lahde) continue;
      if (!sitovuusMerkittaa(rivi.taulu, rivi.kentta)) continue;

      const avain = `${rivi.taulu}:${rivi.rivi_id}:${rivi.kentta}`;
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
      const meta = kentatMap.get(avain) ?? {
        taulu: rivi.taulu,
        rivi_id: rivi.rivi_id,
        kentta: rivi.kentta,
        lahteet: [],
      };
      meta.lahteet.push({
        luottamus: rivi.luottamus,
        merkitty: rivi.merkitty,
        tila: rivi.tila,
        lahde_tyyppi: tyyppi,
        tekninen_lahde: false,
      });
      kentatMap.set(avain, meta);
    }
    if (data.length < 1000) break;
  }

  const kaikki = [...kentatMap.values()];
  // Arvo on (kentällä on lähde) → ei punaista tässä mittauksessa;
  // punainen = puuttuu arvo, jota ei näy kentta_lahteet-joukossa.
  const vanhat = kaikki.map(vanhaTila);
  const uudet = kaikki.map(uusiTila);

  const hankkeet = kaikki.filter((k) => k.taulu === "hankkeet");
  const vanhatH = hankkeet.map(vanhaTila);
  const uudetH = hankkeet.map(uusiTila);

  const vaihtuiVihreaKeltaiseksi = kaikki
    .filter((_, i) => vanhat[i] === "vihrea" && uudet[i] === "keltainen")
    .slice(0, 10)
    .map((k) => ({
      taulu: k.taulu,
      kentta: k.kentta,
      rivi_id: k.rivi_id,
      lahteet: k.lahteet.map((l) => ({
        tyyppi: l.lahde_tyyppi,
        merkitty: l.merkitty,
        luottamus: l.luottamus,
      })),
    }));

  // Varmistusprosentti (ei muutu tällä muutoksella)
  let faktakenttia = 0;
  let varmistettuja = 0;
  let faktakenttiaH = 0;
  let varmistettujaH = 0;
  for (const k of kaikki) {
    const info: KenttaLahdeTyyppiInfo[] = k.lahteet.map((l) => ({
      lahde_tyyppi: l.lahde_tyyppi,
      tekninen_lahde: false,
    }));
    faktakenttia += 1;
    if (onKenttaVarmistettu(info)) varmistettuja += 1;
    if (k.taulu === "hankkeet") {
      faktakenttiaH += 1;
      if (onKenttaVarmistettu(info)) varmistettujaH += 1;
    }
  }
  const pros = (osa: number, koko: number) =>
    koko === 0 ? 0 : Math.round((osa / koko) * 1000) / 10;

  console.log(
    JSON.stringify(
      {
        huomio:
          "Punainen = puuttuva arvo; tämä mittaus kattaa vain kentät joilla on lähde (sitovuus_merkittaa).",
        ennen: {
          hankkeet: jakauma(vanhatH),
          kaikki_taulut: jakauma(vanhat),
        },
        jalkeen: {
          hankkeet: jakauma(uudetH),
          kaikki_taulut: jakauma(uudet),
        },
        vaihtui_vihrea_keltainen_lkm: kaikki.filter(
          (_, i) => vanhat[i] === "vihrea" && uudet[i] === "keltainen",
        ).length,
        esimerkit_vihrea_keltainen: vaihtuiVihreaKeltaiseksi,
        varmistusprosentti_nyt: {
          huomio: "onKenttaVarmistettu (lähdetyyppi), ei liikennevalo — ei muutu.",
          hankkeet: {
            faktakenttia: faktakenttiaH,
            varmistettuja: varmistettujaH,
            prosentti: pros(varmistettujaH, faktakenttiaH),
          },
          kaikki_taulut: {
            faktakenttia,
            varmistettuja,
            prosentti: prosp(varmistettuja, faktakenttia),
          },
        },
      },
      null,
      2,
    ),
  );
}

function prosp(osa: number, koko: number) {
  return koko === 0 ? 0 : Math.round((osa / koko) * 1000) / 10;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
