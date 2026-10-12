/**
 * Pakollinen koneellinen tarkistus ennen LS13-erähyväksyntää.
 * Tunniste/luku jonka arvo ei esiinny lainauksessa → erän ulkopuolelle.
 */
import { tarkistaArvoLainauksessa } from "@/lib/lahde-lainaus-tarkistus";

export type EraKenttaEhdotus = {
  arvo?: unknown;
  lainaus?: unknown;
  sitaatti?: unknown;
};

export type EraPorttiTulos =
  | { ok: true }
  | { ok: false; kentta: string; syy: string };

/** Tarkistaa ehdotuksen kentät. Vaihe ohitetaan (ihminen). */
export function tarkistaEraEhdotusKentat(
  kentat: Record<string, EraKenttaEhdotus> | null | undefined,
): EraPorttiTulos {
  if (!kentat) return { ok: true };
  for (const [kentta, raw] of Object.entries(kentat)) {
    const arvo =
      raw?.arvo == null
        ? null
        : typeof raw.arvo === "string"
          ? raw.arvo
          : String(raw.arvo);
    const lainaus =
      typeof raw?.lainaus === "string"
        ? raw.lainaus
        : typeof raw?.sitaatti === "string"
          ? raw.sitaatti
          : null;
    const t = tarkistaArvoLainauksessa(kentta, arvo, lainaus);
    if (t.tulos === "ei_tue") {
      return { ok: false, kentta, syy: t.syy };
    }
  }
  return { ok: true };
}

export function onLs13EraVahvistusTunniste(tunniste: string | null | undefined): boolean {
  return /^lahdeselvitys13_era[123]_vahvistus$/.test(String(tunniste ?? ""));
}
