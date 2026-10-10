/**
 * Tarkistaa ylläpidon käsin käsittelemät lähdemetatiedot (ei agentin bulk-muu-erää):
 * otsikko (URL/puutteet → HTML/PDF), lähdetyyppi vs domain-säännöt.
 *
 * Aja: npx tsx scripts/tarkista-kayttajan-lahdemetatiedot.ts [--kuiva] [--korjaa]
 */
import { createClient } from "@supabase/supabase-js";
import { haeHtmlOtsikko } from "../agents/lahde-html-otsikko";
import { noudaDokumenttiTeksti } from "../agents/dokumentti-teksti";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import {
  ehdotaHankkeenOmaToimijanPerusteella,
  rakennaYksilollisetToimijaTunnukset,
} from "../src/lib/hankkeen-oma-tunnistus";
import { oletusSitovuustaso, type LahdeTyyppi } from "../src/lib/lahde-metatiedot";
import { ehdotaLahdeTyyppiUrlille, onKoostepalveluUrl, puraDomain } from "../src/lib/lahde-tyyppi-domain";
import { onHelsinkiAvoinWfsUrl } from "../src/lib/lahde-geokoodaus-url";
import {
  ehdotaOncloudosLiiteOtsikko,
  oncloudosEmoKokousUrl,
  pdfOtsikkoEhdokasTekstista,
} from "../src/lib/oncloudos-otsikko";

const KASITTELIJA = "agentti:tarkista-kayttajan-lahdemetatiedot";
/** Ylläpidon käyttäjätunniste (kasittelijaMerkinta). */
const YLLAPITO_KAYTTAJA_ID = "33a8fa86-1c2c-431f-b483-b7eea4d5a967";

