/**
 * Kuinka monessa sitovuus_merkittaa-kentässä liikennevalo on vihreä
 * (ihmisen_vahvistama) mutta ei ole yhtään lähdettä tyyppiä
 * paatos / viranomaisasiakirja / rekisteri.
 *
 * Aja: npx tsx scripts/mittaa-vihrea-ilman-viranomaislahdetta.ts
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
  type KenttaLahdeTyyppiInfo,
} from "../src/lib/kentta-varmistus";
import { kentanTila } from "../src/lib/naytto";
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
  lahteetTila: Array<{
    luottamus: Luottamus;
    merkitty: Merkinta;
    tila: string | null;
  }>;
  lahteetTyyppi: KenttaLahdeTyyppiInfo[];
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
        lahteetTila: [],
        lahteetTyyppi: [],
      };
      meta.lahteetTila.push({
        luottamus: rivi.luottamus,
        merkitty: rivi.merkitty,
        tila: rivi.tila,
      });
      meta.lahteetTyyppi.push({ lahde_tyyppi: tyyppi, tekninen_lahde: false });
      kentatMap.set(avain, meta);
    }
    if (data.length < 1000) break;
  }

  const vihreatIlmanViranomaista: KenttaMeta[] = [];
  for (const meta of kentatMap.values()) {
    const tila = kentanTila(true, meta.lahteetTila);
    if (tila !== "vahvistettu") continue;
    if (onKenttaVarmistettu(meta.lahteetTyyppi)) continue;
    vihreatIlmanViranomaista.push(meta);
  }

  const hankkeet = vihreatIlmanViranomaista.filter((k) => k.taulu === "hankkeet");
  const kenttaLkm = new Map<string, number>();
  for (const k of vihreatIlmanViranomaista) {
    const avain = `${k.taulu}.${k.kentta}`;
    kenttaLkm.set(avain, (kenttaLkm.get(avain) ?? 0) + 1);
  }
  const tyypillisimmat = [...kenttaLkm.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([kentta, n]) => ({ kentta, n }));

  console.log(
    JSON.stringify(
      {
        huomio:
          "Vihreä = kentanTila vahvistettu (ihmisen_vahvistama). Ilman viranomaista = ei paatos/viranomaisasiakirja/rekisteri (tehokas lahde_tyyppi).",
        hankkeet_taulu: hankkeet.length,
        kaikki_taulut: vihreatIlmanViranomaista.length,
        tyypillisimmat_kentat: tyypillisimmat,
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
