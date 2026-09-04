import type { EhdotusSisalto } from "@/lib/ehdotus";
import {
  HANKE_KENTTA_NIMET,
  LUOTTAMUS_NIMET,
  MERKINTA_NIMET,
  SIJAINTI_ALUE_TYYPPI_NIMET,
  VAIHE_NIMET,
} from "@/lib/naytto";
import type { Hanke, Luottamus, Merkinta } from "@/lib/supabase/tietokanta";

export type KuittausLahde = {
  rivi_id: string;
  kentta: string;
  luottamus: Luottamus;
  merkitty: Merkinta;
  lainaus: string | null;
  lahde_url: string | null;
};

export type KuittausTila = {
  arvo: string;
  luottamus: string;
  merkitty: string;
};

export type KuittausNakymaRivi = {
  hanke_id: string;
  lahde_kentta: string;
  nimi: string;
  vanha: KuittausTila;
  uusi: KuittausTila;
  ennenAgenttia: string | null;
  lainaus: string | null;
  lahde_url: string | null;
};

/** Vastaa agentti_lahde_kentta()-funktiota. */
export function agenttiLahdeKentta(kentta: string): string {
  if (kentta === "toimija_nimi") return "toimija_organisaatio_id";
  if (kentta === "sijainti_lat" || kentta === "sijainti_lon" || kentta === "sijainti_alue_tyyppi") {
    return "sijainti";
  }
  return kentta;
}

export function kuittausKenttaNimi(lahdeKentta: string): string {
  if (lahdeKentta === "toimija_organisaatio_id") {
    return HANKE_KENTTA_NIMET.toimija_nimi;
  }
  return HANKE_KENTTA_NIMET[lahdeKentta] ?? lahdeKentta;
}

export function muotoileHankeKenttaArvo(
  hanke: Hanke,
  lahdeKentta: string,
  orgNimet: ReadonlyMap<string, string>,
): string {
  if (lahdeKentta === "toimija_organisaatio_id") {
    const id = hanke.toimija_organisaatio_id;
    if (!id) return "—";
    return orgNimet.get(id) ?? id;
  }
  if (lahdeKentta === "sijainti") {
    const osat: string[] = [];
    if (hanke.sijainti_lat != null && hanke.sijainti_lon != null) {
      osat.push(`${hanke.sijainti_lat}, ${hanke.sijainti_lon}`);
    }
    if (hanke.sijainti_alue_tyyppi) {
      osat.push(
        SIJAINTI_ALUE_TYYPPI_NIMET[hanke.sijainti_alue_tyyppi] ?? hanke.sijainti_alue_tyyppi,
      );
    }
    return osat.length > 0 ? osat.join(" · ") : "—";
  }
  if (lahdeKentta === "vaihe") {
    return VAIHE_NIMET[hanke.vaihe] ?? hanke.vaihe;
  }
  const avain = lahdeKentta as keyof Hanke;
  const raw = hanke[avain];
  if (raw == null || raw === "") return "—";
  return String(raw);
}

type AgenttiEhdotus = {
  hanke_id: string | null;
  tyyppi: string;
  sisalto: unknown;
};

type AgenttiKenttaKartta = {
  kentat: Map<string, { tyyppi: string }>;
  taydennysHankkeet: Set<string>;
  korjausKentat: Set<string>;
};

function rakennaAgenttiKenttaKartta(ehdotukset: AgenttiEhdotus[]): AgenttiKenttaKartta {
  const kentat = new Map<string, { tyyppi: string }>();
  const taydennysHankkeet = new Set<string>();
  const korjausKentat = new Set<string>();

  for (const ehdotus of ehdotukset) {
    if (!ehdotus.hanke_id) continue;
    const kentatObj = (ehdotus.sisalto as EhdotusSisalto).kentat ?? {};

    if (ehdotus.tyyppi === "korjaus") {
      for (const kentta of Object.keys(kentatObj)) {
        const avain = `${ehdotus.hanke_id}:${agenttiLahdeKentta(kentta)}`;
        korjausKentat.add(avain);
        if (!kentat.has(avain)) kentat.set(avain, { tyyppi: "korjaus" });
      }
    } else if (ehdotus.tyyppi === "taydennys" || ehdotus.tyyppi === "uusi_hanke") {
      taydennysHankkeet.add(ehdotus.hanke_id);
      for (const kentta of Object.keys(kentatObj)) {
        const avain = `${ehdotus.hanke_id}:${agenttiLahdeKentta(kentta)}`;
        if (!kentat.has(avain)) kentat.set(avain, { tyyppi: ehdotus.tyyppi });
      }
    }
  }

  return { kentat, taydennysHankkeet, korjausKentat };
}

