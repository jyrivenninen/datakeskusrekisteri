/**
 * MML avoin geokoodaus (suora haku). Sama avain kuin kartassa.
 * https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search
 *
 * Odotettu kunta on pakollinen. Ensimmäistä osumaa ei hyväksytä ilman
 * kuntakoodi-/nimivertailua.
 */

const JUURI = "https://avoin-paikkatieto.maanmittauslaitos.fi";

type PeliasKohde = {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
};

type PeliasSivu = {
  features?: PeliasKohde[];
};

function mmlAvain(): string {
  const avain =
    process.env.MML_API_AVAIN?.trim() ||
    process.env.NEXT_PUBLIC_MML_API_AVAIN?.trim() ||
    "";
  if (!avain) {
    throw new Error(
      "MML_API_AVAIN tai NEXT_PUBLIC_MML_API_AVAIN tarvitaan geokoodaukseen.",
    );
  }
  return avain;
}

function basicAuth(avain: string): string {
  return `Basic ${Buffer.from(`${avain}:`, "utf8").toString("base64")}`;
}

export type GeokoodausOdotettuKunta = {
  nimi: string;
  /** kunnat.koodi, esim. "256" */
  koodi: string;
};

export type GeokoodausTulos = {
  lat: number;
  lon: number;
  /** Pysyvä viite alkuperäiseen geokoodauspyyntöön (ei avainta URL:ssa). */
  lahde_url: string;
  label: string | null;
  paikka_nimi: string | null;
  kunta_nimi: string | null;
  kunta_koodi: string | null;
  maakunta_nimi: string | null;
  paikka_tyyppi: string | null;
};

/** Tarkistaa onko arvo GeoJSON Polygon -objekti. */
export function onSijaintiAluePolygon(arvo: unknown): boolean {
  return (
    arvo != null &&
    typeof arvo === "object" &&
    !Array.isArray(arvo) &&
    (arvo as { type?: string }).type === "Polygon"
  );
}

export function normalisoiKuntaKoodi(koodi: string): string {
  const t = koodi.trim();
  const ilman = t.replace(/^0+/, "");
  return ilman || "0";
}

export function normalisoiKuntaVertailu(nimi: string): string {
  return nimi.trim().toLocaleLowerCase("fi");
}

