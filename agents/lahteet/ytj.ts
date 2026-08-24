/**
 * 7A.5.2 PRH avoin data, YTJ-perustiedot. Ei kielimallia.
 *
 * Todennettu 24.8.2026: ei API-avainta, CC BY 4.0.
 * GET https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId={y-tunnus}
 * Tietueosoite on tämä kysely (yksittäistä /companies/{id} -polkua ei ole).
 *
 * Ei kata toiminimiä, kuntia eikä hyvinvointialueita. Ei sähköposteja eikä puhelimia.
 * Ei kirjoita organisaatiot- eikä hankkeet-tauluun.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { robotsSallii } from "../tarkistukset/robots";
import { lataaPaikallinenYmparisto } from "../ymparisto";

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; ytj)";
const SOVITIN = "ytj-prh";
const EHDOTTAJA = "agents/lahteet/ytj";
const JUURI = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
const Y_TUNNUS = /^[0-9]{7}-[0-9]$/;

type TietokantaAsiakas = SupabaseClient;

type YtjNimi = {
  name?: string;
  type?: string | number;
  endDate?: string | null;
};

type YtjToimiala = {
  type?: string;
  descriptions?: { languageCode?: string; description?: string }[];
};

type YtjOsoite = {
  type?: number;
  postOffices?: { city?: string; languageCode?: string }[];
};

type YtjYritys = {
  businessId?: { value?: string; registrationDate?: string };
  registrationDate?: string;
  names?: YtjNimi[];
  mainBusinessLine?: YtjToimiala;
  addresses?: YtjOsoite[];
  lastModified?: string;
};

type YtjSivu = {
  totalResults?: number;
  companies?: YtjYritys[];
};

function viiveMs(): number {
  const n = Number(process.env.YTJ_VIIVE_MS ?? "500");
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function odota(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo !== "string") return null;
  const t = arvo.trim();
  return t === "" ? null : t;
}

function tietueUrl(yTunnus: string): string {
  const u = new URL(JUURI);
  u.searchParams.set("businessId", yTunnus);
  return u.toString();
}

function jarjesta(arvo: unknown): unknown {
  if (Array.isArray(arvo)) return arvo.map(jarjesta);
  if (arvo && typeof arvo === "object") {
    const lahde = arvo as Record<string, unknown>;
    const tulos: Record<string, unknown> = {};
    for (const avain of Object.keys(lahde).sort()) {
      tulos[avain] = jarjesta(lahde[avain]);
    }
    return tulos;
  }
  return arvo;
}

function tiiviste(arvo: unknown): string {
  return createHash("sha256").update(JSON.stringify(jarjesta(arvo)), "utf8").digest("hex");
}

function vertaaNimi(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLocaleLowerCase("fi") ===
    b.replace(/\s+/g, " ").trim().toLocaleLowerCase("fi");
}

function nykyinenToiminimi(yritys: YtjYritys): string | null {
  const nykyiset = (yritys.names ?? []).filter(
    (n) => String(n.type) === "1" && !merkkijono(n.endDate),
  );
  return merkkijono(nykyiset[0]?.name);
}

function kuvausFi(descriptions: { languageCode?: string; description?: string }[] | undefined) {
  const fi = (descriptions ?? []).find((d) => d.languageCode === "1");
  return merkkijono(fi?.description) ?? merkkijono(descriptions?.[0]?.description);
}

function kotipaikka(yritys: YtjYritys): string | null {
  const osoite = (yritys.addresses ?? []).find((a) => a.type === 1);
  const fi = (osoite?.postOffices ?? []).find((p) => p.languageCode === "1");
  return merkkijono(fi?.city) ?? merkkijono(osoite?.postOffices?.[0]?.city);
}

async function haeJson(url: string): Promise<{ tila: number; runko: unknown; ms: number }> {
  const alku = Date.now();
  const vastaus = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const teksti = await vastaus.text();
  let runko: unknown = teksti;
  try {
    runko = JSON.parse(teksti) as unknown;
  } catch {
    runko = { raaka: teksti.slice(0, 200) };
  }
  return { tila: vastaus.status, runko, ms: Date.now() - alku };
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY tarvitaan. Älä liitä avainta chattiin.",
    );
  }
  const kuiva = process.env.YTJ_KUIVA === "1";
  const supabase: TietokantaAsiakas = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const juuri = new URL(JUURI);
  if (!(await robotsSallii(juuri, USER_AGENT))) {
    throw new Error("robots.txt estää YTJ-haun.");
  }

  const { data: organisaatiot, error: orgVirhe } = await supabase
    .from("organisaatiot")
    .select("id, nimi, y_tunnus")
    .eq("julkaistu", true)
    .not("y_tunnus", "is", null);
  if (orgVirhe) throw new Error(orgVirhe.message);

  const rivit = (organisaatiot ?? []).filter((o) => Y_TUNNUS.test(String(o.y_tunnus ?? "")));
  const katto = Number(process.env.YTJ_KATTO ?? "0");

  let ajoId: string | null = null;
  if (!kuiva) {
    const { data: ajo, error: ajoVirhe } = await supabase
      .from("lahdeajot")
      .insert({
        sovitin: SOVITIN,
        tila: "kaynnissa",
        kysely_url: JUURI,
      })
      .select("id")
      .single();
    if (ajoVirhe) throw new Error(ajoVirhe.message);
    ajoId = ajo.id as string;
  }

  const { data: odottavat } = await supabase
    .from("muutosehdotukset")
    .select("lahde_url")
    .eq("tyyppi", "ytj_havainto")
    .eq("tila", "odottaa");
  const jonossa = new Set(
    (odottavat ?? []).map((r) => r.lahde_url).filter((u): u is string => Boolean(u)),
  );

  let httpTila: number | null = null;
  let osumia = 0;
  let kirjattu = 0;
  let tarkistettu = 0;

  try {
    for (const org of rivit) {
      if (katto > 0 && tarkistettu >= katto) break;
      const yTunnus = String(org.y_tunnus);
      const tietue = tietueUrl(yTunnus);
      const tulos = await haeJson(tietue);
      httpTila = tulos.tila;
      tarkistettu += 1;
      console.log(`${tulos.tila} ${tulos.ms}ms ${yTunnus}`);
      if (tulos.tila >= 400) {
        console.error(`YTJ HTTP ${tulos.tila} (${yTunnus})`);
        await odota(viiveMs());
        continue;
      }
      const sivu = tulos.runko as YtjSivu;
      const yritys = (sivu.companies ?? [])[0] ?? null;
      if (yritys) osumia += 1;

      const ytjNimi = yritys ? nykyinenToiminimi(yritys) : null;
      const rekisterointi =
        merkkijono(yritys?.registrationDate) ??
        merkkijono(yritys?.businessId?.registrationDate);
      const toimiala = yritys ? kuvausFi(yritys.mainBusinessLine?.descriptions) : null;
      const paikka = yritys ? kotipaikka(yritys) : null;
      const tiivisteArvo = tiiviste(yritys ?? { ei_loydy: true, y_tunnus: yTunnus });

      const { data: vanha } = await supabase
        .from("rajapinta_tiivisteet")
        .select("tiiviste")
        .eq("sovitin", SOVITIN)
        .eq("tietue_url", tietue)
        .maybeSingle();
      const muuttunut = vanha != null && vanha.tiiviste !== tiivisteArvo;
      const uusiTiiviste = vanha == null;

      const havainnot: string[] = [];
      if (!yritys) {
        havainnot.push(
          `Y-tunnuksella ${yTunnus} ei löytynyt tietuetta PRH:n avoimesta YTJ-aineistosta. Aineisto ei kata toiminimiä, kuntia eikä hyvinvointialueita.`,
        );
      } else if (ytjNimi && !vertaaNimi(String(org.nimi), ytjNimi)) {
        havainnot.push(
          `Rekisterissä nimi on ${org.nimi}, YTJ:ssä toiminimi on ${ytjNimi}.`,
        );
      }
      if (muuttunut) {
        havainnot.push("YTJ-tietue muuttui edelliseen hakuun verrattuna.");
      }

      const ehdotusTarvitaan = havainnot.length > 0 && !jonossa.has(tietue);

      if (!kuiva && (uusiTiiviste || muuttunut)) {
        const { error: tiivisteVirhe } = await supabase.from("rajapinta_tiivisteet").upsert(
          {
            sovitin: SOVITIN,
            tietue_url: tietue,
            tiiviste: tiivisteArvo,
            tarkistettu_pvm: new Date().toISOString(),
          },
          { onConflict: "sovitin,tietue_url" },
        );
        if (tiivisteVirhe) throw new Error(tiivisteVirhe.message);
      }

      if (!kuiva && ehdotusTarvitaan) {
        const { error: lisaysVirhe } = await supabase.from("muutosehdotukset").insert({
          tyyppi: "ytj_havainto",
          hanke_id: null,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: tietue,
          huomautus: havainnot.join(" "),
          tila: "odottaa",
          sisalto: {
            kentat: {},
            ytj: {
              organisaatio_id: org.id,
              y_tunnus: yTunnus,
              rekisterin_nimi: org.nimi,
              ytj_nimi: ytjNimi,
              rekisterointi_pvm: rekisterointi,
              toimiala,
              kotipaikka: paikka,
              muuttunut,
              ei_loydy: yritys == null,
            },
          },
        });
        if (lisaysVirhe) throw new Error(lisaysVirhe.message);
        jonossa.add(tietue);
        kirjattu += 1;
      } else if (kuiva && ehdotusTarvitaan) {
        kirjattu += 1;
        console.log(`kuiva: ${havainnot.join(" ")}`);
      }

      await odota(viiveMs());
    }

    if (ajoId) {
      const { error } = await supabase
        .from("lahdeajot")
        .update({
          tila: "valmis",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia,
        })
        .eq("id", ajoId);
      if (error) throw new Error(error.message);
    }
    console.log(
      `Valmis. Tarkistettu ${tarkistettu}, YTJ-osumat ${osumia}, kirjattavia ${kirjattu}${kuiva ? " (kuiva-ajo)" : ""}.`,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "YTJ-ajo epäonnistui.";
    if (ajoId) {
      await supabase
        .from("lahdeajot")
        .update({
          tila: "epaonnistui",
          paattyi_pvm: new Date().toISOString(),
          http_tila: httpTila,
          osumia,
          virhe: viesti,
        })
        .eq("id", ajoId);
    }
    throw syy;
  }
}

main().catch((syy) => {
  console.error(syy instanceof Error ? syy.message : syy);
  process.exit(1);
});