function kunnanUutisSivu(url: string): boolean {
  const host = puraDomain(url) ?? "";
  const polku = new URL(url).pathname.toLowerCase();
  const kuntaHostit = ["sievi.fi", "mikseimikkeli.fi", "tuusula.fi", "akaa.fi", "alajarvi.fi"];
  if (kuntaHostit.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  return polku.includes("/ajankohtaista/");
}

function puraHtmlEntiteetit(teksti: string): string {
  return teksti
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const HUONOT_OTSIKOT = [
  /^https?:\/\//i,
  /just a moment/i,
  /access denied/i,
  /internal server error/i,
  /^wfs\.ashx/i,
  /hyppää sisältöön/i,
  /^[\d\s-]+\.pdf$/i,
  /^[\da-f]{6,}\.pdf$/i,
  /\.(pdf|PDF|jpg|JPG|PNG|webp)(\s|$)/,
  /^google .+\.jpg$/i,
  /^ms .+\.jpg$/i,
];

function otsikkoEpaily(otsikko: string, url: string): boolean {
  const o = otsikko.trim();
  if (!o || o === url) return true;
  if (o.length < 5) return true;
  if (/\&#x|\&quot;|\&amp;/.test(o)) return true;
  return HUONOT_OTSIKOT.some((re) => re.test(o));
}

function pdfOtsikkoEhdokas(
  teksti: string,
  url: string,
  emoOtsikko?: string | null,
): string | null {
  const pdf = pdfOtsikkoEhdokasTekstista(teksti);
  if (pdf && !otsikkoEpaily(pdf, url)) return pdf;
  if (emoOtsikko) {
    const liite = ehdotaOncloudosLiiteOtsikko("", emoOtsikko, teksti);
    if (liite && !otsikkoEpaily(liite, url)) return liite;
  }
  try {
    const tiedosto = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "")
      .replace(/\.pdf$/i, "")
      .replace(/[-_]/g, " ")
      .trim();
    if (tiedosto.length >= 8 && tiedosto.length <= 120 && !/^\d+$/.test(tiedosto)) return tiedosto;
  } catch {
    /* */
  }
  return null;
}

type TyyppiTulos =
  | { ok: true }
  | { ok: false; syy: string; ehdotus: LahdeTyyppi | null; varma: boolean };

function arvioiTyyppi(
  url: string,
  nykyinen: LahdeTyyppi,
  yksilolliset: Map<string, string>,
): TyyppiTulos {
  const domain = ehdotaLahdeTyyppiUrlille(url);
  if (kunnanUutisSivu(url) && nykyinen === "viranomaisasiakirja") {
    return { ok: false, syy: "Kunnan uutis/ajankohtaista → muu, ei viranomaisasiakirja", ehdotus: "muu", varma: true };
  }
  if (onKoostepalveluUrl(url) && nykyinen === "viranomaisasiakirja") {
    return { ok: false, syy: "Koostepalvelu-URL → muu", ehdotus: "muu", varma: true };
  }
  if (nykyinen === "hankkeen_oma" && !ehdotaHankkeenOmaToimijanPerusteella(url, yksilolliset)) {
    return {
      ok: false,
      syy: "hankkeen_oma vaatii yksilöivän toimijadomainin",
      ehdotus: domain ?? "muu",
      varma: false,
    };
  }
  if (domain && domain !== nykyinen) {
    if (nykyinen === "muu") return { ok: true };
    const mediaVsViran = (domain === "media" && nykyinen === "viranomaisasiakirja") ||
      (domain === "viranomaisasiakirja" && nykyinen === "media");
    if (mediaVsViran) {
      return {
        ok: false,
        syy: `Domain-ehdotus ${domain}, tietokannassa ${nykyinen}`,
        ehdotus: domain,
        varma: false,
      };
    }
    if (["rekisteri", "menetelma", "media"].includes(domain) && nykyinen === "viranomaisasiakirja") {
      return { ok: false, syy: `Domain ${domain}, merkitty viranomaisasiakirja`, ehdotus: domain, varma: true };
    }
  }
  return { ok: true };
}

function otsikkoRakenteisestaRekisterista(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes("avoindata.prh.fi") && u.pathname.includes("/companies")) {
      const ytj = u.searchParams.get("businessId");
      if (ytj) return `YTJ avoin data: yritys ${ytj}`;
    }
    if (host.includes("maanmittauslaitos.fi") && u.pathname.includes("/geocoding/")) {
      const kohde = u.searchParams.get("text");
      if (kohde) return `MML geokoodaus: ${decodeURIComponent(kohde)}`;
    }
    if (host.includes("nominatim.openstreetmap.org")) {
      const kohde = u.searchParams.get("q");
      if (kohde) return `OpenStreetMap Nominatim: ${decodeURIComponent(kohde)}`;
    }
    if (host.includes("openstreetmap.org") && u.pathname.includes("/search")) {
      const kohde = u.searchParams.get("q");
      if (kohde) return `OpenStreetMap haku: ${decodeURIComponent(kohde)}`;
    }
    if (host.includes("fingrid.fi") && u.pathname.includes("/api")) {
      return `Fingrid rajapinta: ${u.pathname.split("/").filter(Boolean).slice(-2).join("/")}`;
    }
    if (u.pathname.includes("ktwebscr/fileshow")) {
      const kunta = host.split(".")[0]?.replace(/-julkaisu$/i, "") ?? host;
      const docid = u.searchParams.get("docid");
      const tyyppi = u.searchParams.get("doctype");
      if (docid) {
        return `${kunta}: dynastia-asiakirja ${docid}${tyyppi ? ` (tyyppi ${tyyppi})` : ""}`;
      }
    }
    if (host.includes("oncloudos.com") && u.pathname.includes("DREQUEST")) {
      const kunta = host.replace(/\d+$/, "").replace(".oncloudos.com", "");
      const id = u.searchParams.get("id");
      if (id) return `${kunta}: kokous/ilmoitus ${id}`;
    }
    if (onHelsinkiAvoinWfsUrl(url)) {
      const tyyppi = u.searchParams.get("typeNames") ?? u.searchParams.get("typeName") ?? "WFS";
      return `Helsingin avoin kartta-aineisto (${tyyppi})`;
    }
    if (host.includes("ymparisto.fi") && u.pathname.includes("/documents/")) {
      const tiedosto = decodeURIComponent(u.pathname.split("/").pop() ?? "")
        .replace(/\.pdf$/i, "")
        .replace(/_/g, " ");
      if (tiedosto.length >= 8) return tiedosto;
    }
    if (/\.(fi|com)$/i.test(host)) {
      const polku = decodeURIComponent(u.pathname);
      const viimeinen = polku.split("/").filter(Boolean).pop()?.replace(/\.html?$/i, "");
      if (viimeinen && viimeinen.length > 15) {
        return viimeinen.replace(/-/g, " ");
      }
      if (viimeinen && /^\d{5,}$/.test(viimeinen)) {
        const lehti = host.replace(/^www\./, "").split(".")[0] ?? host;
        return `${lehti}: uutinen ${viimeinen}`;
      }
    }
  } catch {
    /* */
  }
  return null;
}