function ominaisuusTeksti(
  p: Record<string, unknown>,
  avaimet: string[],
): string | null {
  for (const a of avaimet) {
    const v = p[a];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parsiKohde(kohde: PeliasKohde, lahde_url: string): GeokoodausTulos | null {
  const coords = kohde.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = (kohde.properties ?? {}) as Record<string, unknown>;
  const kunta_koodi =
    typeof p.municipality === "string" || typeof p.municipality === "number"
      ? String(p.municipality).trim()
      : null;
  return {
    lat,
    lon,
    lahde_url,
    label: ominaisuusTeksti(p, ["label"]),
    paikka_nimi: ominaisuusTeksti(p, ["label", "name"]),
    kunta_nimi: ominaisuusTeksti(p, ["label:municipality", "localadmin", "locality"]),
    kunta_koodi,
    maakunta_nimi: ominaisuusTeksti(p, ["label:region", "region"]),
    paikka_tyyppi: ominaisuusTeksti(p, [
      "label:placeType",
      "placeTypeDescription",
      "layer",
    ]),
  };
}

/** Onko geokoodausvastaus odotetun kunnan alueella (koodi tai nimi). */
export function geokoodausVastaaKuntaa(
  tulos: Pick<GeokoodausTulos, "kunta_koodi" | "kunta_nimi">,
  odotettu: GeokoodausOdotettuKunta,
): boolean {
  if (
    tulos.kunta_koodi &&
    normalisoiKuntaKoodi(tulos.kunta_koodi) ===
      normalisoiKuntaKoodi(odotettu.koodi)
  ) {
    return true;
  }
  if (
    tulos.kunta_nimi &&
    normalisoiKuntaVertailu(tulos.kunta_nimi) ===
      normalisoiKuntaVertailu(odotettu.nimi)
  ) {
    return true;
  }
  return false;
}

export function muotoileKoordinaatit(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)} ${ns}, ${Math.abs(lon).toFixed(4)} ${ew}`;
}

export function geokoodausLainaus(tulos: GeokoodausTulos, konteksti: string): string {
  const osat = [
    konteksti,
    tulos.paikka_nimi ? `paikka «${tulos.paikka_nimi}»` : null,
    tulos.kunta_nimi
      ? `kunta ${tulos.kunta_nimi}${tulos.kunta_koodi ? ` (${tulos.kunta_koodi})` : ""}`
      : tulos.kunta_koodi
        ? `kuntakoodi ${tulos.kunta_koodi}`
        : "kunta ei ilmennyt vastauksesta",
    tulos.maakunta_nimi ? `maakunta ${tulos.maakunta_nimi}` : null,
    tulos.paikka_tyyppi ? `tyyppi ${tulos.paikka_tyyppi}` : null,
    muotoileKoordinaatit(tulos.lat, tulos.lon),
  ].filter(Boolean);
  return osat.join("; ") + ".";
}

async function haePelias(
  hakusana: string,
  opts?: { layers?: string; size?: number },
): Promise<{ features: PeliasKohde[]; lahde_url: string }> {
  const avain = mmlAvain();
  const url = new URL(`${JUURI}/geocoding/v2/pelias/search`);
  url.searchParams.set("text", hakusana);
  url.searchParams.set("lang", "fi");
  url.searchParams.set("size", String(opts?.size ?? 5));
  if (opts?.layers) url.searchParams.set("layers", opts.layers);

  const vastaus = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(avain),
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!vastaus.ok) {
    throw new Error(`MML-geokoodaus epäonnistui (HTTP ${vastaus.status}).`);
  }

  const sivu = (await vastaus.json()) as PeliasSivu;
  const lahdeUrl = new URL(`${JUURI}/geocoding/v2/pelias/search`);
  lahdeUrl.searchParams.set("text", hakusana);
  lahdeUrl.searchParams.set("lang", "fi");
  lahdeUrl.searchParams.set("size", String(opts?.size ?? 5));
  if (opts?.layers) lahdeUrl.searchParams.set("layers", opts.layers);

  return { features: sivu.features ?? [], lahde_url: lahdeUrl.toString() };
}

function valitseOsuma(
  features: PeliasKohde[],
  lahde_url: string,
  odotettu: GeokoodausOdotettuKunta,
): GeokoodausTulos | null {
  const tulokset: GeokoodausTulos[] = [];
  for (const f of features) {
    const t = parsiKohde(f, lahde_url);
    if (t) tulokset.push(t);
  }
  if (tulokset.length === 0) return null;

  const kuntaTyyppi = tulokset.find(
    (t) =>
      geokoodausVastaaKuntaa(t, odotettu) &&
      /kunta/i.test(t.paikka_tyyppi ?? ""),
  );
  if (kuntaTyyppi) return kuntaTyyppi;

  const tasma = tulokset.find((t) => geokoodausVastaaKuntaa(t, odotettu));
  return tasma ?? null;
}

async function geokoodaaPelias(
  hakusana: string,
  opts: { layers?: string; odotettu: GeokoodausOdotettuKunta; size?: number },
): Promise<GeokoodausTulos> {
  const { features, lahde_url } = await haePelias(hakusana, {
    layers: opts.layers,
    size: opts.size ?? 5,
  });
  const osuma = valitseOsuma(features, lahde_url, opts.odotettu);
  if (!osuma) {
    throw new Error(
      `Geokoodaus «${hakusana}» ei palauttanut kuntaa ${opts.odotettu.nimi} (${opts.odotettu.koodi}).`,
    );
  }
  if (!geokoodausVastaaKuntaa(osuma, opts.odotettu)) {
    throw new Error(
      `Geokoodaus «${hakusana}» osui kuntaan ${osuma.kunta_nimi ?? "?"} (${osuma.kunta_koodi ?? "?"}), ei ${opts.odotettu.nimi} (${opts.odotettu.koodi}).`,
    );
  }
  return osuma;
}

/**
 * Geokoodaa osoiteteksti. Odotettu kunta on pakollinen — ensimmäistä
 * osumaa ei hyväksytä ilman kuntakoodi-/nimivertailua.
 */
export async function geokoodaaOsoite(
  teksti: string,
  odotettu: GeokoodausOdotettuKunta,
): Promise<GeokoodausTulos> {
  const hakusana = teksti.trim();
  if (hakusana.length < 3) {
    throw new Error("Geokoodattava osoite on liian lyhyt.");
  }
  if (!odotettu.nimi.trim() || !odotettu.koodi.trim()) {
    throw new Error("Geokoodaus vaatii odotetun kunnan nimen ja koodin.");
  }
  return geokoodaaPelias(hakusana, { odotettu, size: 5 });
}

/**
 * Kunnan keskustan arvioitu piste. Hakee «Nimi kunta» ja tarvittaessa nimen;
 * hyväksyy vain osuman, jonka kuntakoodi/nimi täsmää.
 */
export async function geokoodaaKuntakeskus(
  odotettu: GeokoodausOdotettuKunta,
): Promise<GeokoodausTulos> {
  const nimi = odotettu.nimi.trim();
  if (nimi.length < 2) {
    throw new Error("Kunnan nimi on liian lyhyt geokoodaukseen.");
  }
  const haut = [`${nimi} kunta`, nimi];
  let viimeinenVirhe: Error | null = null;
  for (const hakusana of haut) {
    try {
      return await geokoodaaPelias(hakusana, { odotettu, size: 5 });
    } catch (e) {
      viimeinenVirhe = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw (
    viimeinenVirhe ??
    new Error(`Kunnan ${nimi} (${odotettu.koodi}) keskipistettä ei saatu luotettavasti.`)
  );
}
