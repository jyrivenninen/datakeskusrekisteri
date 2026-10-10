import { asiakirjaMetataInfo } from "@/lib/asiakirja-naytto";
import { naytaDokumenttiOtsikko } from "@/lib/lahde-metatiedot";
import type { Dokumentti, KenttaLahde } from "@/lib/supabase/tietokanta";

export type AsiakirjanKaytto = {
  taulu: KenttaLahde["taulu"];
  kentta: string;
  sivut: number[];
};

export type AsiakirjaListRivi = Dokumentti & {
  kattaa: AsiakirjanKaytto[];
  viimeisin_haku_pvm: string | null;
  meta_teksti: string;
};

function otsikkoAvain(otsikko: string): string {
  return otsikko.trim().toLocaleLowerCase("fi");
}

/** Yhdistää kenttäkäytöt usealle dokumentti-/URL-tunnisteelle. */
export function asiakirjanKayttoMonelle(
  lahteet: KenttaLahde[],
  tunnisteet: ReadonlyArray<Pick<Dokumentti, "id" | "url">>,
): AsiakirjanKaytto[] {
  const dokumenttiIdt = new Set(tunnisteet.map((d) => d.id));
  const urlit = new Set(tunnisteet.map((d) => d.url));
  const kartta = new Map<string, AsiakirjanKaytto>();

  for (const lahde of lahteet) {
    if (lahde.taulu === "dokumentit") continue;
    const osuu =
      (lahde.dokumentti_id != null && dokumenttiIdt.has(lahde.dokumentti_id)) ||
      urlit.has(lahde.lahde_url);
    if (!osuu) continue;

    const avain = `${lahde.taulu}:${lahde.kentta}`;
    const aiempi = kartta.get(avain);
    if (aiempi) {
      if (lahde.lahde_sivu != null && !aiempi.sivut.includes(lahde.lahde_sivu)) {
        aiempi.sivut.push(lahde.lahde_sivu);
        aiempi.sivut.sort((a, b) => a - b);
      }
    } else {
      kartta.set(avain, {
        taulu: lahde.taulu,
        kentta: lahde.kentta,
        sivut: lahde.lahde_sivu == null ? [] : [lahde.lahde_sivu],
      });
    }
  }

  return [...kartta.values()].sort((a, b) =>
    `${a.taulu}.${a.kentta}`.localeCompare(`${b.taulu}.${b.kentta}`, "fi"),
  );
}

function valitseEnsisijainenAsiakirja(a: AsiakirjaListRivi, b: AsiakirjaListRivi): AsiakirjaListRivi {
  if (a.kattaa.length !== b.kattaa.length) {
    return a.kattaa.length > b.kattaa.length ? a : b;
  }
  const aFi = a.url.includes("/fi/");
  const bFi = b.url.includes("/fi/");
  if (aFi !== bFi) return aFi ? a : b;
  if (a.url.length !== b.url.length) return a.url.length > b.url.length ? a : b;
  return a.url.localeCompare(b.url, "fi") <= 0 ? a : b;
}

function yhdistaKayttoListat(lista: AsiakirjaListRivi[]): AsiakirjanKaytto[] {
  const kartta = new Map<string, AsiakirjanKaytto>();
  for (const rivi of lista) {
    for (const kaytto of rivi.kattaa) {
      const avain = `${kaytto.taulu}:${kaytto.kentta}`;
      const aiempi = kartta.get(avain);
      if (aiempi) {
        for (const s of kaytto.sivut) {
          if (!aiempi.sivut.includes(s)) aiempi.sivut.push(s);
        }
        aiempi.sivut.sort((a, b) => a - b);
      } else {
        kartta.set(avain, {
          taulu: kaytto.taulu,
          kentta: kaytto.kentta,
          sivut: [...kaytto.sivut],
        });
      }
    }
  }
  return [...kartta.values()].sort((a, b) =>
    `${a.taulu}.${a.kentta}`.localeCompare(`${b.taulu}.${b.kentta}`, "fi"),
  );
}

function yhdistaRyhma(
  lista: AsiakirjaListRivi[],
  lahteet: KenttaLahde[],
): AsiakirjaListRivi {
  const tunnisteet = lista.map((r) => ({ id: r.id, url: r.url }));
  const ensisijainen = lista.reduce(valitseEnsisijainenAsiakirja);
  const kattaaLahteista = asiakirjanKayttoMonelle(lahteet, tunnisteet);
  const kattaa = yhdistaKayttoListat(
    lahteet.length > 0
      ? [...lista, { ...ensisijainen, kattaa: kattaaLahteista }]
      : lista,
  );
  const viimeisin_haku_pvm = lista
    .map((r) => r.viimeisin_haku_pvm)
    .filter((p): p is string => p != null)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    ...ensisijainen,
    kattaa,
    viimeisin_haku_pvm,
    meta_teksti: asiakirjaMetataInfo({
      laji: ensisijainen.laji,
      muoto: ensisijainen.muoto,
      kieli: ensisijainen.kieli,
      julkaisija: ensisijainen.julkaisija,
      julkaistu_pvm: ensisijainen.julkaistu_pvm,
      viimeisin_haku_pvm,
    }),
  };
}

/** Sama näyttöotsikko → yksi rivi (eri URL/alias). */
export function yhdistaSamannimisetAsiakirjat(
  rivit: AsiakirjaListRivi[],
  lahteet: KenttaLahde[],
): AsiakirjaListRivi[] {
  const jarjestys: string[] = [];
  const ryhmat = new Map<string, AsiakirjaListRivi[]>();

  for (const rivi of rivit) {
    const avain = otsikkoAvain(naytaDokumenttiOtsikko(rivi));
    if (!ryhmat.has(avain)) {
      ryhmat.set(avain, []);
      jarjestys.push(avain);
    }
    ryhmat.get(avain)!.push(rivi);
  }

  return jarjestys.map((avain) => {
    const lista = ryhmat.get(avain)!;
    return lista.length === 1 ? lista[0]! : yhdistaRyhma(lista, lahteet);
  });
}

export function kanoninenDokumenttiUrl(
  dokumentti: Dokumentti,
  byId: ReadonlyMap<string, Dokumentti>,
): string {
  let nykyinen = dokumentti;
  const vieraillut = new Set<string>();
  while (nykyinen.kanoninen_dokumentti_id) {
    if (vieraillut.has(nykyinen.id)) break;
    vieraillut.add(nykyinen.id);
    const kohde = byId.get(nykyinen.kanoninen_dokumentti_id);
    if (!kohde) break;
    nykyinen = kohde;
  }
  return nykyinen.url;
}
