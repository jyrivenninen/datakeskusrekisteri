/**
 * Prioriteettijono + regex-skannaus sähkönkäytölle (TWh/a). Raportti oletuksena.
 *
 * Aja:
 *   npx tsx scripts/sahkonkaytto-skannaus.ts
 *   npx tsx scripts/sahkonkaytto-skannaus.ts --json agents/data/sahkonkaytto-skannaus.json
 *   npx tsx scripts/sahkonkaytto-skannaus.ts --jonoon --tyhja-jono
 *   npx tsx scripts/sahkonkaytto-skannaus.ts --malli --max 10
 *
 * --jonoon: regex-löydöt → muutosehdotukset (taydennys, odottaa)
 * --tyhja-jono: ei osumaa → kentta_tarkistus-ehdotus (odottaa)
 * --malli: regex epäonnistui mutta energiasanoja → esikasittelijän mallikysely
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noudaDokumenttiTeksti } from "../agents/dokumentti-teksti";
import { poimiKentatDokumentista } from "../agents/esikasittelu/dokumentti";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  hankeTehoMw,
  jarjestaSahkonkayttoPrioriteetti,
  kuuluuSahkonkayttoAjonoon,
  type HankeSahkoPrioriteetti,
} from "../src/lib/sahkonkaytto-prioriteetti";
import {
  jarjestaDokumentitSahkoHakuun,
  poimiSahkonkayttoTekstista,
  poimiYmparistoPdfUrlit,
  tekstissaEnergiavihje,
  type SahkonkayttoOsuma,
} from "../src/lib/sahkonkaytto-poiminta";
import type { HankeVaihe } from "../src/lib/supabase/tietokanta";

const EHDOTTAJA = "scripts/sahkonkaytto-skannaus";
const UA =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; sahkonkaytto-skannaus)";

type TulosLuokka = "löytyi" | "ei_löydy" | "malliin" | "ohitettu";

type RaporttiRivi = {
  hanke_id: string;
  nimi: string;
  kunta: string;
  vaihe: string;
  teho_mw: number;
  tulos: TulosLuokka;
  twh_a?: number;
  luottamus?: string;
  lahde_url?: string;
  lainaus?: string;
  huomautus?: string;
};

function argLuku(nimi: string, oletus: number): number {
  const i = process.argv.indexOf(nimi);
  if (i === -1 || !process.argv[i + 1]) return oletus;
  const n = Number.parseInt(process.argv[i + 1]!, 10);
  return Number.isFinite(n) ? n : oletus;
}

function argPolku(nimi: string): string | null {
  const i = process.argv.indexOf(nimi);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1]!;
}

async function noudaHtml(url: string): Promise<string | null> {
  try {
    const v = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!v.ok) return null;
    const t = await v.text();
    return t.length <= 900_000 ? t : null;
  } catch {
    return null;
  }
}

function onPdf(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

function onYmparistoSivu(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("ymparisto.fi") && !onPdf(url);
  } catch {
    return false;
  }
}

async function skannaaUrl(url: string): Promise<{
  osuma: SahkonkayttoOsuma | null;
  energiavihje: boolean;
  lisapdf?: string[];
}> {
  if (onYmparistoSivu(url)) {
    const html = await noudaHtml(url);
    if (!html) return { osuma: null, energiavihje: false };
    const lisapdf = poimiYmparistoPdfUrlit(html);
    const teksti = html.replace(/<[^>]+>/g, " ");
    return {
      osuma: poimiSahkonkayttoTekstista(teksti),
      energiavihje: tekstissaEnergiavihje(teksti),
      lisapdf,
    };
  }

  if (onPdf(url)) {
    try {
      const n = await noudaDokumenttiTeksti(url);
      const osuma = poimiSahkonkayttoTekstista(n.teksti);
      return {
        osuma,
        energiavihje: tekstissaEnergiavihje(n.teksti),
      };
    } catch {
      return { osuma: null, energiavihje: false };
    }
  }

  const html = await noudaHtml(url);
  if (!html) return { osuma: null, energiavihje: false };
  const teksti = html.replace(/<[^>]+>/g, " ");
  return {
    osuma: poimiSahkonkayttoTekstista(teksti),
    energiavihje: tekstissaEnergiavihje(teksti),
  };
}

async function onkoOdottavaTaydennys(
  sb: SupabaseClient,
  hankeId: string,
): Promise<boolean> {
  const { count } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .eq("hanke_id", hankeId)
    .eq("tyyppi", "taydennys")
    .eq("tila", "odottaa")
    .ilike("huomautus", "%sahkonkaytto%");
  return (count ?? 0) > 0;
}

async function lisaaTaydennysJonoon(
  sb: SupabaseClient,
  hankeId: string,
  nimi: string,
  osuma: SahkonkayttoOsuma,
  lahdeUrl: string,
  kuiva: boolean,
): Promise<void> {
  if (await onkoOdottavaTaydennys(sb, hankeId)) {
    console.log(`  Jonossa jo: ${nimi}`);
    return;
  }
  const huomautus = `sahkonkaytto_twh_a: regex-skannaus (${osuma.twh_a} TWh/a)`;
  const sisalto = {
    kentat: {
      sahkonkaytto_twh_a: {
        arvo: String(osuma.twh_a),
        lahde_url: lahdeUrl,
        lahde_sivu: null,
        lainaus: osuma.lainaus,
        luottamus: "epavarma" as const /* skripti ei julkaise vahvistettuna */,
        lahde_laji: "dokumentti" as const,
      },
    },
  };
  if (kuiva) {
    console.log(`  [kuiva] taydennys ${nimi}: ${osuma.twh_a} TWh/a`);
    return;
  }
  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "taydennys",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: EHDOTTAJA,
    lahde_url: lahdeUrl,
    huomautus,
    tila: "odottaa",
    sisalto,
  });
  if (error) throw new Error(error.message);
  console.log(`  Jonoon: ${nimi} → ${osuma.twh_a} TWh/a`);
}

