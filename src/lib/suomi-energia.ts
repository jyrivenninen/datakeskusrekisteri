/** Suomen sähköjärjestelmän vertailuluvut. Päivitetään käsin tilastojulkaisun mukaan. */

export const SUOMI_SAHKON_TUOTANTO_2024 = {
  vuosi: 2024,
  twh: 79.9,
  lahde_url: "https://stat.fi/fi/julkaisu/cm1kozm7fcpsg07vw63qs7u8i",
  lahde_nimi:
    "Tilastokeskus: Uusiutuvan energian osuus nousi 43 %:iin energian kokonaiskulutuksessa vuonna 2024",
} as const;

/**
 * Sähköntuotannon CO2-päästökerroin (g CO2/kWh), ei jäännösjakauma.
 * Fingrid julkaisee Tilastokeskuksen vuosikeskiarvon taulukossaan.
 */
export const SUOMI_SAHKONTUOTANTO_CO2_2024 = {
  vuosi: 2024,
  g_co2_kwh: 30,
  lahde_url: "https://www.fingrid.fi/sahkomarkkinainformaatio/co2/",
  lahde_nimi:
    "Fingrid: Tilastokeskuksen Suomen sähköntuotannon päästökerroin vuonna 2024",
} as const;

/** 1 TWh × g/kWh → tonnia CO2 (1 TWh = 10^9 kWh; 10^9 g = 1 000 t). */
export function twhKertoimellaCo2T(twh: number, gCo2Kwh: number): number {
  return twh * gCo2Kwh * 1_000;
}
