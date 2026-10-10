import type { EhdotusSisalto } from "@/lib/ehdotus";
import {
  LAHDE_TYYPPI_NIMET,
  oletusSitovuustaso,
  type LahdeTyyppi,
  type Sitovuustaso,
} from "@/lib/lahde-metatiedot";

export type LahdeTyyppiLapikayntiRivi = {
  avain: string;
  dokumentti_id: string;
  url: string;
  esiintymia: number;
  lahde_tyyppi: LahdeTyyppi;
  sitovuustaso: Sitovuustaso;
  otsikko: string;
  otsikko_automaattinen: boolean;
  ehdotus_id: string | null;
  ehdotettu_lahde_tyyppi: LahdeTyyppi | null;
  ehdotettu_sitovuustaso: Sitovuustaso | null;
  on_ehdotus: boolean;
  lahde_selvitys: string | null;
  ehdotettu_otsikko_grok: string | null;
};

export type LahdeTyyppiLapikayntiYhteenveto = {
  yhteensa: number;
  kasitelty: number;
  jaljella: number;
  odottavia_ehdotuksia: number;
  /** Kaikki kentta_lahteet-rivit (lähdeviittaukset), ei pelkät dokumentti-URL:t. */
  viittauksia_yhteensa: number;
  viittauksia_kasitelty: number;
  viittaus_prosentti: number;
};

/** Top-N URL:it viittausten lukumäärän mukaan. */
export function enitenViitatutUrlit(urlMaara: Map<string, number>, n = 100): Set<string> {
  const jarjestetty = [...urlMaara.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return new Set(jarjestetty.map(([u]) => u));
}

export function laskeViittausEdistyminen(
  urlMaara: Map<string, number>,
  kasiteltyUrlit: ReadonlySet<string>,
): { yhteensa: number; kasitelty: number; prosentti: number } {
  let yhteensa = 0;
  let kasitelty = 0;
  for (const [u, lkm] of urlMaara) {
    yhteensa += lkm;
    if (kasiteltyUrlit.has(u)) kasitelty += lkm;
  }
  const prosentti = yhteensa > 0 ? Math.round((kasitelty / yhteensa) * 1000) / 10 : 0;
  return { yhteensa, kasitelty, prosentti };
}

export function jarjestaLapikayntiRivit(
  rivit: LahdeTyyppiLapikayntiRivi[],
): LahdeTyyppiLapikayntiRivi[] {
  return [...rivit].sort((a, b) => {
    if (a.on_ehdotus !== b.on_ehdotus) return a.on_ehdotus ? -1 : 1;
    return b.esiintymia - a.esiintymia;
  });
}

export function alkuLapikayntiTila(rivi: LahdeTyyppiLapikayntiRivi): {
  lahde_tyyppi: LahdeTyyppi;
  sitovuustaso: Sitovuustaso;
  otsikko: string;
} {
  const tyyppi =
    rivi.ehdotettu_lahde_tyyppi ??
    (rivi.lahde_tyyppi !== "muu" ? rivi.lahde_tyyppi : "muu");
  const sitovuus =
    rivi.ehdotettu_sitovuustaso ?? oletusSitovuustaso(tyyppi);
  const ehdotusOtsikko = rivi.ehdotettu_otsikko_grok?.trim();
  return {
    lahde_tyyppi: tyyppi,
    sitovuustaso: sitovuus,
    otsikko: ehdotusOtsikko || (rivi.otsikko_automaattinen ? "" : rivi.otsikko),
  };
}

export function lahdeTyyppiSelite(tyyppi: LahdeTyyppi): string {
  return LAHDE_TYYPPI_NIMET[tyyppi];
}

export function yhdistaLapikayntiData(opts: {
  dokumentit: Array<{
    id: string;
    url: string;
    otsikko: string;
    lahde_tyyppi: LahdeTyyppi;
    sitovuustaso: Sitovuustaso;
    otsikko_automaattinen: boolean;
    lahde_metatiedot_kasitelty_pvm: string | null;
  }>;
  urlMaara: Map<string, number>;
  ehdotukset: Array<{
    id: string;
    sisalto: EhdotusSisalto;
  }>;
  /** Kun asetettu, listassa vain näiden URL:ien dokumentit (esim. top 100). */
  rajaaUrlit?: ReadonlySet<string> | null;
}): { rivit: LahdeTyyppiLapikayntiRivi[]; yhteenveto: LahdeTyyppiLapikayntiYhteenveto } {
  const ehdotusDokId = new Map<string, { id: string; meta: NonNullable<EhdotusSisalto["lahde_metatiedot"]> }>();
  for (const e of opts.ehdotukset) {
    const meta = e.sisalto.lahde_metatiedot;
    if (!meta?.dokumentti_id) continue;
    ehdotusDokId.set(meta.dokumentti_id, { id: e.id, meta });
  }

  const kasiteltyUrlit = new Set(
    opts.dokumentit
      .filter((d) => d.lahde_metatiedot_kasitelty_pvm)
      .map((d) => d.url),
  );
  const viittaus = laskeViittausEdistyminen(opts.urlMaara, kasiteltyUrlit);

  const yhteensa = opts.dokumentit.length;
  let kasitelty = 0;
  const rivit: LahdeTyyppiLapikayntiRivi[] = [];

  for (const d of opts.dokumentit) {
    if (d.lahde_metatiedot_kasitelty_pvm) {
      kasitelty += 1;
      continue;
    }
    if (opts.rajaaUrlit && !opts.rajaaUrlit.has(d.url)) {
      continue;
    }

    const e = ehdotusDokId.get(d.id);
    const esiintymia = opts.urlMaara.get(d.url) ?? e?.meta.esiintymia ?? 0;

    rivit.push({
      avain: d.id,
      dokumentti_id: d.id,
      url: d.url,
      esiintymia,
      lahde_tyyppi: d.lahde_tyyppi,
      sitovuustaso: d.sitovuustaso,
      otsikko: d.otsikko,
      otsikko_automaattinen: d.otsikko_automaattinen,
      ehdotus_id: e?.id ?? null,
      ehdotettu_lahde_tyyppi: (e?.meta.ehdotettu_lahde_tyyppi as LahdeTyyppi) ?? null,
      ehdotettu_sitovuustaso: (e?.meta.ehdotettu_sitovuustaso as Sitovuustaso) ?? null,
      on_ehdotus: Boolean(e),
      lahde_selvitys: e?.meta.lahde_selvitys ?? null,
      ehdotettu_otsikko_grok: e?.meta.ehdotettu_otsikko?.trim() ?? null,
    });
  }

  const jarjestetty =
    opts.rajaaUrlit != null
      ? [...rivit].sort((a, b) => b.esiintymia - a.esiintymia)
      : jarjestaLapikayntiRivit(rivit);

  return {
    rivit: jarjestetty,
    yhteenveto: {
      yhteensa,
      kasitelty,
      jaljella: yhteensa - kasitelty,
      odottavia_ehdotuksia: ehdotusDokId.size,
      viittauksia_yhteensa: viittaus.yhteensa,
      viittauksia_kasitelty: viittaus.kasitelty,
      viittaus_prosentti: viittaus.prosentti,
    },
  };
}
