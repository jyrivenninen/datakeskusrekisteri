import { parsiHakusana } from "@/lib/haku";
import {
  KUITTAUS_TAYDENNYS_TEKSTI,
  onKuittausTaydennys,
  type KuittausNakymaRivi,
} from "@/lib/kuittaus";
import { onHankeVaihe, VAIHE_NIMET } from "@/lib/naytto";
import type { HankeVaihe } from "@/lib/supabase/tietokanta";

export type KuittausJarjestys = "hanke" | "kunta" | "kentta" | "luottamus" | "vaihe";

export type KuittausEnnenSuodatin = "taydennys" | "korjaus" | "puuttuu";

export type KuittausSuodatus = {
  q?: string;
  kunta?: string;
  toimija?: string;
  vaihe?: HankeVaihe;
  kentta?: string;
  taydennys?: boolean;
  ennen?: KuittausEnnenSuodatin;
};

export function parsiKuittausSuodatus(params: {
  q?: string;
  kunta?: string;
  toimija?: string;
  vaihe?: string;
  kentta?: string;
  taydennys?: string;
  ennen?: string;
}): KuittausSuodatus {
  const ennen = params.ennen;
  return {
    q: parsiHakusana(params.q),
    kunta: params.kunta?.trim() || undefined,
    toimija: params.toimija?.trim() || undefined,
    vaihe: params.vaihe && onHankeVaihe(params.vaihe) ? params.vaihe : undefined,
    kentta: params.kentta?.trim() || undefined,
    taydennys: params.taydennys === "1",
    ennen:
      ennen === "taydennys" || ennen === "korjaus" || ennen === "puuttuu"
        ? ennen
        : undefined,
  };
}

export function onKuittausSuodatusAktiivinen(suodatus: KuittausSuodatus): boolean {
  return Boolean(
    suodatus.q ||
      suodatus.kunta ||
      suodatus.toimija ||
      suodatus.vaihe ||
      suodatus.kentta ||
      suodatus.taydennys ||
      suodatus.ennen,
  );
}

function vastaaEnnenSuodatinta(
  rivi: KuittausNakymaRivi,
  ennen: KuittausEnnenSuodatin,
): boolean {
  if (ennen === "taydennys") return onKuittausTaydennys(rivi);
  if (ennen === "korjaus") return rivi.ennenAgenttia === "Ei tallennettu (agentti korjasi arvoa)";
  return !rivi.ennenAgenttia;
}

export function suodataKuittausRivit(
  rivit: readonly KuittausNakymaRivi[],
  suodatus: KuittausSuodatus,
): KuittausNakymaRivi[] {
  const q = suodatus.q?.toLowerCase();
  return rivit.filter((rivi) => {
    if (q) {
      const haku =
        `${rivi.hanke_nimi} ${rivi.kunta} ${rivi.toimija_nimi ?? ""} ${rivi.nimi}`.toLowerCase();
      if (!haku.includes(q)) return false;
    }
    if (suodatus.kunta && rivi.kunta !== suodatus.kunta) return false;
    if (suodatus.toimija && rivi.toimija_nimi !== suodatus.toimija) return false;
    if (suodatus.vaihe) {
      const vaiheNimi = VAIHE_NIMET[suodatus.vaihe];
      if (rivi.vaihe !== vaiheNimi) return false;
    }
    if (suodatus.kentta && rivi.lahde_kentta !== suodatus.kentta) return false;
    if (suodatus.taydennys && !onKuittausTaydennys(rivi)) return false;
    if (suodatus.ennen && !vastaaEnnenSuodatinta(rivi, suodatus.ennen)) return false;
    return true;
  });
}

export function jarjestaKuittausRivit(
  rivit: KuittausNakymaRivi[],
  jarjestys: KuittausJarjestys,
): KuittausNakymaRivi[] {
  const kopio = [...rivit];
  kopio.sort((a, b) => {
    switch (jarjestys) {
      case "kunta":
        if (a.kunta !== b.kunta) return a.kunta.localeCompare(b.kunta, "fi");
        return a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
      case "kentta":
        if (a.nimi !== b.nimi) return a.nimi.localeCompare(b.nimi, "fi");
        return a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
      case "luottamus":
        if (a.luottamus !== b.luottamus) return a.luottamus.localeCompare(b.luottamus, "fi");
        return a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
      case "vaihe":
        if (a.vaihe !== b.vaihe) return a.vaihe.localeCompare(b.vaihe, "fi");
        return a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
      case "hanke":
      default:
        if (a.hanke_nimi !== b.hanke_nimi) return a.hanke_nimi.localeCompare(b.hanke_nimi, "fi");
        return a.nimi.localeCompare(b.nimi, "fi");
    }
  });
  return kopio;
}

export function kuittausSuodatusPolku(
  suodatus: KuittausSuodatus,
  jarjestys?: KuittausJarjestys,
): string {
  const p = new URLSearchParams();
  if (suodatus.q) p.set("q", suodatus.q);
  if (suodatus.kunta) p.set("kunta", suodatus.kunta);
  if (suodatus.toimija) p.set("toimija", suodatus.toimija);
  if (suodatus.vaihe) p.set("vaihe", suodatus.vaihe);
  if (suodatus.kentta) p.set("kentta", suodatus.kentta);
  if (suodatus.taydennys) p.set("taydennys", "1");
  if (suodatus.ennen) p.set("ennen", suodatus.ennen);
  if (jarjestys && jarjestys !== "hanke") p.set("jarjestys", jarjestys);
  const qs = p.toString();
  return qs ? `/yllapito/kuittaus?${qs}` : "/yllapito/kuittaus";
}

export { KUITTAUS_TAYDENNYS_TEKSTI };
