import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";
import { tehokasLahdeTyyppi } from "@/lib/lahde-tyyppi-domain";
import { VARMISTAVAT_LAHDE_TYYPIT } from "@/lib/kentta-varmistus";
import { lahdeVoimassaLaskentaan } from "@/lib/lahde-tila";
import type { KentanTila } from "@/lib/naytto";
import type { Luottamus, Merkinta, SijaintiAlueTyyppi } from "@/lib/supabase/tietokanta";

/** Lainaus nimeää osoitteen tai koordinaatit (positiivinen vihreän ehto). */
export function lainausNimeaOsoitteenTaiKoordinaatit(
  lainaus: string | null | undefined,
): boolean {
  if (!lainaus) return false;
  const t = lainaus.trim();
  if (t.length < 4) return false;
  // Koordinaattipari (lat, lon) tai asteet
  if (/\b\d{1,3}[.,]\d{2,}\s*[,;\s]\s*\d{1,3}[.,]\d{2,}\b/.test(t)) return true;
  if (/\b(ETRS|WGS|EPSG|lat(?:itude)?|lon(?:gitude)?|koordinaat)/i.test(t)) return true;
  if (/\b[NS]\s*\d{1,3}[.,]\d+/i.test(t) && /\b[EW]\s*\d{1,3}[.,]\d+/i.test(t)) {
    return true;
  }
  // Suomalainen katuosoite: …katu/tie/… + numero
  if (
    /\b[\wÅÄÖåäö-]{2,}(?:katu|tie|kuja|väylä|polku|ranta|aukio|tori|väg|gatan)\s+\d+/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bosoite\b/i.test(t)) return true;
  return false;
}

export function onGeokoodausTaiMenetelmaUrl(
  url: string | null | undefined,
  lahdeTyyppi: LahdeTyyppi | string | null | undefined,
): boolean {
  if (lahdeTyyppi === "menetelma") return true;
  if (!url) return false;
  return /avoin-paikkatieto\.maanmittauslaitos\.fi\/geocoding\//i.test(url);
}

type SijaintiLahde = {
  luottamus: Luottamus;
  merkitty: Merkinta;
  tila?: string | null;
  lahde_url: string;
  lainaus?: string | null;
  tekninen_lahde?: boolean | null;
};

/**
 * Sijainnin liikennevalo: vihreä vain tontti/kaava_alue + lainaus nimeää
 * osoitteen tai koordinaatit + ihmisen vahvistama viranomaislähde,
 * eikä lähde ole geokoodaus-URL tai menetelmä. null ja arvio → ei vihreä.
 */
export function sijainninKentanTila(
  alueTyyppi: SijaintiAlueTyyppi | null | undefined,
  arvoOn: boolean,
  lahteet: ReadonlyArray<SijaintiLahde>,
  urlTyypit: ReadonlyMap<string, LahdeTyyppi>,
): KentanTila {
  if (!arvoOn) return "puuttuu";
  if (alueTyyppi == null || alueTyyppi === "arvio") return "vahvistamaton";
  if (alueTyyppi !== "tontti" && alueTyyppi !== "kaava_alue") {
    return "vahvistamaton";
  }

  const voimassa = lahteet.filter(
    (lahde) =>
      lahdeVoimassaLaskentaan(lahde.tila) && lahde.tekninen_lahde !== true,
  );
  if (voimassa.length === 0) return "vahvistamaton";
  if (voimassa.some((lahde) => lahde.luottamus === "ristiriitainen")) {
    return "vahvistamaton";
  }

  const varmistavat = VARMISTAVAT_LAHDE_TYYPIT as readonly string[];
  const vihrea = voimassa.some((lahde) => {
    if (lahde.merkitty !== "ihmisen_vahvistama") return false;
    if (!lainausNimeaOsoitteenTaiKoordinaatit(lahde.lainaus)) return false;
    const tyyppi = tehokasLahdeTyyppi(
      urlTyypit.get(lahde.lahde_url) ?? "muu",
      lahde.lahde_url,
    );
    if (onGeokoodausTaiMenetelmaUrl(lahde.lahde_url, tyyppi)) return false;
    return varmistavat.includes(tyyppi);
  });

  return vihrea ? "vahvistettu" : "vahvistamaton";
}
