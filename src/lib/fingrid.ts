/**
 * Fingrid avoin data (data.fingrid.fi). Vain palvelinpuolella — API-avain ei saa
 * vuotaa selaimelle. Lisenssi: CC BY 4.0.
 *
 * Dokumentaatio: PROJEKTI-lisays-7A5-rajapinnat.md § 7A.5.4
 */

const FINGRID_API = "https://data.fingrid.fi/api";

/** Todennus 5.9.2026 — reaaliaikaiset tuotantosarjat (MW, 3 min). */
export const FINGRID_TUOTANTO_DATASETIT = {
  kokonaistuotanto: {
    id: 192,
    nimi: "Kokonaistuotanto",
    lahde_url: "https://data.fingrid.fi/datasets/192",
  },
  ydinvoima: {
    id: 188,
    nimi: "Ydinvoima",
    lahde_url: "https://data.fingrid.fi/datasets/188",
  },
  tuulivoima: {
    id: 245,
    nimi: "Tuulivoima",
    lahde_url: "https://data.fingrid.fi/datasets/245",
  },
  vesivoima: {
    id: 191,
    nimi: "Vesivoima",
    lahde_url: "https://data.fingrid.fi/datasets/191",
  },
} as const;

export type FingridTuotantoRivi = {
  datasetId: number;
  nimi: string;
  mw: number;
  mittausPvm: string;
  lahde_url: string;
};

export type FingridTuotantoNakyma = {
  paivitetty_pvm: string;
  rivit: FingridTuotantoRivi[];
  kokonaistuotanto_mw: number | null;
};

type FingridDataRivi = {
  datasetId?: number;
  startTime?: string;
  endTime?: string;
  value?: number;
};

type FingridVastaus = {
  data?: FingridDataRivi[];
};

function fingridAvain(): string | null {
  let avain = process.env.FINGRID_API_AVAIN?.trim();
  if (!avain) return null;
  if (
    (avain.startsWith('"') && avain.endsWith('"')) ||
    (avain.startsWith("'") && avain.endsWith("'"))
  ) {
    avain = avain.slice(1, -1).trim();
  }
  return avain || null;
}

function fingridDataRivit(runko: unknown): FingridDataRivi[] {
  if (Array.isArray(runko)) return runko as FingridDataRivi[];
  if (!runko || typeof runko !== "object") return [];
  const kääritty = runko as FingridVastaus & FingridDataRivi;
  if (Array.isArray(kääritty.data)) return kääritty.data;
  if (kääritty.value != null) return [kääritty];
  return [];
}

function viimeisinArvo(runko: unknown, datasetId: number): { mw: number; pvm: string } | null {
  const data = fingridDataRivit(runko);
  if (data.length === 0) return null;
  const rivi =
    [...data].reverse().find((r) => r.datasetId === datasetId || r.datasetId == null) ??
    data[data.length - 1];
  if (rivi?.value == null || !Number.isFinite(Number(rivi.value))) return null;
  const pvm = rivi.endTime ?? rivi.startTime ?? new Date().toISOString();
  return { mw: Number(rivi.value), pvm };
}

async function haeDatasetViimeisin(
  datasetId: number,
  avain: string,
): Promise<{ mw: number; pvm: string } | null> {
  const url = `${FINGRID_API}/datasets/${datasetId}/data/latest`;
  const vastaus = await fetch(url, {
    headers: {
      "x-api-key": avain,
      Accept: "application/json",
    },
    next: { revalidate: 180 },
  });
  if (!vastaus.ok) return null;
  const runko = (await vastaus.json()) as unknown;
  return viimeisinArvo(runko, datasetId);
}

const FINGRID_KYSELY_VALI_MS = 2100;

function odota(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Hakee tuotanto-MW:n Fingridistä. Palauttaa null jos avain puuttuu tai kokonaistuotanto epäonnistuu. */
export async function haeFingridTuotantoNyt(): Promise<FingridTuotantoNakyma | null> {
  const avain = fingridAvain();
  if (!avain) return null;

  const jarjestys = [
    "kokonaistuotanto",
    "ydinvoima",
    "tuulivoima",
    "vesivoima",
  ] as const satisfies readonly (keyof typeof FINGRID_TUOTANTO_DATASETIT)[];

  try {
    const rivit: FingridTuotantoRivi[] = [];
    let kokonaistuotanto_mw: number | null = null;
    let paivitetty_pvm = new Date().toISOString();

    for (let i = 0; i < jarjestys.length; i++) {
      if (i > 0) await odota(FINGRID_KYSELY_VALI_MS);
      const avainDataset = jarjestys[i];
      const tieto = FINGRID_TUOTANTO_DATASETIT[avainDataset];
      const tulos = await haeDatasetViimeisin(tieto.id, avain);
      if (!tulos) {
        if (avainDataset === "kokonaistuotanto") return null;
        continue;
      }
      if (avainDataset === "kokonaistuotanto") {
        kokonaistuotanto_mw = tulos.mw;
        paivitetty_pvm = tulos.pvm;
      }
      rivit.push({
        datasetId: tieto.id,
        nimi: tieto.nimi,
        mw: tulos.mw,
        mittausPvm: tulos.pvm,
        lahde_url: tieto.lahde_url,
      });
    }

    if (kokonaistuotanto_mw == null) return null;
    return { paivitetty_pvm, rivit, kokonaistuotanto_mw };
  } catch {
    return null;
  }
}
