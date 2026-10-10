/** HTML-sivun <title> ilman koko sivun tekstin purkua. */
const OLETUS_UA =
  "Datakeskusrekisteri/0.1 (+https://datakeskusrekisteri.vercel.app/; lahde-otsikko)";
const MAX_SIVU = 800_000;

function puhdistaOtsikko(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*[|\-–—]\s*Hyppää.*$/i, "")
    .replace(/\s*[|\-–—]\s*Skip to content.*$/i, "")
    .trim();
}

export async function haeHtmlOtsikko(url: string): Promise<string | null> {
  try {
    const vastaus = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": OLETUS_UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(20_000),
    });
    const pituus = Number(vastaus.headers.get("content-length") ?? "0");
    if (pituus > MAX_SIVU) return null;
    const html = await vastaus.text();
    if (html.length > MAX_SIVU) return null;
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m?.[1]) return null;
    const otsikko = puhdistaOtsikko(m[1].replace(/<[^>]+>/g, ""));
    return otsikko.length >= 5 && otsikko.length <= 200 ? otsikko : null;
  } catch {
    return null;
  }
}
