/**
 * Raportoi viranomaislähde- ja valo-luvut (ei muuta dataa).
 * Aja: npx tsx scripts/tmp-raportoi-viranomais-luvut.ts
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
import { kentanTila } from "../src/lib/naytto";
import type { Luottamus, Merkinta } from "../src/lib/supabase/tietokanta";

const VARM = new Set<string>(VARMISTAVAT_LAHDE_TYYPIT);

type Lahde = KenttaLahdeTyyppiInfo & {
  merkitty: Merkinta;
  luottamus: Luottamus;
  tila: string | null;
};

type Kentta = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahteet: Lahde[];
};

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const sitovuusMerkittaa = await lataaSitovuusHaku(sb);

  const docTyypit = new Map<string, LahdeTyyppi>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await sb
      .from("dokumentit")
      .select("url, lahde_tyyppi")
      .range(a, a + 999);
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
  for (let a = 0; ; a += 1000) {
    const { data, error } = await sb
      .from("hankkeet")
      .select("id, toimija_organisaatio_id")
      .eq("julkaistu", true)
      .range(a, a + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const h of data) hankeToimija.set(h.id, h.toimija_organisaatio_id);
    if (data.length < 1000) break;
  }

  const kentat = new Map<string, Kentta>();
  for (let a = 0; ; a += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select(
        "taulu, rivi_id, kentta, lahde_url, tekninen_lahde, merkitty, tila, luottamus",
      )
      .range(a, a + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      if (r.tekninen_lahde || r.tila === "korvattu") continue;
      if (!sitovuusMerkittaa(r.taulu, r.kentta)) continue;
      const db = docTyypit.get(r.lahde_url) ?? "muu";
      let ctx: { toimijaTunnukset?: string[] } | undefined;
      if (r.taulu === "hankkeet") {
        const oid = hankeToimija.get(r.rivi_id);
        if (oid) {
          const t = orgTunnukset.get(oid);
          if (t?.length) ctx = { toimijaTunnukset: t };
        }
      }
      const tyyppi = tehokasLahdeTyyppi(db, r.lahde_url, ctx);
      const avain = `${r.taulu}:${r.rivi_id}:${r.kentta}`;
      const m = kentat.get(avain) ?? {
        taulu: r.taulu,
        rivi_id: r.rivi_id,
        kentta: r.kentta,
        lahteet: [] as Lahde[],
      };
      m.lahteet.push({
        lahde_tyyppi: tyyppi,
        merkitty: r.merkitty as Merkinta,
        luottamus: r.luottamus as Luottamus,
        tila: r.tila,
        tekninen_lahde: false,
      });
      kentat.set(avain, m);
    }
    if (data.length < 1000) break;
  }

  function rap(suodatin: (k: Kentta) => boolean) {
    const joukko = [...kentat.values()].filter(suodatin);
    let vir = 0;
    let virIh = 0;
    let varm = 0;
    let vihrea = 0;
    for (const k of joukko) {
      const onVir = k.lahteet.some((l) => VARM.has(l.lahde_tyyppi));
      if (onVir) {
        vir += 1;
        if (
          k.lahteet.some(
            (l) => VARM.has(l.lahde_tyyppi) && l.merkitty === "ihmisen_vahvistama",
          )
        ) {
          virIh += 1;
        }
      }
      if (onKenttaVarmistettu(k.lahteet)) varm += 1;
      if (kentanTila(true, k.lahteet) === "vahvistettu") vihrea += 1;
    }
    return {
      faktakenttia_lahteella: joukko.length,
      viranomaislahteella: vir,
      viranomais_ja_ihminen: virIh,
      onKenttaVarmistettu: varm,
      kentanTila_vihrea: vihrea,
    };
  }

  console.log(
    JSON.stringify(
      {
        hankkeet: rap((k) => k.taulu === "hankkeet"),
        kaikki_taulut: rap(() => true),
        erotus_ryhmittain: {
          maaraajat: [...kentat.values()].filter(
            (k) =>
              k.taulu === "maaraajat" &&
              k.lahteet.some((l) => VARM.has(l.lahde_tyyppi)) &&
              !k.lahteet.some(
                (l) =>
                  VARM.has(l.lahde_tyyppi) && l.merkitty === "ihmisen_vahvistama",
              ),
          ).length,
          hankkeet_kohdekentat: [...kentat.values()].filter(
            (k) =>
              k.taulu === "hankkeet" &&
              ["kaavatunnus", "kortteli", "vaihe", "generaattorit_lkm", "pinta_ala_ha"].includes(
                k.kentta,
              ) &&
              k.lahteet.some((l) => VARM.has(l.lahde_tyyppi)) &&
              !k.lahteet.some(
                (l) =>
                  VARM.has(l.lahde_tyyppi) && l.merkitty === "ihmisen_vahvistama",
              ),
          ).length,
          paatokset: [...kentat.values()].filter(
            (k) =>
              k.taulu === "paatokset" &&
              k.lahteet.some((l) => VARM.has(l.lahde_tyyppi)) &&
              !k.lahteet.some(
                (l) =>
                  VARM.has(l.lahde_tyyppi) && l.merkitty === "ihmisen_vahvistama",
              ),
          ).length,
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
