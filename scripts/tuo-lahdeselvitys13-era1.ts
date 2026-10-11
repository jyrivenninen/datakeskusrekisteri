/**
 * Lähdeselvitys 13, erä 1: kenttien vahvistus.
 *
 * Aineisto: agents/data/lahdeselvitys13-era1-2026-10-12.json
 * Aja: npx tsx scripts/tuo-lahdeselvitys13-era1.ts [--kuiva]
 *
 * - sama + rekisterissä arvo → taydennys (lähteen lisäys, arvo = rekisterin)
 * - poikkeaa / rekisteri tyhjä / määräaika → korjaus tai maaraaja yksittäin
 * - Orimattila ~292 ha osayleiskaava ja Mäntsälä ~1,75 ha kiinteistö: pois
 * - toistaa-lista: ei viedä jonoon
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const TIEDOSTO = resolve(
  process.cwd(),
  "agents/data/lahdeselvitys13-era1-2026-10-12.json",
);
const TUN_SAMA = "lahdeselvitys13_era1_vahvistus";
const TUN_POIK = "lahdeselvitys13_era1_poikkeama";
const TUN_MAARA = "lahdeselvitys13_era1_maaraaja";

const HANKE_KENTAT = new Set([
  "kaavatunnus",
  "kortteli",
  "kaava_ala_ha",
  "pinta_ala_ha",
  "vaihe",
  "teho_mw",
]);

const NUMEERISET = new Set(["kaava_ala_ha", "pinta_ala_ha", "teho_mw"]);

type Havainto = {
  kentta: string;
  arvo: string;
  asiakirja_url: string;
  asiakirjan_nimi: string;
  sivu: string;
  lainaus: string;
  poikkeaa_rekisterista: boolean;
  huomio?: string;
};

type Kohde = {
  hanke_id: string;
  hanke_nimi: string;
  havainnot: Havainto[];
  toistaa?: Array<{
    asiakirja_url?: string;
    asiakirjan_nimi?: string;
    toistaa?: string;
    huomio?: string;
  }>;
};

type Aineisto = { kohteet: Kohde[] };

type HankeRivi = {
  id: string;
  nimi: string;
  kaavatunnus: string | null;
  kortteli: string | null;
  kaava_ala_ha: number | string | null;
  pinta_ala_ha: number | string | null;
  vaihe: string | null;
  teho_mw: number | string | null;
};

function parsiSivu(sivu: string): number | null {
  const t = sivu.trim();
  if (!t || /ei sivunumeroa|HTML/i.test(t)) return null;
  const m = t.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function onErityistapaus(hankeNimi: string, h: Havainto): string | null {
  if (
    /Orimattila/i.test(hankeNimi) &&
    h.kentta === "kaava_ala_ha" &&
    /292/.test(h.arvo)
  ) {
    return "Orimattila: noin 292 ha koskee osayleiskaavaa, ei A217";
  }
  if (
    /Mäntsälä|Mantsala/i.test(hankeNimi) &&
    h.kentta === "pinta_ala_ha" &&
    /1[,.]?\s*750|1\.75/.test(h.arvo)
  ) {
    return "Mäntsälä: noin 1,75 ha on eri kiinteistö kuin luvan kohde";
  }
  if (
    /Orimattila/i.test(hankeNimi) &&
    h.kentta === "maaraaika" &&
    /osayleiskaav/i.test(h.arvo + (h.huomio ?? ""))
  ) {
    return "Orimattila: osayleiskaavan määräaika, ei A217";
  }
  return null;
}

function rekisterinArvo(hanke: HankeRivi, kentta: string): string | null {
  const raaka = (hanke as Record<string, unknown>)[kentta];
  if (raaka == null || raaka === "") return null;
  if (typeof raaka === "number") {
    return Number.isInteger(raaka) ? String(raaka) : String(raaka);
  }
  return String(raaka);
}

function kenttaEhdotus(
  arvo: string,
  url: string,
  sivu: string,
  lainaus: string,
) {
  return {
    arvo,
    lahde_url: url,
    lahde_sivu: parsiSivu(sivu),
    lainaus: lainaus.trim() || null,
    luottamus: "epavarma" as const,
    lahde_laji: parsiSivu(sivu) == null ? ("html" as const) : ("dokumentti" as const),
  };
}

function maaraajaTyyppi(arvo: string): string | null {
  const t = arvo.toLowerCase();
  if (/valitus|oikaisu/.test(t)) return "valitusaika";
  if (/\boas\b/.test(t)) return "kaava_oas";
  if (/luonnos/.test(t)) return "kaava_luonnos";
  if (/ehdotus|nähtävillä|nahtavilla/.test(t)) return "kaavamuistutus";
  return null;
}

/** Poimii viimeisen päivämäärän päättymispäiväksi (ISO). */
function parsiPaattyy(arvo: string): string | null {
  const m = [
    ...arvo.matchAll(
      /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/g,
    ),
  ];
  if (m.length === 0) return null;
  const viimeinen = m[m.length - 1]!;
  const pp = viimeinen[1]!.padStart(2, "0");
  const kk = viimeinen[2]!.padStart(2, "0");
  const vvvv = viimeinen[3]!;
  return `${vvvv}-${kk}-${pp}`;
}