async function ehdotaOtsikko(url: string, emoOtsikko?: string | null): Promise<string | null> {
  const rakenteinen = otsikkoRakenteisestaRekisterista(url);
  if (rakenteinen && !otsikkoEpaily(rakenteinen, url)) return rakenteinen;

  const onPdf = /\.pdf(\?|$)/i.test(url);
  if (onPdf) {
    try {
      const n = await noudaDokumenttiTeksti(url);
      const pdf = pdfOtsikkoEhdokas(n.teksti, url, emoOtsikko);
      if (pdf && !otsikkoEpaily(pdf, url)) return puraHtmlEntiteetit(pdf);
      if (emoOtsikko) {
        const liite = ehdotaOncloudosLiiteOtsikko("", emoOtsikko, n.teksti);
        if (liite && !otsikkoEpaily(liite, url)) return liite;
      }
    } catch {
      /* liian suuri tai estetty */
    }
    if (emoOtsikko) {
      const liite = ehdotaOncloudosLiiteOtsikko("", emoOtsikko, "");
      if (liite && !otsikkoEpaily(liite, url)) return liite;
    }
  }
  const html = await haeHtmlOtsikko(url);
  if (html && !otsikkoEpaily(html, url)) return puraHtmlEntiteetit(html);
  return null;
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const korjaa = process.argv.includes("--korjaa");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const humanDok = new Set<string>();
  for (let alku = 0; ; alku += 500) {
    const { data } = await sb
      .from("muutosehdotukset")
      .select("sisalto, kasittelija")
      .eq("tyyppi", "lahde_tyyppi_havainto")
      .eq("tila", "hyvaksytty")
      .range(alku, alku + 499);
    if (!data?.length) break;
    for (const r of data) {
      const k = r.kasittelija ?? "";
      if (k === YLLAPITO_KAYTTAJA_ID || (k && !/^(agentti|scripts|yllapito:selkeat)/.test(k))) {
        const id = (r.sisalto as { lahde_metatiedot?: { dokumentti_id?: string } })?.lahde_metatiedot
          ?.dokumentti_id;
        if (id) humanDok.add(id);
      }
    }
    if (data.length < 500) break;
  }

  const organisaatiot: Array<{ id: string; verkkotunnus: string | null; verkko_osoite: string | null }> = [];
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb.from("organisaatiot").select("id, verkkotunnus, verkko_osoite").range(alku, alku + 999);
    if (!data?.length) break;
    organisaatiot.push(...data);
    if (data.length < 1000) break;
  }
  const yksilolliset = rakennaYksilollisetToimijaTunnukset(organisaatiot);

  const dokumentit: Array<{
    id: string;
    url: string;
    otsikko: string;
    lahde_tyyppi: LahdeTyyppi;
    sitovuustaso: string;
  }> = [];
  for (let alku = 0; ; alku += 1000) {
    const { data } = await sb
      .from("dokumentit")
      .select("id, url, otsikko, lahde_tyyppi, sitovuustaso, lahde_metatiedot_kasitelty_pvm")
      .not("lahde_metatiedot_kasitelty_pvm", "is", null)
      .range(alku, alku + 999);
    if (!data?.length) break;
    for (const d of data) {
      if (d.lahde_tyyppi === "muu" && !humanDok.has(d.id)) continue;
      dokumentit.push(d as typeof dokumentit[0]);
    }
    if (data.length < 1000) break;
  }

  const otsikkoOngelmat: Array<{ url: string; nykyinen: string; ehdotus?: string; korjattu?: boolean }> = [];
  const tyyppiOngelmat: Array<{ url: string; nykyinen: LahdeTyyppi; syy: string; ehdotus: LahdeTyyppi | null; varma: boolean }> = [];
  const kysymykset: string[] = [];
  let korjattuOtsikko = 0;
  let korjattuTyyppi = 0;

  for (const d of dokumentit) {
    const nykyOtsikko = puraHtmlEntiteetit(d.otsikko.trim());
    const tyyppiArvio = arvioiTyyppi(d.url, d.lahde_tyyppi, yksilolliset);
    if (!tyyppiArvio.ok) {
      tyyppiOngelmat.push({
        url: d.url,
        nykyinen: d.lahde_tyyppi,
        syy: tyyppiArvio.syy,
        ehdotus: tyyppiArvio.ehdotus,
        varma: tyyppiArvio.varma,
      });
      if (korjaa && tyyppiArvio.varma && tyyppiArvio.ehdotus && tyyppiArvio.ehdotus !== d.lahde_tyyppi) {
        const uusi = tyyppiArvio.ehdotus;
        if (!kuiva) {
          const { error } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
            p_dokumentti_id: d.id,
            p_lahde_tyyppi: uusi,
            p_sitovuustaso: oletusSitovuustaso(uusi),
            p_otsikko: nykyOtsikko || d.otsikko,
            p_ehdotus_id: null,
            p_kasittelija: KASITTELIJA,
          });
          if (error) throw new Error(error.message);
        }
        korjattuTyyppi += 1;
      } else if (!tyyppiArvio.varma) {
        kysymykset.push(`${d.url}: ${tyyppiArvio.syy}`);
      }
    }

    const otsikkoTarkistus = otsikkoEpaily(nykyOtsikko, d.url);
    if (otsikkoTarkistus || nykyOtsikko !== d.otsikko) {
      let uusiOtsikko: string | null = null;
      if (otsikkoTarkistus) {
        let emoOtsikko: string | null = null;
        const emoUrl = oncloudosEmoKokousUrl(d.url);
        if (emoUrl) {
          const { data: emo } = await sb.from("dokumentit").select("otsikko").eq("url", emoUrl).maybeSingle();
          emoOtsikko = emo?.otsikko ?? null;
        }
        await new Promise((r) => setTimeout(r, 350));
        uusiOtsikko = await ehdotaOtsikko(d.url, emoOtsikko);
      }
      const korjattava = uusiOtsikko && !otsikkoEpaily(uusiOtsikko, d.url) ? uusiOtsikko : null;
      if (korjattava && korjaa && !kuiva) {
        const lahdeTyyppi =
          tyyppiArvio.ok || !tyyppiArvio.ehdotus ? d.lahde_tyyppi : tyyppiArvio.ehdotus;
        const sitovuus =
          lahdeTyyppi === d.lahde_tyyppi ? d.sitovuustaso : oletusSitovuustaso(lahdeTyyppi);
        const { error } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
          p_dokumentti_id: d.id,
          p_lahde_tyyppi: lahdeTyyppi,
          p_sitovuustaso: sitovuus,
          p_otsikko: korjattava,
          p_ehdotus_id: null,
          p_kasittelija: KASITTELIJA,
        });
        if (error) throw new Error(error.message);
        korjattuOtsikko += 1;
        otsikkoOngelmat.push({ url: d.url, nykyinen: d.otsikko, ehdotus: korjattava, korjattu: true });
      } else if (otsikkoTarkistus) {
        otsikkoOngelmat.push({
          url: d.url,
          nykyinen: d.otsikko,
          ehdotus: korjattava ?? undefined,
        });
        if (!korjattava) kysymykset.push(`Otsikkoa ei saatu: ${d.url} (nykyinen: "${d.otsikko.slice(0, 60)}")`);
      } else if (nykyOtsikko !== d.otsikko && korjaa && !kuiva) {
        const { error } = await sb.rpc("julkaise_dokumentti_lahde_metatiedot", {
          p_dokumentti_id: d.id,
          p_lahde_tyyppi: d.lahde_tyyppi,
          p_sitovuustaso: d.sitovuustaso,
          p_otsikko: nykyOtsikko,
          p_ehdotus_id: null,
          p_kasittelija: KASITTELIJA,
        });
        if (error) throw new Error(error.message);
        korjattuOtsikko += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        kuiva,
        korjaa,
        tarkistettu: dokumentit.length,
        human_ehdotus_dokumentteja: humanDok.size,
        otsikko_ongelmia: otsikkoOngelmat.length,
        tyyppi_ongelmia: tyyppiOngelmat.length,
        korjattu_otsikkoa: korjattuOtsikko,
        korjattu_tyyppia: korjattuTyyppi,
        tyyppi_raportti: tyyppiOngelmat.slice(0, 40),
        otsikko_raportti: otsikkoOngelmat.slice(0, 30),
        kysymykset: kysymykset.slice(0, 50),
        kysymyksia_yhteensa: kysymykset.length,
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
