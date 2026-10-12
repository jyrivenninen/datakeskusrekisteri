/**
 * Lähdeselvitys 13 -poikkeamien ratkaisuvaihtoehdot läpikäyntiin.
 * Kolmas vaihtoehto on erotettu: uutta lähdettä ei liitetä kentälle automaattisesti.
 */

export const LS13_RATKAISU_IDT = [
  "vahvistaa_sanamuoto",
  "korjaa_arvo",
  "eri_asia_ei_liiteta",
  "eri_asia_hankkeen_asiakirja",
  "ristiriita",
] as const;

export type Ls13RatkaisuId = (typeof LS13_RATKAISU_IDT)[number];

export type Ls13RatkaisuVaihtoehto = {
  id: Ls13RatkaisuId;
  teksti: string;
  /** Lyhyt ohje ylläpitäjälle. */
  ohje: string;
};

/** Vanha kolmas vaihtoehto — näytetään kahdessa uudessa. */
export const LS13_VANHA_MOLEMMAT_JAAVAT =
  "lähteet tarkoittavat eri asiaa, molemmat jäävät";

export const LS13_RATKAISUVAIHTOEHDOT: Ls13RatkaisuVaihtoehto[] = [
  {
    id: "vahvistaa_sanamuoto",
    teksti: "asiakirja vahvistaa nykyisen arvon eri sanamuodolla",
    ohje: "Arvo säilyy; asiakirja liitetään kentän lähteeksi, koska se tukee samaa asiaa.",
  },
  {
    id: "korjaa_arvo",
    teksti: "arvo korjataan asiakirjan mukaiseksi, vanha lähde korvatuksi",
    ohje: "Kentän arvo vaihtuu asiakirjan mukaiseksi ja uusi lähde liitetään kentälle.",
  },
  {
    id: "eri_asia_ei_liiteta",
    teksti:
      "lähteet tarkoittavat eri asiaa, uutta lähdettä ei liitetä kentälle",
    ohje:
      "Ehdotus hylätään ja perustelu kirjataan. Uusi asiakirja ei tue kentän arvoa, joten sitä ei liitetä kentän lähteeksi.",
  },
  {
    id: "eri_asia_hankkeen_asiakirja",
    teksti:
      "lähteet tarkoittavat eri asiaa; uusi lähde liitetään hankkeen asiakirjoihin, ei kentän lähteeksi",
    ohje:
      "Ehdotus hylätään kentän osalta. Asiakirja lisätään hankkeen asiakirjalistaan, koska se on silti relevantti hankkeelle. Varmistusvalo ei nouse tästä.",
  },
  {
    id: "ristiriita",
    teksti: "lähteet ovat ristiriidassa, luottamus ristiriitaiseksi",
    ohje: "Lähteet kiistelevät samasta asiasta; luottamus merkitään ristiriitaiseksi.",
  },
];

/** Tekstit, jotka kirjoitetaan ehdotuksen sisalto.lahdeselvitys13.ratkaisuvaihtoehdot-listaan. */
export function ls13RatkaisuTekstit(): string[] {
  return LS13_RATKAISUVAIHTOEHDOT.map((v) => v.teksti);
}

export function ls13RatkaisuIdTekstista(teksti: string): Ls13RatkaisuId | null {
  const t = teksti.trim();
  if (t === LS13_VANHA_MOLEMMAT_JAAVAT) return null;
  const osuma = LS13_RATKAISUVAIHTOEHDOT.find((v) => v.teksti === t);
  return osuma?.id ?? null;
}

/** Näyttölista: korvaa vanhan "molemmat jäävät" kahdella uudella. */
export function normalisoiLs13RatkaisutNayttoon(
  raaka: string[] | null | undefined,
): Ls13RatkaisuVaihtoehto[] {
  if (!raaka?.length) return [...LS13_RATKAISUVAIHTOEHDOT];
  const naytto: Ls13RatkaisuVaihtoehto[] = [];
  let vanhaKorvattu = false;
  for (const t of raaka) {
    if (t === LS13_VANHA_MOLEMMAT_JAAVAT) {
      if (!vanhaKorvattu) {
        naytto.push(
          LS13_RATKAISUVAIHTOEHDOT.find((v) => v.id === "eri_asia_ei_liiteta")!,
          LS13_RATKAISUVAIHTOEHDOT.find(
            (v) => v.id === "eri_asia_hankkeen_asiakirja",
          )!,
        );
        vanhaKorvattu = true;
      }
      continue;
    }
    const id = ls13RatkaisuIdTekstista(t);
    if (id) {
      const v = LS13_RATKAISUVAIHTOEHDOT.find((x) => x.id === id)!;
      if (!naytto.some((x) => x.id === v.id)) naytto.push(v);
    }
  }
  return naytto.length > 0 ? naytto : [...LS13_RATKAISUVAIHTOEHDOT];
}
