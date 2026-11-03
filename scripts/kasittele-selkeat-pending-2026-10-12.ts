/**
 * Käsittelee jonosta selkeät pendingit.
 * Aja: npx tsx scripts/kasittele-selkeat-pending-2026-10-12.ts [--kuiva]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import {
  hyvaksyMuutosehdotus,
  hylkaaMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "ylläpito";

type Rivi = {
  id: string;
  tyyppi: string;
  ehdottaja_tunniste: string | null;
  hanke_id: string | null;
  huomautus: string | null;
  lahde_url: string | null;
  sisalto: EhdotusSisalto & {
    lahdeselvitys13?: {
      kentta?: string;
      rekisterin_arvo?: string | null;
      asiakirjan_arvo?: string | null;
      osa?: string;
      lainaus?: string | null;
    };
    maaraaja?: {
      tyyppi?: string;
      alkaa_pvm?: string | null;
      paattyy_pvm?: string | null;
      lahteet?: Array<{ lainaus?: string; kentta?: string }>;
    };
    dokumentti?: { merkkimaara?: number; otsikko?: string };
  };
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Parsii suomalaisen päivämäärävälin lainauksesta/huomautuksesta. */
function parsiPaivamaaraVali(
  teksti: string,
): { alkaa: string; paattyy: string } | null {
  const m = teksti.match(
    /(\d{1,2})\.(\d{1,2})\.?(?:(\d{4}))?\s*[–\-—]\s*(\d{1,2})\.(\d{1,2})\.?(\d{4})?/,
  );
  if (!m) return null;
  const d1 = Number(m[1]);
  const mo1 = Number(m[2]);
  const d2 = Number(m[4]);
  const mo2 = Number(m[5]);
  let y2 = m[6] ? Number(m[6]) : null;
  let y1 = m[3] ? Number(m[3]) : null;
  if (y2 == null && y1 == null) return null;
  if (y2 == null) y2 = y1;
  if (y1 == null) {
    // "10.12.2025 – 9.1.2026" tyyli: loppuvuosi annettu, alku voi olla edellinen
    y1 = mo1 > mo2 ? y2! - 1 : y2;
  }
  if (y1 == null || y2 == null) return null;
  return {
    alkaa: `${y1}-${pad2(mo1)}-${pad2(d1)}`,
    paattyy: `${y2}-${pad2(mo2)}-${pad2(d2)}`,
  };
}

