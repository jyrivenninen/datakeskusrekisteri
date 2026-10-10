import { puraDomain } from "@/lib/lahde-tyyppi-domain";

/** Yksi verkkotunnus → yksi organisaatio: turvallinen hankkeen_oma-ehdotus. */
export function rakennaYksilollisetToimijaTunnukset(
  organisaatiot: ReadonlyArray<{ id: string; verkkotunnus: string | null; verkko_osoite: string | null }>,
): Map<string, string> {
  const laskuri = new Map<string, Set<string>>();
  for (const org of organisaatiot) {
    const tunnukset = new Set<string>();
    const vt = org.verkkotunnus?.trim().toLowerCase();
    if (vt) tunnukset.add(vt);
    const osoite = org.verkko_osoite?.trim();
    if (osoite) {
      try {
        const host = new URL(/^https?:\/\//i.test(osoite) ? osoite : `https://${osoite}`)
          .hostname.toLowerCase()
          .replace(/^www\./, "");
        tunnukset.add(host);
      } catch {
        /* jatka */
      }
    }
    for (const t of tunnukset) {
      if (!laskuri.has(t)) laskuri.set(t, new Set());
      laskuri.get(t)!.add(org.id);
    }
  }
  const yksilolliset = new Map<string, string>();
  for (const [tunnus, orgIdt] of laskuri) {
    if (orgIdt.size === 1) yksilolliset.set(tunnus, [...orgIdt][0]!);
  }
  return yksilolliset;
}

const KOosteHostit = ["datacentermap.com", "wikipedia.org", "peeringdb.com", "colomap.com", "datacenters.com"];

function onKoosteHost(host: string): boolean {
  return KOosteHostit.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * hankkeen_oma vain jos domain yksilöi yhden toimijan eikä URL ole kooste.
 * Muuten null → käytä muu.
 */
export function ehdotaHankkeenOmaToimijanPerusteella(
  url: string,
  yksilollisetTunnukset: ReadonlyMap<string, string>,
): boolean {
  const host = puraDomain(url);
  if (!host || onKoosteHost(host)) return false;
  return yksilollisetTunnukset.has(host);
}
