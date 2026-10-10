/** Dynasty / oncloudos kokous-URL: emo-asiakirja ja liiteotsikot ilman mallia. */

const GENEERINEN_LIITE = /^suunnittelualueen rajaus\.?$/i;

/** Esim. `2026800-12-60434.PDF` → emopolku `/kokous/2026800-12.PDF`. */
export function oncloudosEmoKokousPolku(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("oncloudos.com")) return null;
    const tiedosto = decodeURIComponent(u.pathname.split("/").pop() ?? "");
    const m = /^(\d+-\d+)-\d+\.pdf$/i.exec(tiedosto);
    if (!m) return null;
    const kansio = u.pathname.replace(/\/[^/]+$/, "");
    return `${kansio}/${m[1]}.PDF`;
  } catch {
    return null;
  }
}

export function oncloudosEmoKokousUrl(url: string): string | null {
  const polku = oncloudosEmoKokousPolku(url);
  if (!polku) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${polku}`;
  } catch {
    return null;
  }
}

function lyhennaEmoKonteksti(emoOtsikko: string): string {
  const o = emoOtsikko.trim();
  const paragrafi = o.match(/§\s*\d+/);
  if (paragrafi) {
    const kh = o.match(/Kaupunginhallitus\s+[\d.]+\s*§\s*\d+/i);
    if (kh) return kh[0]!.replace(/\s+/g, " ");
    return `§ ${paragrafi[0]!.replace(/§\s*/, "")}`;
  }
  return o.length > 80 ? `${o.slice(0, 77)}…` : o;
}

/** Liite, kun PDF on kartta/skannattu (ei tekstiä) tai otsikko on geneerinen. */
export function ehdotaOncloudosLiiteOtsikko(
  nykyinenOtsikko: string,
  emoOtsikko: string,
  pdfTeksti?: string,
): string | null {
  const teksti = (pdfTeksti ?? "").trim();
  const nyky = nykyinenOtsikko.trim();
  const geneerinen =
    !nyky ||
    GENEERINEN_LIITE.test(nyky) ||
    (teksti.length > 0 && teksti.length < 80 && GENEERINEN_LIITE.test(teksti));
  const tyhjaPdf = teksti.length === 0;
  if (!geneerinen && !tyhjaPdf) return null;
  if (!emoOtsikko.trim()) return null;

  const liiteSana = GENEERINEN_LIITE.test(nyky)
    ? "Suunnittelualueen rajaus"
    : nyky || "Liite";

  const konteksti = lyhennaEmoKonteksti(emoOtsikko);
  return `Liite: ${liiteSana} (${konteksti})`;
}

const PDF_RIVI_HUONOT = [
  /^dynasty/i,
  /^caira consulting/i,
  /^\d+$/,
  /sivu\s+\d+/i,
  GENEERINEN_LIITE,
];

/** Ensimmäinen järkevä otsikkorivi tekstipohjaisesta PDF:stä. */
export function pdfOtsikkoEhdokasTekstista(teksti: string): string | null {
  const alku = teksti.slice(0, 8000);
  const rivit = alku
    .split(/(?<=[.!?])\s+|\n+/)
    .map((r) => r.trim())
    .filter(Boolean);

  for (const r of rivit.slice(0, 25)) {
    if (r.length < 15 || r.length > 200) continue;
    if (PDF_RIVI_HUONOT.some((re) => re.test(r))) continue;
    if (/^(pöytäkirja|esityslista|liite|päätös|päätösehdotus|kaavoitusaloite)/i.test(r)) {
      return r;
    }
    if (/kaavoitus|asemakaava|datakeskus|yva/i.test(r)) return r;
  }
  for (const r of rivit.slice(0, 12)) {
    if (r.length >= 20 && r.length <= 180 && !PDF_RIVI_HUONOT.some((re) => re.test(r))) {
      return r;
    }
  }
  return null;
}
