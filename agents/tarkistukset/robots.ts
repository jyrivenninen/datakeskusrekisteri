/** robots.txt -jäsentäjä. Vain HEAD/GET-tarkistukseen, ei mallia. */

const UA_NIMI = "Datakeskusrekisteri";

type Saannot = { disallow: string[]; allow: string[] };

const cache = new Map<string, Saannot | null>();

function valitseLohko(teksti: string): Saannot {
  const rivit = teksti.split(/\r?\n/);
  const lohkot: { agentit: string[]; saannot: Saannot }[] = [];
  let nykyinen: { agentit: string[]; saannot: Saannot } | null = null;

  for (const raaka of rivit) {
    const rivi = raaka.replace(/#.*$/, "").trim();
    if (!rivi) continue;
    const kaksoispiste = rivi.indexOf(":");
    if (kaksoispiste < 0) continue;
    const avain = rivi.slice(0, kaksoispiste).trim().toLowerCase();
    const arvo = rivi.slice(kaksoispiste + 1).trim();
    if (avain === "user-agent") {
      const saannotKaytetty =
        nykyinen != null &&
        nykyinen.saannot.disallow.length + nykyinen.saannot.allow.length > 0;
      if (nykyinen == null || saannotKaytetty) {
        nykyinen = { agentit: [], saannot: { disallow: [], allow: [] } };
        lohkot.push(nykyinen);
      }
      nykyinen.agentit.push(arvo.toLowerCase());
    } else if (avain === "disallow" && nykyinen) {
      nykyinen.saannot.disallow.push(arvo);
    } else if (avain === "allow" && nykyinen) {
      nykyinen.saannot.allow.push(arvo);
    }
  }

  const sopiva =
    lohkot.find((l) => l.agentit.some((a) => a === UA_NIMI.toLowerCase() || a.startsWith("datakeskusrekisteri"))) ??
    lohkot.find((l) => l.agentit.some((a) => a === "*"));
  return sopiva?.saannot ?? { disallow: [], allow: [] };
}

function polkuSopii(malli: string, polku: string): boolean {
  if (malli === "") return false;
  if (malli === "/") return true;
  return polku.startsWith(malli);
}

export async function robotsSallii(osoite: URL, userAgent: string): Promise<boolean> {
  const juuri = `${osoite.protocol}//${osoite.host}`;
  if (!cache.has(juuri)) {
    try {
      const vastaus = await fetch(`${juuri}/robots.txt`, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(10_000),
      });
      const tyyppi = vastaus.headers.get("content-type") ?? "";
      const teksti = vastaus.ok ? await vastaus.text() : "";
      // paikkatiedot.ymparisto.fi ohjaa robots.txt:n HTML-sivulle.
      if (!vastaus.ok || tyyppi.includes("html") || teksti.trimStart().startsWith("<")) {
        cache.set(juuri, { disallow: [], allow: [] });
      } else {
        cache.set(juuri, valitseLohko(teksti));
      }
    } catch {
      cache.set(juuri, { disallow: [], allow: [] });
    }
  }
  const saannot = cache.get(juuri);
  if (!saannot) return true;
  const polku = osoite.pathname || "/";
  const pisinAllow = saannot.allow
    .filter((m) => polkuSopii(m, polku))
    .sort((a, b) => b.length - a.length)[0];
  const pisinDisallow = saannot.disallow
    .filter((m) => polkuSopii(m, polku))
    .sort((a, b) => b.length - a.length)[0];
  if (pisinDisallow && (!pisinAllow || pisinDisallow.length >= pisinAllow.length)) {
    return false;
  }
  return true;
}
