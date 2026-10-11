import type { EhdotusSisalto } from "@/lib/ehdotus";

/**
 * Vapaatekstin varahaku: merkitsee, että asiakirjaa ei saa kiinnittää
 * siihen hankkeeseen, jolle se tuotiin. Ensisijainen tapa on
 * sisalto.kohdistus_epavarma (boolean).
 *
 * Ei osu «eri hanke kuin X» -muotoisiin selvennyksiin, joissa rivi
 * kuuluu ehdotettuun hankkeeseen.
 */
export const KOHDISTUS_EPAVARMA_HUOMAUTUS =
  /ei\s+t[äa]m[äa]n\s+hankkeen|ei\s+t[äa]m[äa](?=\s|[–—.-]|$)|v[äa]{2}r[äa]\s+hanke|v[äa]{2}r[äa]lle\s+hankkeelle|kohdistus[_\s-]?ep[äa]varma|älä\s+kohdista/i;

type KohdistusSisalto = EhdotusSisalto & {
  kohdistus_epavarma?: boolean;
  kohdistus_huomio?: string | null;
  kunta?: EhdotusSisalto["kunta"] & {
    kohdistus_epavarma?: boolean;
    grok_ilmenee?: string | null;
    dokumentit?: Array<{
      url?: string;
      otsikko?: string;
      mita_ilmenee?: string | null;
      kohdistus_epavarma?: boolean;
      kohdistus_huomio?: string | null;
    }>;
  };
};

export function onKohdistusEpavarma(ehdotus: {
  huomautus?: string | null;
  sisalto?: unknown;
}): boolean {
  const sisalto = (ehdotus.sisalto ?? {}) as KohdistusSisalto;
  if (sisalto.kohdistus_epavarma === true) return true;
  if (sisalto.kunta?.kohdistus_epavarma === true) return true;
  if (sisalto.kunta?.dokumentit?.some((d) => d.kohdistus_epavarma === true)) {
    return true;
  }

  const tekstit = [
    ehdotus.huomautus,
    sisalto.kohdistus_huomio,
    sisalto.kunta?.grok_ilmenee,
    ...(sisalto.kunta?.dokumentit ?? []).flatMap((d) => [
      d.mita_ilmenee,
      d.kohdistus_huomio,
    ]),
  ]
    .filter((t): t is string => Boolean(t && String(t).trim()))
    .join("\n");

  return KOHDISTUS_EPAVARMA_HUOMAUTUS.test(tekstit);
}

/** Tulkitsee Grok-kentän / vapaan mita_ilmenee-tekstin strukturoiduiksi lipuiksi. */
export function tulkitseKohdistusIlmenee(mitaIlmenee: string | null | undefined): {
  kohdistus_epavarma: boolean;
  kohdistus_huomio: string | null;
} {
  const teksti = (mitaIlmenee ?? "").trim();
  if (!teksti) return { kohdistus_epavarma: false, kohdistus_huomio: null };
  if (KOHDISTUS_EPAVARMA_HUOMAUTUS.test(teksti)) {
    return { kohdistus_epavarma: true, kohdistus_huomio: teksti };
  }
  return { kohdistus_epavarma: false, kohdistus_huomio: null };
}
