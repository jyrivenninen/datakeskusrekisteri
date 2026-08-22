import type { Hanke, HankeVaihe, Luottamus, MaaraajaTyyppi, Merkinta } from "@/lib/supabase/tietokanta";
import { HANKE_VAIHEET } from "@/lib/supabase/tietokanta";

export const VAIHE_NIMET: Record<HankeVaihe, string> = {
  esiselvitys: "Esiselvitys",
  yva_vireilla: "YVA vireillä",
  yva_paattynyt: "YVA päättynyt",
  kaavoitus: "Kaavoitus",
  lupamenettely: "Lupamenettely",
  rakenteilla: "Rakenteilla",
  toiminnassa: "Toiminnassa",
  peruttu: "Peruttu",
};

export const MAARAAJA_NIMET: Record<MaaraajaTyyppi, string> = {
  yva_mielipide: "YVA-mielipide",
  kaavamuistutus: "Kaavamuistutus",
  valitusaika: "Valitusaika",
  kuulutus: "Kuulutus",
  muu: "Muu määräaika",
};

export const LUOTTAMUS_NIMET: Record<Luottamus, string> = {
  vahvistettu: "Vahvistettu",
  epavarma: "Epävarma",
  ristiriitainen: "Ristiriitainen",
};

export const MERKINTA_NIMET: Record<Merkinta, string> = {
  koneen_ehdottama: "Koneen ehdottama",
  ihmisen_vahvistama: "Ihmisen vahvistama",
};

export const HANKE_KENTTA_NIMET: Record<string, string> = {
  nimi: "Nimi",
  kunta: "Kunta",
  maakunta: "Maakunta",
  sijainti: "Sijainti",
  vaihe: "Vaihe",
  teho_mw: "Teho (MW)",
  it_teho_mw: "IT-teho (MW)",
  pinta_ala_ha: "Pinta-ala (ha)",
  sahkonkaytto_twh_a: "Sähkönkäyttö (TWh/a)",
  generaattorit_lkm: "Varavoimageneraattorit (kpl)",
  generaattorit_kaytossa_max_lkm: "Generaattoreita yhtä aikaa enintään (kpl)",
  generaattori_polttoaineteho_mw: "Generaattorin polttoaineteho (MW)",
  toimija_organisaatio_id: "Hankkeesta vastaava",
  yva_diaarinumero: "YVA-diaarinumero",
};

export const KOKO_LUOKAT = [
  { arvo: "pieni", nimi: "Alle 50 MW" },
  { arvo: "keski", nimi: "50–200 MW" },
  { arvo: "suuri", nimi: "Yli 200 MW" },
  { arvo: "ei_ilmoitettu", nimi: "Tehoa ei merkitty" },
] as const;

export type KokoLuokka = (typeof KOKO_LUOKAT)[number]["arvo"];

export function onHankeVaihe(arvo: string): arvo is HankeVaihe {
  return (HANKE_VAIHEET as readonly string[]).includes(arvo);
}

export function onKokoLuokka(arvo: string): arvo is KokoLuokka {
  return KOKO_LUOKAT.some((luokka) => luokka.arvo === arvo);
}

export function hankeTehoMw(hanke: Pick<Hanke, "it_teho_mw" | "teho_mw">): number | null {
  if (hanke.it_teho_mw != null) return Number(hanke.it_teho_mw);
  if (hanke.teho_mw != null) return Number(hanke.teho_mw);
  return null;
}

export function hankeKokoLuokka(hanke: Pick<Hanke, "it_teho_mw" | "teho_mw">): KokoLuokka {
  const teho = hankeTehoMw(hanke);
  if (teho == null) return "ei_ilmoitettu";
  if (teho < 50) return "pieni";
  if (teho <= 200) return "keski";
  return "suuri";
}

export function muotoilePvm(arvo: string): string {
  const pvm = arvo.slice(0, 10);
  const [vuosi, kuukausi, paiva] = pvm.split("-");
  if (!vuosi || !kuukausi || !paiva) return arvo;
  return `${Number(paiva)}.${Number(kuukausi)}.${vuosi}`;
}

export function muotoileLuku(arvo: number | string): string {
  const luku = typeof arvo === "number" ? arvo : Number(arvo);
  if (Number.isNaN(luku)) return String(arvo);
  return new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 3 }).format(luku);
}
