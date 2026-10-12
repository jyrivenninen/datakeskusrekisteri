/**
 * GLEIF julkinen API (api.gleif.org).
 * Käyttöehdot: LEI Data Terms of Use (CC0 LEI/LE-RD; ei vaikutelmaa GLEIF:n tuesta).
 * Rate limit: 60 pyyntöä/min — pidä viive pyyntöjen välillä.
 */

const USER_AGENT =
  "Datakeskusrekisteri/0.1 (+https://www.datakeskusrekisteri.fi/; gleif)";
const GLEIF_JUURI = "https://api.gleif.org/api/v1";
/** Pysyvä viittaus GLEIF-tietueeseen (ei hakutulossivua). */
export function gleifTietueUrl(lei: string): string {
  return `${GLEIF_JUURI}/lei-records/${encodeURIComponent(lei)}`;
}

const MIN_VALI_MS = 1100;

let viimePyynto = 0;

async function odotaVali(): Promise<void> {
  const kulunut = Date.now() - viimePyynto;
  if (kulunut < MIN_VALI_MS) {
    await new Promise((r) => setTimeout(r, MIN_VALI_MS - kulunut));
  }
  viimePyynto = Date.now();
}

export type GleifEhdokas = {
  lei: string;
  nimi: string;
  rekisterinumero: string | null;
  rekisteriviranomainen: string | null;
  maa: string | null;
  osoite: string | null;
  kaupunki: string | null;
  lei_tila: string | null;
  lei_paivitetty_pvm: string | null;
};

export type GleifEmo =
  | {
      tyyppi: "suhde";
      lei: string;
      nimi: string;
      rekisterinumero: string | null;
      rekisteriviranomainen: string | null;
      maa: string | null;
    }
  | {
      tyyppi: "poikkeus";
      syy: string;
    };

export type GleifTulos = GleifEhdokas & {
  lahde_url: string;
  suora_emo: GleifEmo | null;
  ylin_emo: GleifEmo | null;
};

type JsonApi = {
  data?: unknown;
  errors?: Array<{ status?: string; title?: string; detail?: string }>;
};

function merkkijono(arvo: unknown): string | null {
  if (typeof arvo === "string" && arvo.trim()) return arvo.trim();
  return null;
}

function ehdokasTietueesta(rivi: Record<string, unknown>): GleifEhdokas | null {
  const lei = merkkijono(rivi.id);
  if (!lei) return null;
  const attrs = (rivi.attributes ?? {}) as Record<string, unknown>;
  const entity = (attrs.entity ?? {}) as Record<string, unknown>;
  const registration = (attrs.registration ?? {}) as Record<string, unknown>;
  const legalName = (entity.legalName ?? {}) as Record<string, unknown>;
  const registeredAt = (entity.registeredAt ?? {}) as Record<string, unknown>;
  const legalAddress = (entity.legalAddress ?? {}) as Record<string, unknown>;
  const lines = Array.isArray(legalAddress.addressLines)
    ? (legalAddress.addressLines as unknown[])
        .map((x) => merkkijono(x))
        .filter((x): x is string => Boolean(x))
    : [];
  return {
    lei,
    nimi: merkkijono(legalName.name) ?? lei,
    rekisterinumero: merkkijono(entity.registeredAs),
    rekisteriviranomainen: merkkijono(registeredAt.id),
    maa: merkkijono(legalAddress.country) ?? merkkijono(entity.jurisdiction),
    osoite: lines.length > 0 ? lines.join(", ") : null,
    kaupunki: merkkijono(legalAddress.city),
    lei_tila: merkkijono(registration.status),
    lei_paivitetty_pvm: merkkijono(registration.lastUpdateDate),
  };
}

