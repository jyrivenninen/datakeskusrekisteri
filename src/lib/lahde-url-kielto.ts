/**
 * Lähde-URL:t, joita ei saa käyttää missään syötössä (kehäpäätelmän esto).
 */

/** Koostepalvelut, jotka toistavat rekisterin sisältöä — laajenna tarpeen mukaan. */
const KOOSTE_KIELLETYT_HOSTIT: readonly string[] = [];

function normalisoiHost(url: string): string | null {
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostOnRekisteri(host: string): boolean {
  return host === "datakeskusrekisteri.fi" || host.endsWith(".datakeskusrekisteri.fi");
}

function hostOnKiellettyKooste(host: string): boolean {
  return KOOSTE_KIELLETYT_HOSTIT.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Palauttaa virheviestin suomeksi tai null jos URL kelpaa lähteeksi. */
export function lahdeUrlKieltoViesti(url: string): string | null {
  const host = normalisoiHost(url);
  if (!host) return null;
  if (hostOnRekisteri(host)) {
    return "Datakeskusrekisterin osoite ei kelpaa lähteeksi. Viittaa alkuperäiseen asiakirjaan tai sivustoon.";
  }
  if (hostOnKiellettyKooste(host)) {
    return "Tämän koostepalvelun osoite ei kelpaa lähteeksi. Viittaa alkuperäiseen lähteeseen.";
  }
  return null;
}

export function onKelpaamatonLahdeUrl(url: string): boolean {
  return lahdeUrlKieltoViesti(url) != null;
}

/** Kaikki URL:t ehdotuksen sisällöstä (kentät, kuva, päätös, yhteinen lähde). */
export function keraaEhdotuksenLahdeUrlit(sisalto: {
  kentat?: Record<string, { lahde_url?: string }>;
  kuvat?: Array<{ lahde_url?: string }>;
  paatos?: { lahteet?: Array<{ lahde_url?: string }> };
}): string[] {
  const urlit = new Set<string>();
  for (const k of Object.values(sisalto.kentat ?? {})) {
    const u = k.lahde_url?.trim();
    if (u) urlit.add(u);
  }
  for (const k of sisalto.kuvat ?? []) {
    const u = k.lahde_url?.trim();
    if (u) urlit.add(u);
  }
  for (const l of sisalto.paatos?.lahteet ?? []) {
    const u = l.lahde_url?.trim();
    if (u) urlit.add(u);
  }
  return [...urlit];
}

export function tarkistaEhdotuksenLahdeUrlit(sisalto: Parameters<typeof keraaEhdotuksenLahdeUrlit>[0]): string | null {
  for (const url of keraaEhdotuksenLahdeUrlit(sisalto)) {
    const viesti = lahdeUrlKieltoViesti(url);
    if (viesti) return viesti;
  }
  return null;
}