async function lisaaTyhjaTarkistusJonoon(
  sb: SupabaseClient,
  hankeId: string,
  nimi: string,
  kuiva: boolean,
): Promise<void> {
  const { count } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .eq("hanke_id", hankeId)
    .eq("tyyppi", "kentta_tarkistus")
    .eq("tila", "odottaa");
  if ((count ?? 0) > 0) return;

  const sisalto = {
    kentat: {},
    tarkistus: {
      taulu: "hankkeet" as const,
      rivi_id: hankeId,
      kentta: "sahkonkaytto_twh_a",
      tulos: "ei_julkista_lahdetta" as const,
      huomautus: "Regex-skannaus + linkitetyt asiakirjat: vuosikulutusta (TWh/GWh) ei löytynyt.",
    },
  };
  if (kuiva) {
    console.log(`  [kuiva] kentta_tarkistus ${nimi}`);
    return;
  }
  const { error } = await sb.from("muutosehdotukset").insert({
    tyyppi: "kentta_tarkistus",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "agentti",
    ehdottaja_tunniste: EHDOTTAJA,
    lahde_url: null,
    huomautus: "sahkonkaytto_twh_a: ei julkista lukua skannauksessa",
    tila: "odottaa",
    sisalto,
  });
  if (error) throw new Error(error.message);
  console.log(`  Tyhjäksi jonoon: ${nimi}`);
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const jonoon = process.argv.includes("--jonoon");
  const tyhjaJono = process.argv.includes("--tyhja-jono");
  const kaytaMallia = process.argv.includes("--malli");
  const uudelleen = process.argv.includes("--uudelleen");
  const maxHankkeet = argLuku("--max", 28);
  const maxDok = argLuku("--max-dok", 6);
  const malliKatto = argLuku("--malli-katto", 5);
  const jsonPolku = argPolku("--json");

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: hankkeet, error: hVirhe } = await sb
    .from("hankkeet")
    .select("id, nimi, kunta, vaihe, it_teho_mw, teho_mw, sahkonkaytto_twh_a")
    .eq("julkaistu", true);
  if (hVirhe) throw hVirhe;

  const tarkistetut = new Set<string>();
  for (let alku = 0; ; alku += 500) {
    const { data } = await sb
      .from("kentta_tarkistukset")
      .select("rivi_id")
      .eq("taulu", "hankkeet")
      .eq("kentta", "sahkonkaytto_twh_a")
      .range(alku, alku + 499);
    if (!data?.length) break;
    for (const r of data) tarkistetut.add(r.rivi_id as string);
    if (data.length < 500) break;
  }

  const veSahko = new Set<string>();
  const { data: veRivit } = await sb
    .from("hanke_vaihtoehdot")
    .select("hanke_id")
    .eq("julkaistu", true)
    .not("sahkonkaytto_twh_a", "is", null);
  for (const v of veRivit ?? []) veSahko.add(v.hanke_id as string);

  const dokMaara = new Map<string, number>();
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb
      .from("dokumentit")
      .select("hanke_id")
      .eq("julkaistu", true)
      .not("hanke_id", "is", null)
      .range(alku, alku + 999);
    if (!data?.length) break;
    for (const d of data) {
      const id = d.hanke_id as string;
      dokMaara.set(id, (dokMaara.get(id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }

  const prioriteetit: HankeSahkoPrioriteetti[] = [];
  for (const h of hankkeet ?? []) {
    const onTyhja = tarkistetut.has(h.id);
    const onVe = veSahko.has(h.id);
    if (!uudelleen && onTyhja) continue;
    if (
      !kuuluuSahkonkayttoAjonoon({
        sahkonkaytto_twh_a: h.sahkonkaytto_twh_a,
        it_teho_mw: h.it_teho_mw,
        teho_mw: h.teho_mw,
        onTyhjaTarkistus: onTyhja,
        onVeSahko: onVe,
      })
    ) {
      continue;
    }
    prioriteetit.push({
      id: h.id,
      nimi: h.nimi,
      kunta: h.kunta,
      vaihe: h.vaihe as HankeVaihe,
      it_teho_mw: h.it_teho_mw,
      teho_mw: h.teho_mw,
      tehoMw: hankeTehoMw(h.it_teho_mw, h.teho_mw),
      onTyhjaTarkistus: onTyhja,
      onVeSahko: onVe,
      dokumentteja: dokMaara.get(h.id) ?? 0,
    });
  }

  const jono = jarjestaSahkonkayttoPrioriteetti(prioriteetit).slice(0, maxHankkeet);
  console.log(
    `A-jono: ${prioriteetit.length} hanketta (käsitellään ${jono.length}). Kuiva=${kuiva} malli=${kaytaMallia}`,
  );

  const raportti: RaporttiRivi[] = [];
  let malliJaljella = malliKatto;

  for (const hanke of jono) {
    await new Promise((r) => setTimeout(r, 200));
    const { data: dokumentit } = await sb
      .from("dokumentit")
      .select("url, laji, otsikko")
      .eq("hanke_id", hanke.id)
      .eq("julkaistu", true);

    const jarjestetyt = jarjestaDokumentitSahkoHakuun(dokumentit ?? []);
    const urlJono = jarjestetyt.map((d) => d.url);
    const naytetyt = new Set<string>();

    let osuma: SahkonkayttoOsuma | null = null;
    let osumaUrl: string | null = null;
    let energiavihje = false;

    async function kokeileUrl(url: string) {
      if (naytetyt.has(url)) return;
      naytetyt.add(url);
      const tulos = await skannaaUrl(url);
      if (tulos.energiavihje) energiavihje = true;
      if (tulos.osuma && !osuma) {
        osuma = tulos.osuma;
        osumaUrl = url;
      }
      for (const pdf of tulos.lisapdf ?? []) {
        if (urlJono.includes(pdf) || naytetyt.has(pdf)) continue;
        urlJono.push(pdf);
      }
    }

    for (const url of urlJono.slice(0, maxDok + 4)) {
      if (osuma) break;
      await kokeileUrl(url);
      await new Promise((r) => setTimeout(r, 150));
    }

    let tulos: TulosLuokka;
    let huomautus: string | undefined;

    if (osuma && osumaUrl) {
      tulos = "löytyi";
      if (jonoon) {
        await lisaaTaydennysJonoon(sb, hanke.id, hanke.nimi, osuma, osumaUrl, kuiva);
      }
    } else if (kaytaMallia && energiavihje && malliJaljella > 0 && jarjestetyt.length > 0) {
      tulos = "malliin";
      huomautus = "Energiasanoja, regex ei varmaa osumaa";
      const paras = jarjestetyt[0]!;
      if (onPdf(paras.url)) {
        try {
          const n = await noudaDokumenttiTeksti(paras.url);
          if (n.merkkimaara > 100) {
            malliJaljella -= 1;
            const poimittu = await poimiKentatDokumentista(
              hanke.nimi,
              hanke.kunta,
              n.teksti,
              ["sahkonkaytto_twh_a"],
              paras.url,
            );
            const k = poimittu.sahkonkaytto_twh_a;
            if (k?.arvo) {
              const n2 = Number.parseFloat(k.arvo.replace(",", "."));
              if (Number.isFinite(n2) && n2 > 0) {
                const fake: SahkonkayttoOsuma = {
                  twh_a: n2 > 50 ? n2 / 1000 : n2,
                  lainaus: k.lainaus ?? "",
                  luottamus: "epavarma",
                  yksikko: "TWh",
                  raaka_luku: n2,
                };
                osuma = fake;
                osumaUrl = paras.url;
                tulos = "löytyi";
                huomautus = "Malli";
                if (jonoon) await lisaaTaydennysJonoon(sb, hanke.id, hanke.nimi, fake, paras.url, kuiva);
              }
            }
          }
        } catch {
          /* */
        }
      }
    } else if (energiavihje) {
      tulos = "malliin";
      huomautus = "Energiasanoja, ei regex-osumaa — kokeile --malli";
    } else {
      tulos = "ei_löydy";
      if (tyhjaJono) await lisaaTyhjaTarkistusJonoon(sb, hanke.id, hanke.nimi, kuiva);
    }

    const rivi: RaporttiRivi = {
      hanke_id: hanke.id,
      nimi: hanke.nimi,
      kunta: hanke.kunta,
      vaihe: hanke.vaihe,
      teho_mw: hanke.tehoMw,
      tulos,
      huomautus,
    };
    if (osuma && osumaUrl) {
      rivi.twh_a = osuma.twh_a;
      rivi.luottamus = osuma.luottamus;
      rivi.lahde_url = osumaUrl;
      rivi.lainaus = osuma.lainaus;
    }
    raportti.push(rivi);
    console.log(
      `${tulos.padEnd(9)} ${hanke.tehoMw.toString().padStart(7)} MW  ${hanke.nimi}${
        rivi.twh_a != null ? ` → ${rivi.twh_a} TWh/a` : ""
      }`,
    );
  }

  const yhteenveto = {
    kasitelty: raportti.length,
    löytyi: raportti.filter((r) => r.tulos === "löytyi").length,
    ei_löydy: raportti.filter((r) => r.tulos === "ei_löydy").length,
    malliin: raportti.filter((r) => r.tulos === "malliin").length,
    a_jono_koko: prioriteetit.length,
  };
  console.log("\nYhteenveto:", yhteenveto);

  const payload = { luotu: new Date().toISOString(), yhteenveto, rivit: raportti };
  const jsonOut = jsonPolku ?? `agents/data/sahkonkaytto-skannaus-${new Date().toISOString().slice(0, 10)}.json`;
  if (!kuiva || jsonPolku) {
    writeFileSync(jsonOut, JSON.stringify(payload, null, 2), "utf8");
    console.log("Raportti:", jsonOut);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