async function gleifGet(polkuJaKysely: string): Promise<{
  ok: boolean;
  status: number;
  json: JsonApi;
}> {
  await odotaVali();
  const vastaus = await fetch(`${GLEIF_JUURI}${polkuJaKysely}`, {
    headers: {
      Accept: "application/vnd.api+json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });
  const json = (await vastaus.json().catch(() => ({}))) as JsonApi;
  return { ok: vastaus.ok, status: vastaus.status, json };
}

/** Tarkka haku kansallisella rekisterinumerolla (Suomi: Y-tunnus väliviivalla). */
export async function haeGleifRekisterinumerolla(
  rekisterinumero: string,
): Promise<GleifEhdokas[]> {
  const nro = rekisterinumero.trim();
  if (!nro) return [];
  const q = new URLSearchParams();
  q.set("filter[entity.registeredAs]", nro);
  q.set("page[size]", "10");
  const { ok, json } = await gleifGet(`/lei-records?${q.toString()}`);
  if (!ok || !Array.isArray(json.data)) return [];
  return (json.data as Record<string, unknown>[])
    .map(ehdokasTietueesta)
    .filter((x): x is GleifEhdokas => Boolean(x));
}

/** Nimihaku — ehdokkaita, ihminen vahvistaa. */
export async function haeGleifNimella(nimi: string): Promise<GleifEhdokas[]> {
  const n = nimi.trim();
  if (!n) return [];
  const q = new URLSearchParams();
  q.set("filter[entity.legalName]", n);
  q.set("page[size]", "15");
  const { ok, json } = await gleifGet(`/lei-records?${q.toString()}`);
  if (!ok || !Array.isArray(json.data)) return [];
  return (json.data as Record<string, unknown>[])
    .map(ehdokasTietueesta)
    .filter((x): x is GleifEhdokas => Boolean(x));
}

async function haeEmoSuhde(
  lei: string,
  suhteelle: "direct-parent" | "ultimate-parent",
): Promise<GleifEmo | null> {
  const suhdePolku =
    suhteelle === "direct-parent"
      ? `/lei-records/${encodeURIComponent(lei)}/direct-parent-relationship`
      : `/lei-records/${encodeURIComponent(lei)}/ultimate-parent-relationship`;
  const suhde = await gleifGet(suhdePolku);
  if (suhde.ok && suhde.json.data && typeof suhde.json.data === "object") {
    const data = suhde.json.data as Record<string, unknown>;
    const attrs = (data.attributes ?? {}) as Record<string, unknown>;
    const relationship = (attrs.relationship ?? {}) as Record<string, unknown>;
    const endNode = (relationship.endNode ?? {}) as Record<string, unknown>;
    const emoLei = merkkijono(endNode.id);
    if (emoLei) {
      const emo = await gleifGet(`/lei-records/${encodeURIComponent(emoLei)}`);
      if (emo.ok && emo.json.data && typeof emo.json.data === "object") {
        const ehdokas = ehdokasTietueesta(emo.json.data as Record<string, unknown>);
        if (ehdokas) {
          return {
            tyyppi: "suhde",
            lei: ehdokas.lei,
            nimi: ehdokas.nimi,
            rekisterinumero: ehdokas.rekisterinumero,
            rekisteriviranomainen: ehdokas.rekisteriviranomainen,
            maa: ehdokas.maa,
          };
        }
      }
      return {
        tyyppi: "suhde",
        lei: emoLei,
        nimi: emoLei,
        rekisterinumero: null,
        rekisteriviranomainen: null,
        maa: null,
      };
    }
  }

  const exPolku =
    suhteelle === "direct-parent"
      ? `/lei-records/${encodeURIComponent(lei)}/direct-parent-reporting-exception`
      : `/lei-records/${encodeURIComponent(lei)}/ultimate-parent-reporting-exception`;
  const ex = await gleifGet(exPolku);
  if (ex.ok && ex.json.data && typeof ex.json.data === "object") {
    const data = ex.json.data as Record<string, unknown>;
    const attrs = (data.attributes ?? {}) as Record<string, unknown>;
    const syy = merkkijono(attrs.reason) ?? "UNKNOWN";
    return { tyyppi: "poikkeus", syy };
  }
  return null;
}

/** Hakee LEI-tietueen sekä suoran ja ylimmän emon (tai poikkeuksen). */
export async function haeGleifLeiTietue(lei: string): Promise<GleifTulos | null> {
  const id = lei.trim().toUpperCase();
  if (!/^[A-Z0-9]{20}$/.test(id)) return null;
  const { ok, json } = await gleifGet(`/lei-records/${encodeURIComponent(id)}`);
  if (!ok || !json.data || typeof json.data !== "object") return null;
  const ehdokas = ehdokasTietueesta(json.data as Record<string, unknown>);
  if (!ehdokas) return null;
  const suora_emo = await haeEmoSuhde(id, "direct-parent");
  const ylin_emo = await haeEmoSuhde(id, "ultimate-parent");
  return {
    ...ehdokas,
    lahde_url: gleifTietueUrl(id),
    suora_emo,
    ylin_emo,
  };
}
