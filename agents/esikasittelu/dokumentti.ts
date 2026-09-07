/** Dokumentista kenttien poiminta mallilla (7B.2). */
import { kysyMallia } from "../malli";

export type PoimittuKentta = {
  arvo: string;
  lainaus: string | null;
  sivu: number | null;
};

const JARJESTELMA = `Olet hankeilmoituksen esikäsittelijä. Poimi vain annetusta asiakirjasta.
Älä arvaa. Jos kenttää ei löydy, jätä se pois.
Palauta vain JSON ilman markdownia:
{"kentat":{"kentta_nimi":{"arvo":"...","lainaus":"sanatarkka lainaus tai null","sivu":numero tai null}}}`;

const TEKSTI_KATTO = 100_000;

const KENTTA_KUVAUKSET: Record<string, string> = {
  maakunta: "Maakunta",
  toimija_nimi: "Hankkeesta vastaava organisaatio",
  yva_diaarinumero: "YVA-diaarinumero",
  it_teho_mw: "IT-teho megawatteina",
  pinta_ala_ha: "Pinta-ala hehtaareina",
  sahkonkaytto_twh_a: "Sähkönkäyttö TWh/a",
  generaattorit_lkm: "Varavoimageneraattorien lukumäärä",
  generaattorit_kaytossa_max_lkm: "Generaattoreita yhtä aikaa enintään",
  generaattori_polttoaineteho_mw: "Generaattorin polttoaineteho MW",
};

function rajaaTeksti(teksti: string): string {
  if (teksti.length <= TEKSTI_KATTO) return teksti;
  return teksti.slice(0, TEKSTI_KATTO);
}

export async function poimiKentatDokumentista(
  hankeNimi: string,
  kunta: string,
  dokumenttiTeksti: string,
  tyhjatKentat: string[],
  lahdeUrl: string,
): Promise<Record<string, PoimittuKentta>> {
  if (tyhjatKentat.length === 0 || dokumenttiTeksti.trim().length === 0) {
    return {};
  }

  const kenttaLista = tyhjatKentat
    .map((k) => `- ${k}: ${KENTTA_KUVAUKSET[k] ?? k}`)
    .join("\n");

  const kehote = [
    `Hanke: ${hankeNimi}`,
    `Kunta: ${kunta}`,
    "",
    "Poimi vain nämä kentät jos asiakirjassa on eksplisiittinen tieto:",
    kenttaLista,
    "",
    "IT-teho (MW) ei ole sama kuin sähkönkäyttö (TWh/a).",
    "",
    "--- ASIAKIRJA ---",
    rajaaTeksti(dokumenttiTeksti),
  ].join("\n");

  const vastaus = await kysyMallia(kehote, {
    jarjestelma: JARJESTELMA,
    dokumenttiUrl: lahdeUrl,
  });

  const jsonLohko = vastaus.teksti.match(/\{[\s\S]*\}/);
  if (!jsonLohko) return {};

  let parsed: {
    kentat?: Record<
      string,
      { arvo?: string; lainaus?: string | null; sivu?: number | null }
    >;
  };
  try {
    parsed = JSON.parse(jsonLohko[0]) as typeof parsed;
  } catch {
    return {};
  }

  const tulokset: Record<string, PoimittuKentta> = {};
  for (const kentta of tyhjatKentat) {
    const rivi = parsed.kentat?.[kentta];
    const arvo = rivi?.arvo?.trim();
    if (!arvo) continue;
    const sivuRaaka: unknown = rivi?.sivu;
    const sivu =
      sivuRaaka == null || sivuRaaka === ""
        ? null
        : Number.isFinite(Number(sivuRaaka))
          ? Math.floor(Number(sivuRaaka))
          : null;
    tulokset[kentta] = {
      arvo,
      lainaus: rivi?.lainaus?.trim() || null,
      sivu,
    };
  }
  return tulokset;
}
