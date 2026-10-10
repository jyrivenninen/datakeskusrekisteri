/**
 * Analysoi varmistamattomat kentät, joiden ainoat lähteet ovat tehokkaalta tyypiltään muu.
 * Aja: npx tsx scripts/mittaa-muu-kentat.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import {
  ehdotaLahdeTyyppiUrlille,
  onKoostepalveluUrl,
  puraDomain,
  tehokasLahdeTyyppi,
} from "../src/lib/lahde-tyyppi-domain";
import { onKenttaVarmistettu, varmistamatonSyy } from "../src/lib/kentta-varmistus";

type LahdeRivi = {
  taulu: string;
  rivi_id: string;
  kentta: string;
  lahde_url: string;
  tekninen_lahde: boolean;
};

type KenttaData = {
  taulu: string;
  kentta: string;
  urlit: string[];
};

function kenttaAvain(r: Pick<LahdeRivi, "taulu" | "rivi_id" | "kentta">): string {
  return `${r.taulu}:${r.rivi_id}:${r.kentta}`;
}

function topN(laskuri: Map<string, number>, n: number) {
  return [...laskuri.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([avain, kpl]) => ({ avain, kpl }));
}

function analysoiAinoaMuu(kentat: KenttaData[]) {
  const domainKentat = new Map<string, number>();
  let koosteKenttia = 0;
  let ehdotuksetonKenttia = 0;
  let vainKooste = 0;
  let vainEhdotukseton = 0;
  let molemmat = 0;

  const kenttaNimi = new Map<string, number>();
  const koosteKenttaNimi = new Map<string, number>();

  for (const k of kentat) {
    const domainit = new Set<string>();
    let onKooste = false;
    let onEhdotukseton = false;

    for (const url of k.urlit) {
      const domain = puraDomain(url);
      if (domain) domainit.add(domain);
      if (onKoostepalveluUrl(url)) onKooste = true;
      if (ehdotaLahdeTyyppiUrlille(url) === null) onEhdotukseton = true;
    }

    for (const d of domainit) {
      domainKentat.set(d, (domainKentat.get(d) ?? 0) + 1);
    }

    if (onKooste) koosteKenttia += 1;
    if (onEhdotukseton) ehdotuksetonKenttia += 1;
    if (onKooste && onEhdotukseton) molemmat += 1;
    else if (onKooste) vainKooste += 1;
    else if (onEhdotukseton) vainEhdotukseton += 1;

    const nimiAvain = k.taulu === "hankkeet" ? k.kentta : `${k.taulu}.${k.kentta}`;
    kenttaNimi.set(nimiAvain, (kenttaNimi.get(nimiAvain) ?? 0) + 1);
    if (onKooste) {
      koosteKenttaNimi.set(nimiAvain, (koosteKenttaNimi.get(nimiAvain) ?? 0) + 1);
    }
  }

  return {
    kenttia_yhteensa: kentat.length,
    top_15_domainia: topN(domainKentat, 15),
    ryhmat: {
      vahintaan_yksi_kooste_lahde: koosteKenttia,
      vahintaan_yksi_ehdotukseton_lahde: ehdotuksetonKenttia,
      vain_kooste_ei_ehdotuksetonta: vainKooste,
      vain_ehdotukseton_ei_koostetta: vainEhdotukseton,
      seka_kooste_ja_ehdotukseton: molemmat,
    },
    top_15_kentta_nimea: topN(kenttaNimi, 15),
    kooste_risti_kentta_nimet: topN(koosteKenttaNimi, 15),
  };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const docTyypit = new Map<string, LahdeTyyppi>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb.from("dokumentit").select("url, lahde_tyyppi").range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const d of data) docTyypit.set(d.url, d.lahde_tyyppi as LahdeTyyppi);
    if (data.length < 1000) break;
  }

  const kenttaLahteet = new Map<
    string,
    { taulu: string; kentta: string; tyypit: LahdeTyyppi[]; urlit: string[] }
  >();

  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select("taulu, rivi_id, kentta, lahde_url, tekninen_lahde")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const rivi of data as LahdeRivi[]) {
      if (rivi.tekninen_lahde) continue;
      const avain = kenttaAvain(rivi);
      const dbTyyppi = docTyypit.get(rivi.lahde_url) ?? "muu";
      const tyyppi = tehokasLahdeTyyppi(dbTyyppi, rivi.lahde_url);
      const aiempi = kenttaLahteet.get(avain) ?? {
        taulu: rivi.taulu,
        kentta: rivi.kentta,
        tyypit: [] as LahdeTyyppi[],
        urlit: [] as string[],
      };
      aiempi.tyypit.push(tyyppi);
      aiempi.urlit.push(rivi.lahde_url);
      kenttaLahteet.set(avain, aiempi);
    }
    if (data.length < 1000) break;
  }

  const ainoaMuuKaikki: KenttaData[] = [];
  const ainoaMuuHankkeet: KenttaData[] = [];

  for (const [, k] of kenttaLahteet) {
    const lahteet = k.tyypit.map((lahde_tyyppi) => ({ lahde_tyyppi, tekninen_lahde: false }));
    if (onKenttaVarmistettu(lahteet)) continue;
    if (varmistamatonSyy(lahteet) !== "ainoa_muu") continue;
    const rivi: KenttaData = { taulu: k.taulu, kentta: k.kentta, urlit: [...new Set(k.urlit)] };
    ainoaMuuKaikki.push(rivi);
    if (k.taulu === "hankkeet") ainoaMuuHankkeet.push(rivi);
  }

  console.log(
    JSON.stringify(
      {
        huomio:
          "Tehokas lahde_tyyppi (DB muu + domain muistissa). Kentät joilla vain muu-lähteitä.",
        kaikki_taulut: analysoiAinoaMuu(ainoaMuuKaikki),
        taulu_hankkeet: analysoiAinoaMuu(ainoaMuuHankkeet),
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
