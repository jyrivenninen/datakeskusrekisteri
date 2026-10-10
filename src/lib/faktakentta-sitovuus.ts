/**
 * Lataa faktakentta_sitovuus -taulusta. Ei kovakoodattuja kenttänimiä.
 */

export type FaktakenttaSitovuusLuokka =
  | "sitovuus_merkittaa"
  | "sitovuus_ei_merkittava";

export type FaktakenttaSitovuusRivi = {
  taulu: string;
  kentta: string;
  luokka: FaktakenttaSitovuusLuokka;
};

export function rakennaSitovuusHaku(rivit: readonly FaktakenttaSitovuusRivi[]) {
  const tarkat = new Map<string, FaktakenttaSitovuusLuokka>();
  const kaikkiKentat = new Map<string, FaktakenttaSitovuusLuokka>();

  for (const rivi of rivit) {
    if (rivi.kentta === "*") {
      kaikkiKentat.set(rivi.taulu, rivi.luokka);
    } else {
      tarkat.set(`${rivi.taulu}:${rivi.kentta}`, rivi.luokka);
    }
  }

  /** true = varmistussääntö koskee, false = ei koske. */
  return function sitovuusMerkittaa(taulu: string, kentta: string): boolean {
    const tarkka = tarkat.get(`${taulu}:${kentta}`);
    if (tarkka === "sitovuus_ei_merkittava") return false;
    if (tarkka === "sitovuus_merkittaa") return true;
    const kaikki = kaikkiKentat.get(taulu);
    if (kaikki === "sitovuus_merkittaa") return true;
    if (kaikki === "sitovuus_ei_merkittava") return false;
    return false;
  };
}