async function paivitaSisalto(
  sb: SupabaseClient,
  id: string,
  sisalto: unknown,
) {
  const { error } = await sb
    .from("muutosehdotukset")
    .update({ sisalto })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("muutosehdotukset")
    .select(
      "id, tyyppi, ehdottaja_tunniste, hanke_id, huomautus, lahde_url, sisalto",
    )
    .eq("tila", "odottaa")
    .order("luotu_pvm");
  if (error) throw new Error(error.message);

  const rivit = (data ?? []) as Rivi[];
  const yhteenveto: Record<string, number> = {};
  const merkitse = (k: string) => {
    yhteenveto[k] = (yhteenveto[k] ?? 0) + 1;
  };

  const hyvaksy = async (r: Rivi, tag: string) => {
    if (kuiva) {
      console.log(`[kuiva] hyvaksy ${tag}`, r.huomautus?.slice(0, 90));
      merkitse(`kuiva_${tag}`);
      return;
    }
    await hyvaksyMuutosehdotus(r.id, KASITTELIJA);
    console.log(`✓ ${tag}`, r.huomautus?.slice(0, 90));
    merkitse(tag);
  };

  const hylkaa = async (r: Rivi, tag: string, syy: string) => {
    if (kuiva) {
      console.log(`[kuiva] hylkaa ${tag}`, syy.slice(0, 80));
      merkitse(`kuiva_hylkaa_${tag}`);
      return;
    }
    await hylkaaMuutosehdotus(r.id, KASITTELIJA, syy);
    console.log(`✗ ${tag}`, syy.slice(0, 90));
    merkitse(`hylkaa_${tag}`);
  };

  // --- 1. dokumentti_muuttunut: kuittaus ---
  for (const r of rivit.filter((x) => x.tyyppi === "dokumentti_muuttunut")) {
    try {
      await hyvaksy(r, "dokumentti_muuttunut");
    } catch (e) {
      console.error("virhe dokumentti", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 2. sijaintiperustelu-täydennykset ---
  for (const r of rivit.filter(
    (x) =>
      x.tyyppi === "taydennys" &&
      x.ehdottaja_tunniste === "grok_lahdeselvitys_2026-10-11" &&
      (x.sisalto as { huomio?: string }).huomio === "sijaintiperustelu",
  )) {
    try {
      await hyvaksy(r, "sijaintiperustelu");
    } catch (e) {
      console.error("virhe sijainti", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 3. Merijärvi ---
  for (const r of rivit.filter(
    (x) => x.ehdottaja_tunniste === "lahdeselvitys13_merijarvi",
  )) {
    try {
      if (r.tyyppi === "kentta_tyhjennys") {
        await hyvaksy(r, "merijarvi_teho_tyhjennys");
        continue;
      }
      if (r.sisalto.kentat?.pinta_ala_ha) {
        await hyvaksy(r, "merijarvi_pinta_ala");
        continue;
      }
      // Huomautus ilman kentat.huomautus → täydennä ja hyväksy
      if (r.sisalto.lahdeselvitys13?.osa === "merijarvi_huomautus") {
        const teksti =
          "Hankkeeseen liittyy energiavarastointilaitos (125 MW). Datakeskuksen tehoa ei merkitä tästä luvusta.";
        const sisalto = {
          ...r.sisalto,
          huomio: "hanke-huomautus",
          kentat: {
            huomautus: {
              arvo: teksti,
              lahde_url: r.lahde_url,
              lainaus:
                r.sisalto.lahdeselvitys13.lainaus ??
                "energiavarastointilaitoksen (125MW)",
              luottamus: "epavarma",
              lahde_laji: "dokumentti",
              merkitty: "ihmisen_vahvistama",
            },
          },
        };
        if (!kuiva) await paivitaSisalto(sb, r.id, sisalto);
        await hyvaksy(r, "merijarvi_huomautus");
        continue;
      }
      merkitse("merijarvi_ohitettu");
    } catch (e) {
      console.error("virhe merijarvi", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 4. Sipoo avoin (ei kenttämuutosta) ---
  for (const r of rivit.filter(
    (x) => x.ehdottaja_tunniste === "lahdeselvitys13_sipoo_avoin",
  )) {
    try {
      await hylkaa(
        r,
        "sipoo_avoin",
        "Ei kenttämuutosta — karttaliite merkitty tiedoksi (kuva-PDF).",
      );
    } catch (e) {
      console.error("virhe sipoo", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 5. Määräajat: korjaa päivämäärät tarvittaessa, hyväksy ---
  for (const r of rivit.filter((x) => x.tyyppi === "maaraaja")) {
    try {
      const m = r.sisalto.maaraaja;
      if (!m?.tyyppi || !m.paattyy_pvm) {
        merkitse("maaraaja_ohitettu_puutteellinen");
        continue;
      }
      // Ohita valitusaika ilman todellista määräaikaa (päätöspäivä = päättyminen)
      if (m.tyyppi === "valitusaika" && m.alkaa_pvm === m.paattyy_pvm) {
        await hylkaa(
          r,
          "maaraaja_valitusaika",
          "Valitusaika ilman laskettua päättymispäivää — ei kirjata erillisenä määräaikana.",
        );
        continue;
      }
      let alkaa = m.alkaa_pvm ?? null;
      let paattyy = m.paattyy_pvm;
      const teksti = [
        r.huomautus ?? "",
        ...(m.lahteet ?? []).map((l) => l.lainaus ?? ""),
      ].join(" ");
      const vali = parsiPaivamaaraVali(teksti);
      if (vali && (!alkaa || alkaa === paattyy || alkaa !== vali.alkaa)) {
        alkaa = vali.alkaa;
        paattyy = vali.paattyy;
        console.log(`  korjattu päivämäärät ${alkaa}–${paattyy}`);
      }
      // julkaise_maaraaja vaatii lähteen jokaiselle ei-null-päivämääräkentälle
      const pohjaLahde =
        (m.lahteet ?? []).find((l) => l.kentta === "paattyy_pvm") ??
        (m.lahteet ?? [])[0];
      if (!pohjaLahde) {
        merkitse("maaraaja_ohitettu_ei_lahdetta");
        continue;
      }
      const lahteet = [...(m.lahteet ?? [])];
      const onKentta = (k: string) => lahteet.some((l) => l.kentta === k);
      if (!onKentta("tyyppi")) {
        lahteet.push({ ...pohjaLahde, kentta: "tyyppi" });
      }
      if (alkaa && !onKentta("alkaa_pvm")) {
        lahteet.push({ ...pohjaLahde, kentta: "alkaa_pvm" });
      }
      if (!onKentta("paattyy_pvm")) {
        lahteet.push({ ...pohjaLahde, kentta: "paattyy_pvm" });
      }
      const sisalto = {
        ...r.sisalto,
        maaraaja: {
          ...m,
          alkaa_pvm: alkaa,
          paattyy_pvm: paattyy,
          lahteet,
        },
      };
      if (!kuiva) await paivitaSisalto(sb, r.id, sisalto);
      await hyvaksy(r, "maaraaja");
    } catch (e) {
      console.error("virhe maaraaja", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 6. LS13 poikkeama maaraaika ilman rakennetta → hylkää ---
  for (const r of rivit.filter(
    (x) =>
      x.tyyppi === "korjaus" &&
      x.ehdottaja_tunniste?.includes("poikkeama") &&
      x.sisalto.lahdeselvitys13?.kentta === "maaraaika" &&
      Object.keys(x.sisalto.kentat ?? {}).length === 0,
  )) {
    try {
      await hylkaa(
        r,
        "maaraaika_tarkista",
        "Määräaikaa ei saatu jäsennettyä automaattisesti — kirjataan tarvittaessa käsin.",
      );
    } catch (e) {
      console.error("virhe maaraaika", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 7. Selkeät kaavatunnus-päivitykset ---
  const KAAVATUNNUS_OK = new Set([
    "5d8b2b57-3f72-465a-a6d2-698fc7ff239d", // Magnora 2588 → 2642
    "62c64225-b257-40ca-972b-36ffbc50a3ff", // Nebius Kapuli → 188B
    "a12628d6-20fb-4b6f-abf7-a4d164595f13", // Neoen → K2819
  ]);
  for (const r of rivit.filter((x) => KAAVATUNNUS_OK.has(x.id))) {
    try {
      await hyvaksy(r, "kaavatunnus");
    } catch (e) {
      console.error("virhe kaavatunnus", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 8. Selkeät kortteli-täydennykset ---
  const KORTTELI_OK = new Set([
    "64e38ebc-f9d4-46b6-ac99-e1473072882e", // Orimattila +2518 (ensisijainen)
    "06e99239-b6fe-4e80-80db-d5999b4c1c7b", // Neoen 1,2,3
    "73f521b7-bd85-4a08-9cb0-a7dd1c3e2c1a", // Visulahti → 70
  ]);
  for (const r of rivit.filter((x) => KORTTELI_OK.has(x.id))) {
    try {
      await hyvaksy(r, "kortteli");
    } catch (e) {
      console.error("virhe kortteli", r.id, e);
      merkitse("virhe");
    }
  }
  // Orimattila duplikaatti + Ecogrid ei-numero
  for (const r of rivit.filter((x) =>
    [
      "42918a79-0c19-40df-8f9a-3504819dde40",
      "a4af27c4-53e4-411a-a457-2ddc107a9bf9",
    ].includes(x.id),
  )) {
    try {
      await hylkaa(
        r,
        "kortteli_hylatty",
        xIdSyy(r.id),
      );
    } catch (e) {
      console.error("virhe kortteli hylkaa", r.id, e);
      merkitse("virhe");
    }
  }

  // --- 9. kaava_ala_ha: yksi selkeä arvo / hanke ---
  const kaavaRivit = rivit.filter(
    (x) =>
      x.tyyppi === "korjaus" &&
      x.ehdottaja_tunniste?.includes("poikkeama") &&
      x.sisalto.lahdeselvitys13?.kentta === "kaava_ala_ha" &&
      x.sisalto.kentat?.kaava_ala_ha?.arvo != null &&
      (x.sisalto.lahdeselvitys13.rekisterin_arvo == null ||
        x.sisalto.lahdeselvitys13.rekisterin_arvo === ""),
  );
  const kaavaRyhmat = new Map<string, Rivi[]>();
  for (const r of kaavaRivit) {
    if (!r.hanke_id) continue;
    if (!kaavaRyhmat.has(r.hanke_id)) kaavaRyhmat.set(r.hanke_id, []);
    kaavaRyhmat.get(r.hanke_id)!.push(r);
  }
  for (const [, ryhmä] of kaavaRyhmat) {
    const arvot = [
      ...new Set(
        ryhmä.map((r) => String(r.sisalto.kentat!.kaava_ala_ha!.arvo)),
      ),
    ];
    if (arvot.length !== 1) {
      console.log(
        `kaava_ala ohitettu (ristiriitaiset arvot ${arvot.join("/")})`,
        ryhmä[0]?.huomautus?.slice(0, 60),
      );
      merkitse("kaava_ala_ohitettu_ristiriita");
      continue;
    }
    // Scale42 288 = voimassa oleva kaava, ei hankkeen kaava-ala → ohita
    if (ryhmä[0]!.huomautus?.includes("voimassa oleva asemakaava")) {
      merkitse("kaava_ala_ohitettu_voimassa");
      continue;
    }
    const [ensisijainen, ...loput] = ryhmä;
    try {
      await hyvaksy(ensisijainen!, "kaava_ala_taydennys");
      for (const d of loput) {
        await hylkaa(
          d,
          "kaava_ala_duplikaatti",
          "Sama kaava_ala_ha-arvo hyväksytty toisesta lähteestä.",
        );
      }
    } catch (e) {
      console.error("virhe kaava_ala", ensisijainen!.id, e);
      merkitse("virhe");
    }
  }

  const { count: jaljella } = await sb
    .from("muutosehdotukset")
    .select("id", { count: "exact", head: true })
    .in("tila", ["odottaa", "odottaa_kohdistusta"]);

  const { data: jaljellaRyhma } = await sb
    .from("muutosehdotukset")
    .select("ehdottaja_tunniste, tyyppi, tila")
    .in("tila", ["odottaa", "odottaa_kohdistusta"]);
  const jaot = new Map<string, number>();
  for (const r of jaljellaRyhma ?? []) {
    const k = `${r.ehdottaja_tunniste}|${r.tyyppi}|${r.tila}`;
    jaot.set(k, (jaot.get(k) ?? 0) + 1);
  }

  console.log("\n=== YHTEENVETO ===");
  console.log(JSON.stringify(yhteenveto, null, 2));
  console.log(`Jäljellä: ${jaljella}`);
  console.log(
    [...jaot.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n}\t${k}`)
      .join("\n"),
  );
}

function xIdSyy(id: string): string {
  if (id === "42918a79-0c19-40df-8f9a-3504819dde40") {
    return "Duplikaatti: kortteli 2516–2518 hyväksytty toisesta lähteestä.";
  }
  return "Asiakirjassa ei korttelinumeroa — ei kirjata.";
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