/** Ennen agenttia: tyhjennys/täydennys → puuttui; korjaus → ei tallennettu. */
function ennenAgenttiaTeksti(
  hankeId: string,
  lahdeKentta: string,
  meta: AgenttiKenttaKartta,
): string | null {
  const avain = `${hankeId}:${lahdeKentta}`;
  const kenttaMeta = meta.kentat.get(avain);
  if (kenttaMeta?.tyyppi === "korjaus") return "Ei tallennettu (agentti korjasi arvoa)";
  if (kenttaMeta && (kenttaMeta.tyyppi === "taydennys" || kenttaMeta.tyyppi === "uusi_hanke")) {
    return KUITTAUS_TAYDENNYS_TEKSTI;
  }
  // Osittainen automaattijulkaisu poistaa julkaistut kentät sisalto.kentat-listasta.
  if (meta.taydennysHankkeet.has(hankeId) && !meta.korjausKentat.has(avain)) {
    return KUITTAUS_TAYDENNYS_TEKSTI;
  }
  return null;
}

export const KUITTAUS_TAYDENNYS_TEKSTI = "Puuttui (agentti täytti kentän)" as const;

export function onKuittausTaydennys(rivi: KuittausNakymaRivi): boolean {
  return rivi.ennenAgenttia === KUITTAUS_TAYDENNYS_TEKSTI;
}

export function ryhmitteleKuittausKentat(
  rivit: KuittausNakymaRivi[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const rivi of rivit) {
    const lista = map.get(rivi.hanke_id) ?? [];
    lista.push(rivi.lahde_kentta);
    map.set(rivi.hanke_id, lista);
  }
  return map;
}

export function rakennaKuittausNakyma(
  lahteet: KuittausLahde[],
  hankkeet: Hanke[],
  orgNimet: ReadonlyMap<string, string>,
  agenttiEhdotukset: AgenttiEhdotus[] = [],
): KuittausNakymaRivi[] {
  const hankeMap = new Map(hankkeet.map((h) => [h.id, h]));
  const agenttiKentat = rakennaAgenttiKenttaKartta(agenttiEhdotukset);
  const nakyvat = new Map<string, KuittausLahde>();

  for (const lahde of lahteet) {
    const avain = `${lahde.rivi_id}:${lahde.kentta}`;
    if (!nakyvat.has(avain)) nakyvat.set(avain, lahde);
  }

  const rivit: KuittausNakymaRivi[] = [];

  for (const lahde of nakyvat.values()) {
    const hanke = hankeMap.get(lahde.rivi_id);
    if (!hanke) continue;

    const arvo = muotoileHankeKenttaArvo(hanke, lahde.kentta, orgNimet);
    const vanha: KuittausTila = {
      arvo,
      luottamus: LUOTTAMUS_NIMET[lahde.luottamus],
      merkitty: MERKINTA_NIMET[lahde.merkitty],
    };
    const uusi: KuittausTila = {
      arvo,
      luottamus: LUOTTAMUS_NIMET.vahvistettu,
      merkitty: MERKINTA_NIMET.ihmisen_vahvistama,
    };

    rivit.push({
      hanke_id: lahde.rivi_id,
      lahde_kentta: lahde.kentta,
      nimi: kuittausKenttaNimi(lahde.kentta),
      vanha,
      uusi,
      ennenAgenttia: ennenAgenttiaTeksti(lahde.rivi_id, lahde.kentta, agenttiKentat),
      lainaus: lahde.lainaus?.trim() ? lahde.lainaus.trim() : null,
      lahde_url: lahde.lahde_url?.trim() ? lahde.lahde_url.trim() : null,
    });
  }

  rivit.sort((a, b) => {
    const ha = hankeMap.get(a.hanke_id)?.nimi ?? "";
    const hb = hankeMap.get(b.hanke_id)?.nimi ?? "";
    if (ha !== hb) return ha.localeCompare(hb, "fi");
    return a.nimi.localeCompare(b.nimi, "fi");
  });

  return rivit;
}
