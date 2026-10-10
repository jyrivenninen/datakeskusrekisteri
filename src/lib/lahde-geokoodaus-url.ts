/** Geokoodaus- / osoitehaun rajapintapyyntö (menetelma), ei asiakirja. Polku ratkaisee. */
export function onGeokoodausTaiOsoitehakuPolku(polku: string): boolean {
  return /geocoding|servicemap|address/i.test(polku);
}

/** MML Pelias-geokoodaus (ei taustakartta/WFS). */
export function onMmlGeokoodausUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes("maanmittauslaitos.fi") && !host.includes("mml.fi")) return false;
    return u.pathname.toLowerCase().includes("/geocoding/");
  } catch {
    return false;
  }
}

export function onMenetelmaGeokoodausUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (onGeokoodausTaiOsoitehakuPolku(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

/** OpenStreetMap / Nominatim -haut (menetelmälähde, ei asiakirja). */
export function onOpenStreetMapMenetelmaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "nominatim.openstreetmap.org" || host.endsWith(".nominatim.openstreetmap.org")) {
      return true;
    }
    if (host === "openstreetmap.org" || host.endsWith(".openstreetmap.org")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Ei näytetä hankesivun Asiakirjat-listassa (lähde säilyy kenttätiedoissa). */
export function piilotaJulkinenAsiakirjaUrl(url: string): boolean {
  return (
    onMmlGeokoodausUrl(url) ||
    onMenetelmaGeokoodausUrl(url) ||
    onOpenStreetMapMenetelmaUrl(url)
  );
}
