/** Evästeen nimi ja arvo — sama kuin ennen välimuistipushia. */
export const ESIVERSIO_EVASTE = "esiversio_kuitattu";
export const ESIVERSIO_EVASTE_ARVO = "kylla";

/** Voimassaolo sekunteina (30 vuorokautta), sama kuin aiempi maxAge. */
export const ESIVERSIO_EVASTE_MAX_AGE_S = 60 * 60 * 24 * 30;

/** HTML data-attribuutti: oletus piilossa, näytetään vain arvolla "nayta". */
export const ESIVERSIO_DATA_ATTR = "data-esiversio";
export const ESIVERSIO_DATA_KUITATTU = "kuitattu";
export const ESIVERSIO_DATA_NAYTA = "nayta";

/** @deprecated käytä ESIVERSIO_DATA_KUITATTU */
export const ESIVERSIO_DATA_ARVO = ESIVERSIO_DATA_KUITATTU;

export type EsiversioDataArvo =
  | typeof ESIVERSIO_DATA_KUITATTU
  | typeof ESIVERSIO_DATA_NAYTA;

export const ESIVERSIO_TEKSTI =
  "Rekisteri on esiversio. Tietoja täydennetään ja varmennetaan. Osa toiminnoista voi puuttua. Osa tiedoista voi olla puutteellista, vanhentunutta tai virheellistä. Tarkista aina alkuperäinen lähde.";

export const OSALLISTUMINEN_TEKSTI =
  "Toivomme ilmoituksia puuttuvista hankkeista sekä täydennyksiä ja korjauksia julkisine lähteineen. Ilmoitus ei julkaise tietoja suoraan: ylläpitäjä tarkistaa lähteen.";

/** Parsii document.cookie-tyylisen merkkijonon. */
export function parsiEvasteArvo(
  cookieHeader: string | null | undefined,
  nimi: string = ESIVERSIO_EVASTE,
): string | null {
  if (cookieHeader == null || cookieHeader === "") return null;
  try {
    for (const osa of cookieHeader.split(";")) {
      const trimattu = osa.trim();
      if (!trimattu) continue;
      const eq = trimattu.indexOf("=");
      if (eq < 0) continue;
      const avain = trimattu.slice(0, eq).trim();
      if (avain !== nimi) continue;
      return trimattu.slice(eq + 1).trim();
    }
  } catch {
    return null;
  }
  return null;
}

/** True jos eväste merkitsee kuittauksen (arvo "kylla"). */
export function onkoEsiversioKuitattuEvasteesta(
  cookieHeader: string | null | undefined,
): boolean {
  return parsiEvasteArvo(cookieHeader) === ESIVERSIO_EVASTE_ARVO;
}

/**
 * Puhdas attribuuttiarvo evästemerkkijonosta.
 * ei evästettä / virheellinen → "nayta"; kylla → "kuitattu".
 */
export function esiversioDataArvoEvasteesta(
  cookieHeader: string | null | undefined,
): EsiversioDataArvo {
  try {
    return onkoEsiversioKuitattuEvasteesta(cookieHeader)
      ? ESIVERSIO_DATA_KUITATTU
      : ESIVERSIO_DATA_NAYTA;
  } catch {
    return ESIVERSIO_DATA_NAYTA;
  }
}

/**
 * Lukee cookien annetulla funktiolla (testattava; document.cookie voi heittää).
 * Virhe → "nayta".
 */
export function esiversioDataArvoDocumentCookiesta(
  lueCookie: () => string,
): EsiversioDataArvo {
  try {
    return esiversioDataArvoEvasteesta(lueCookie());
  } catch {
    return ESIVERSIO_DATA_NAYTA;
  }
}

/** Set-Cookie -rivi selaimelle (ei httpOnly — layout ei lue cookies()-funktiota). */
export function esiversioKuittausSetCookie(): string {
  return `${ESIVERSIO_EVASTE}=${ESIVERSIO_EVASTE_ARVO}; Path=/; Max-Age=${ESIVERSIO_EVASTE_MAX_AGE_S}; SameSite=Lax`;
}

/**
 * Kriittinen CSS head-osaan: oletus piilossa, näkyy vain data-esiversio="nayta".
 * Ei transition/animation.
 */
export const ESIVERSIO_KRITTIINEN_CSS =
  `.esiversio-ilmoitus{display:none}` +
  `html[data-esiversio="${ESIVERSIO_DATA_NAYTA}"] .esiversio-ilmoitus{display:block}`;

/** Ilman JS:ää ilmoitus näkyy. */
export const ESIVERSIO_NOSCRIPT_CSS =
  `.esiversio-ilmoitus{display:block!important}`;

/**
 * Synkroninen inline-skripti head-osaan: asettaa data-esiversio ennen maalia.
 * Try/catch — ei kaadu, jos evästeitä ei voi lukea. Projektissa ei CSP:tä.
 */
export const ESIVERSIO_INLINE_SKRIPTI = [
  "(function(){try{",
  `var n=${JSON.stringify(ESIVERSIO_EVASTE)};`,
  `var a=${JSON.stringify(ESIVERSIO_EVASTE_ARVO)};`,
  `var attr=${JSON.stringify(ESIVERSIO_DATA_ATTR)};`,
  `var kuitattu=${JSON.stringify(ESIVERSIO_DATA_KUITATTU)};`,
  `var nayta=${JSON.stringify(ESIVERSIO_DATA_NAYTA)};`,
  'var c=document.cookie||"";',
  "var ok=false;",
  'var osat=c.split(";");',
  "for(var i=0;i<osat.length;i++){",
  "var t=osat[i].trim();",
  'if(t===n+"="+a){ok=true;break;}',
  "}",
  "document.documentElement.setAttribute(attr,ok?kuitattu:nayta);",
  "}catch(e){",
  `try{document.documentElement.setAttribute(${JSON.stringify(ESIVERSIO_DATA_ATTR)},${JSON.stringify(ESIVERSIO_DATA_NAYTA)});}`,
  "catch(e2){}",
  "}})();",
].join("");

/**
 * Head-fragmentin merkkijono testeille: skripti ei async/defer, noscript mukana,
 * oletus display:none.
 */
export function esiversioHeadMerkkijono(): string {
  return [
    `<style id="esiversio-kriittinen">${ESIVERSIO_KRITTIINEN_CSS}</style>`,
    `<script id="esiversio-kuittaus">${ESIVERSIO_INLINE_SKRIPTI}</script>`,
    `<noscript><style id="esiversio-noscript">${ESIVERSIO_NOSCRIPT_CSS}</style></noscript>`,
  ].join("");
}
