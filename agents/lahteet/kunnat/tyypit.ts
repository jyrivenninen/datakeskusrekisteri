/** 7A.6 — yhteiset tyypit kuntien esityslistasovittimille. */

export type Kokous = {
  otsikko: string;
  url: string;
  alkaa?: Date;
  kuvaus?: string;
};

export type Asia = {
  otsikko: string;
  url: string;
  kuvaus?: string;
};

/** Kuntahavainnon ehdotetut asiakirjat (sisalto.kunta.dokumentit). */
export type KuntaDokumentti = {
  url: string;
  otsikko: string;
  muoto: "pdf" | "html" | "muu";
  laji: "kuulutus" | "muu";
};

export interface KuntaSovitin {
  tunnus: string;
  haeKokoukset(kuntaUrl: string, alkaen: Date): Promise<Kokous[]>;
  haeAsiat(kokousUrl: string): Promise<Asia[]>;
}

export type KuntaLahde = {
  lahdeId: string;
  kuntaId: string;
  kuntaKoodi: string;
  kuntaNimi: string;
  jarjestelma: string;
  perusUrl: string;
};

export type HankeKunnassa = {
  id: string;
  nimi: string;
  kunta: string;
  kunta_id: string | null;
};