function parsiAlkaa(arvo: string): string | null {
  const m = arvo.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

async function haeNykyisetLahteet(
  sb: SupabaseClient,
  hankeId: string,
  kentta: string,
): Promise<Array<{ lahde_url: string; lainaus: string | null; luottamus: string }>> {
  const { data, error } = await sb
    .from("kentta_lahteet")
    .select("lahde_url, lainaus, luottamus, tila")
    .eq("taulu", "hankkeet")
    .eq("rivi_id", hankeId)
    .eq("kentta", kentta)
    .neq("tila", "korvattu");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    lahde_url: string;
    lainaus: string | null;
    luottamus: string;
  }>;
}

async function joJonossa(
  sb: SupabaseClient,
  tunniste: string,
  hankeId: string,
  lahdeUrl: string,
  kentta: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, sisalto")
    .eq("ehdottaja_tunniste", tunniste)
    .eq("tila", "odottaa")
    .eq("hanke_id", hankeId)
    .eq("lahde_url", lahdeUrl);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const s = r.sisalto as {
      kentat?: Record<string, unknown>;
      lahdeselvitys13?: { kentta?: string };
      maaraaja?: { tyyppi?: string };
    };
    if (s.lahdeselvitys13?.kentta === kentta) return true;
    if (s.kentat && kentta in s.kentat) return true;
    if (kentta === "maaraaika" && s.maaraaja) return true;
  }
  return false;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const aineisto = JSON.parse(readFileSync(TIEDOSTO, "utf8")) as Aineisto;
  const hankeIdt = aineisto.kohteet.map((k) => k.hanke_id);
  const { data: hankkeet, error: hVirhe } = await sb
    .from("hankkeet")
    .select(
      "id, nimi, kaavatunnus, kortteli, kaava_ala_ha, pinta_ala_ha, vaihe, teho_mw",
    )
    .in("id", hankeIdt);
  if (hVirhe) throw new Error(hVirhe.message);
  const hankeMap = new Map((hankkeet as HankeRivi[]).map((h) => [h.id, h]));

  let toistaaLkm = 0;
  for (const k of aineisto.kohteet) toistaaLkm += k.toistaa?.length ?? 0;

  const tilastot = {
    erityis: 0,
    sama_jonoon: 0,
    poik_jonoon: 0,
    maara_jonoon: 0,
    ohitettu_olemassa: 0,
    toistaa_pois: toistaaLkm,
  };

  console.log(`Toistavat asiakirjat (ei jonoon): ${toistaaLkm}`);
  console.log(
    "Suositus: jätetään pois — sama tieto on jo alkuperäisestä asiakirjasta.",
  );

  for (const kohde of aineisto.kohteet) {
    const hanke = hankeMap.get(kohde.hanke_id);
    if (!hanke) {
      console.warn(`Hanke puuttuu: ${kohde.hanke_nimi} ${kohde.hanke_id}`);
      continue;
    }

    for (const h of kohde.havainnot) {
      const erityis = onErityistapaus(kohde.hanke_nimi, h);
      if (erityis) {
        tilastot.erityis += 1;
        console.log(`[erityis pois] ${kohde.hanke_nimi} ${h.kentta}: ${erityis}`);
        continue;
      }

      if (h.kentta === "maaraaika") {
        const tyyppi = maaraajaTyyppi(h.arvo);
        const paattyy = parsiPaattyy(h.arvo);
        const tunniste = TUN_MAARA;
        if (await joJonossa(sb, tunniste, kohde.hanke_id, h.asiakirja_url, h.kentta)) {
          tilastot.ohitettu_olemassa += 1;
          continue;
        }
        const huomautus = [
          `LS13 määräaika: ${h.arvo}`,
          h.huomio?.trim() || null,
          h.poikkeaa_rekisterista ? "poikkeaa rekisteristä" : "ei poikkea (Grok)",
        ]
          .filter(Boolean)
          .join(" — ");

        if (!tyyppi || !paattyy) {
          // Yksittäinen korjaus ilman kenttäpäivitystä: vain vertailu ihmiselle
          const rivi = {
            tyyppi: "korjaus",
            hanke_id: kohde.hanke_id,
            ehdottaja_tyyppi: "agentti",
            ehdottaja_tunniste: TUN_POIK,
            lahde_url: h.asiakirja_url,
            huomautus,
            tila: "odottaa",
            sisalto: {
              kentat: {},
              lahdeselvitys13: {
                era: 1,
                osa: "maaraaika_tarkista",
                kentta: "maaraaika",
                rekisterin_arvo: null,
                asiakirjan_arvo: h.arvo,
                asiakirjan_nimi: h.asiakirjan_nimi,
                sivu: h.sivu,
                lainaus: h.lainaus,
                huomio: h.huomio ?? null,
                poikkeaa_rekisterista: h.poikkeaa_rekisterista,
              },
            },
          };
          tilastot.poik_jonoon += 1;
          if (kuiva) {
            console.log("[kuiva] maaraaika tarkista", kohde.hanke_nimi, h.arvo.slice(0, 60));
          } else {
            const { error } = await sb.from("muutosehdotukset").insert(rivi);
            if (error) throw new Error(error.message);
            console.log("jonoon maaraaika", kohde.hanke_nimi, h.arvo.slice(0, 50));
          }
          continue;
        }

        const alkaa = parsiAlkaa(h.arvo);
        const rivi = {
          tyyppi: "maaraaja",
          hanke_id: kohde.hanke_id,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: tunniste,
          lahde_url: h.asiakirja_url,
          huomautus,
          tila: "odottaa",
          sisalto: {
            kentat: {},
            maaraaja: {
              tyyppi,
              alkaa_pvm: alkaa,
              paattyy_pvm: paattyy,
              lahteet: [
                {
                  kentta: "paattyy_pvm",
                  lahde_url: h.asiakirja_url,
                  lahde_sivu: parsiSivu(h.sivu),
                  lahde_laji: parsiSivu(h.sivu) == null ? "html" : "dokumentti",
                  vahvistettu_pvm: new Date().toISOString().slice(0, 10),
                  luottamus: "epavarma",
                  lainaus: h.lainaus,
                  merkitty: "ihmisen_vahvistama",
                },
                {
                  kentta: "tyyppi",
                  lahde_url: h.asiakirja_url,
                  lahde_sivu: parsiSivu(h.sivu),
                  lahde_laji: parsiSivu(h.sivu) == null ? "html" : "dokumentti",
                  vahvistettu_pvm: new Date().toISOString().slice(0, 10),
                  luottamus: "epavarma",
                  lainaus: h.lainaus,
                  merkitty: "ihmisen_vahvistama",
                },
              ],
            },
            lahdeselvitys13: {
              era: 1,
              osa: "maaraaja",
              kentta: "maaraaika",
              asiakirjan_arvo: h.arvo,
              asiakirjan_nimi: h.asiakirjan_nimi,
              sivu: h.sivu,
              lainaus: h.lainaus,
              huomio: h.huomio ?? null,
            },
          },
        };
        tilastot.maara_jonoon += 1;
        if (kuiva) {
          console.log("[kuiva] maaraaja", kohde.hanke_nimi, tyyppi, paattyy);
        } else {
          const { error } = await sb.from("muutosehdotukset").insert(rivi);
          if (error) throw new Error(error.message);
          console.log("jonoon maaraaja", kohde.hanke_nimi, tyyppi, paattyy);
        }
        continue;
      }

      if (!HANKE_KENTAT.has(h.kentta)) {
        console.warn(`Tuntematon kenttä: ${h.kentta}`);
        continue;
      }

      const rek = rekisterinArvo(hanke, h.kentta);

      // Grok: ei poikkea + rekisterissä arvo → lähteen lisäys (erä TUN_SAMA)
      if (!h.poikkeaa_rekisterista && rek != null) {
        if (await joJonossa(sb, TUN_SAMA, kohde.hanke_id, h.asiakirja_url, h.kentta)) {
          tilastot.ohitettu_olemassa += 1;
          continue;
        }
        const rivi = {
          tyyppi: "taydennys",
          hanke_id: kohde.hanke_id,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: TUN_SAMA,
          lahde_url: h.asiakirja_url,
          huomautus: [
            `LS13 vahvistus: ${h.kentta} = ${rek}`,
            h.asiakirjan_nimi,
            h.huomio?.trim() || null,
          ]
            .filter(Boolean)
            .join(" — "),
          tila: "odottaa",
          sisalto: {
            kentat: {
              [h.kentta]: kenttaEhdotus(rek, h.asiakirja_url, h.sivu, h.lainaus),
            },
            lahdeselvitys13: {
              era: 1,
              osa: "vahvistus_sama",
              kentta: h.kentta,
              rekisterin_arvo: rek,
              asiakirjan_arvo: h.arvo,
              asiakirjan_nimi: h.asiakirjan_nimi,
              sivu: h.sivu,
              lainaus: h.lainaus,
              huomio: h.huomio ?? null,
            },
          },
        };
        tilastot.sama_jonoon += 1;
        if (kuiva) {
          console.log("[kuiva] sama", kohde.hanke_nimi, h.kentta, rek);
        } else {
          const { error } = await sb.from("muutosehdotukset").insert(rivi);
          if (error) throw new Error(error.message);
          console.log("jonoon sama", kohde.hanke_nimi, h.kentta);
        }
        continue;
      }

      // Poikkeama, tai Grok-sama mutta rekisteri tyhjä → yksittäin
      if (await joJonossa(sb, TUN_POIK, kohde.hanke_id, h.asiakirja_url, h.kentta)) {
        tilastot.ohitettu_olemassa += 1;
        continue;
      }
      const ehdotettuArvo = NUMEERISET.has(h.kentta)
        ? (() => {
            const m = String(h.arvo).replace(/\s/g, "").match(/(\d+[.,]?\d*)/);
            return m ? m[1]!.replace(",", ".") : h.arvo;
          })()
        : h.arvo;

      const osa =
        h.poikkeaa_rekisterista || rek != null
          ? "poikkeama"
          : "sama_mutta_rekisteri_tyhja";
      const nykyisetLahteet = await haeNykyisetLahteet(sb, kohde.hanke_id, h.kentta);

      const rivi = {
        tyyppi: "korjaus",
        hanke_id: kohde.hanke_id,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: TUN_POIK,
        lahde_url: h.asiakirja_url,
        huomautus: [
          osa === "poikkeama"
            ? `LS13 poikkeama: ${h.kentta}`
            : `LS13: Grok ei merkinnyt poikkeamaa, rekisteri tyhjä (${h.kentta})`,
          `rekisteri ${rek ?? "tyhjä"} ↔ asiakirja ${h.arvo}`,
          h.huomio?.trim() || null,
        ]
          .filter(Boolean)
          .join(" — "),
        tila: "odottaa",
        sisalto: {
          kentat: {
            [h.kentta]: kenttaEhdotus(
              ehdotettuArvo,
              h.asiakirja_url,
              h.sivu,
              h.lainaus,
            ),
          },
          lahdeselvitys13: {
            era: 1,
            osa,
            kentta: h.kentta,
            rekisterin_arvo: rek,
            rekisterin_lahteet: nykyisetLahteet,
            asiakirjan_arvo: h.arvo,
            asiakirjan_nimi: h.asiakirjan_nimi,
            sivu: h.sivu,
            lainaus: h.lainaus,
            huomio: h.huomio ?? null,
            poikkeaa_rekisterista: h.poikkeaa_rekisterista,
            ratkaisuvaihtoehdot: [
              "asiakirja vahvistaa nykyisen arvon eri sanamuodolla",
              "arvo korjataan asiakirjan mukaiseksi, vanha lähde korvatuksi",
              "lähteet tarkoittavat eri asiaa, molemmat jäävät",
              "lähteet ovat ristiriidassa, luottamus ristiriitaiseksi",
            ],
          },
        },
      };
      tilastot.poik_jonoon += 1;
      if (kuiva) {
        console.log(
          "[kuiva] poik",
          kohde.hanke_nimi,
          h.kentta,
          rek ?? "∅",
          "→",
          h.arvo.slice(0, 40),
        );
      } else {
        const { error } = await sb.from("muutosehdotukset").insert(rivi);
        if (error) throw new Error(error.message);
        console.log("jonoon poik", kohde.hanke_nimi, h.kentta);
      }
    }
  }

  console.log(JSON.stringify(tilastot, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
