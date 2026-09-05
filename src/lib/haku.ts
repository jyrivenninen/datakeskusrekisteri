import type { HankeSuodatus } from "@/lib/suodatus";
import { KOKO_LUOKAT, VAIHE_NIMET } from "@/lib/naytto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

export const HAKU_MAX_PITUUS = 200;
export const HAKU_DEBOUNCE_MS = 300;

/** Trimmaa ja rajaa pituuden. Ei muuta kirjainkokoa — URL säilyttää käyttäjän syötteen. */
export function parsiHakusana(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim().slice(0, HAKU_MAX_PITUUS);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Vertailua varten: suomenkielinen kirjainkoon normalisointi. */
export function normalisoiHakusana(q: string): string {
  return q.trim().slice(0, HAKU_MAX_PITUUS).toLocaleLowerCase("fi");
}

export function hankkeSopiiHakuun(
  hanke: { nimi: string; kunta: string },
  q: string | undefined,
): boolean {
  if (!q) return true;
  const norm = normalisoiHakusana(q);
  if (!norm) return true;
  return (
    hanke.nimi.toLocaleLowerCase("fi").includes(norm) ||
    hanke.kunta.toLocaleLowerCase("fi").includes(norm)
  );
}

export function onAktiivinenSuodatus(suodatus: HankeSuodatus): boolean {
  return Boolean(suodatus.q || suodatus.kunta || suodatus.vaihe || suodatus.koko || suodatus.kuvalliset);
}

export function hankkeetSuodatusParametrit(suodatus: HankeSuodatus): URLSearchParams {
  const p = new URLSearchParams();
  if (suodatus.q) p.set("q", suodatus.q);
  if (suodatus.kunta) p.set("kunta", suodatus.kunta);
  if (suodatus.vaihe) p.set("vaihe", suodatus.vaihe);
  if (suodatus.koko) p.set("koko", suodatus.koko);
  if (suodatus.kuvalliset) p.set("kuvalliset", "1");
  return p;
}

/** Polku etusivulle suodattimilla. Tyhjä suodatus → `/`. */
export function hankkeetSuodatusPolku(suodatus: HankeSuodatus): string {
  const qs = hankkeetSuodatusParametrit(suodatus).toString();
  return qs ? `/?${qs}` : "/";
}

/** Polku koko näytön kartalle samoilla suodattimilla. */
export function karttaSuodatusPolku(suodatus: HankeSuodatus): string {
  const qs = hankkeetSuodatusParametrit(suodatus).toString();
  return qs ? `/kartta?${qs}` : "/kartta";
}

export type AktiivinenEhto = {
  avain: string;
  nimi: string;
  poista: HankeSuodatus;
};

export function aktiivisetEhdot(suodatus: HankeSuodatus): AktiivinenEhto[] {
  const ehdot: AktiivinenEhto[] = [];
  if (suodatus.q) {
    ehdot.push({
      avain: "q",
      nimi: `Haku: ${suodatus.q}`,
      poista: { ...suodatus, q: undefined },
    });
  }
  if (suodatus.kunta) {
    ehdot.push({
      avain: "kunta",
      nimi: `Kunta: ${suodatus.kunta}`,
      poista: { ...suodatus, kunta: undefined },
    });
  }
  if (suodatus.vaihe) {
    ehdot.push({
      avain: "vaihe",
      nimi: `Vaihe: ${VAIHE_NIMET[suodatus.vaihe as HankeVaihe]}`,
      poista: { ...suodatus, vaihe: undefined },
    });
  }
  if (suodatus.koko) {
    const nimi = KOKO_LUOKAT.find((l) => l.arvo === suodatus.koko)?.nimi ?? suodatus.koko;
    ehdot.push({
      avain: "koko",
      nimi: `Koko: ${nimi}`,
      poista: { ...suodatus, koko: undefined },
    });
  }
  if (suodatus.kuvalliset) {
    ehdot.push({
      avain: "kuvalliset",
      nimi: "Vain kuvalliset",
      poista: { ...suodatus, kuvalliset: undefined },
    });
  }
  return ehdot;
}
