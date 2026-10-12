/**
 * Uuden hankkeen tuonnin kirjoituspolku: muutosehdotus → RPC-hyväksyntä,
 * sitten asiakirjat ja roolit. Ei suoria INSERT-kutsuja julkaistuihin tauluihin.
 */

import { hyvaksyMuutosehdotus, julkaiseDokumenttiLahdeMetatiedot } from "@/lib/supabase/hyvaksynta";
import { luoYllapitoAsiakas } from "@/lib/supabase/yllapito-asiakas";
import type { EhdotusSisalto } from "@/lib/ehdotus";
import {
  sitovuusLahdeTyypista,
  tuonninLahdeTyypit,
  tuontiEhdotusSisalloksi,
  type UusiHankeTuonti,
} from "@/lib/uusi-hanke-tuonti";
import type { LahdeTyyppi } from "@/lib/lahde-metatiedot";
import type { LahdeTyyppiPaatos, LahdeTyyppiRistiriita } from "@/lib/uusi-hanke-lahde-tyyppi-ristiriita";
import {
  haeLahdeTyyppiRistiriidat,
  kaytettavatLahdeTyypit,
} from "@/lib/uusi-hanke-lahde-tyyppi-ristiriita";

export type TuontiKirjoitusTulos =
  | {
      tila: "julkaistu";
      hanke_id: string;
      ehdotus_id: string;
      asiakirjoja: number;
      rooleja: number;
    }
  | {
      tila: "odottaa";
      ehdotus_id: string;
      hankevinkki_id?: string;
      syy: string;
    }
  | {
      tila: "hankevinkki";
      hankevinkki_id: string;
      ehdotus_id: string;
      syy: string;
    };

function tanaan(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Liittää hankkeeseen kaikki tuonnin lähde-URL:t dokumentteina.
 * lahde_tyyppi päivitetään vain, kun se on uusi tai valittu päätöksellä.
 * Ristiriitaa ei ylikirjoiteta hiljaa.
 */
async function liitaLahdeDokumentit(
  hankeId: string,
  tuonti: UusiHankeTuonti,
  kasittelija: string,
  tyypitUrlille: Map<string, LahdeTyyppi>,
  ristiriidat: LahdeTyyppiRistiriita[],
  paatokset: LahdeTyyppiPaatos[],
): Promise<number> {
  const sb = luoYllapitoAsiakas();
  const paatosMap = new Map(paatokset.map((p) => [p.url, p.valinta]));
  const ristiriitaUrlit = new Set(ristiriidat.map((r) => r.url));
  let n = 0;
  for (const a of tuonninLahdeTyypit(tuonti)) {
    const muoto = /\.pdf(\?|$)/i.test(a.url) ? "pdf" : "html";
    const otsikko =
      (a.otsikko && a.otsikko.trim()) ||
      tuonti.asiakirjat?.find((x) => x.url === a.url)?.otsikko ||
      a.url;
    const { data: dokId, error } = await sb.rpc("lisaa_hanke_dokumentti", {
      p_hanke_id: hankeId,
      p_url: a.url,
      p_otsikko: otsikko.slice(0, 200),
      p_laji: "muu",
      p_muoto: muoto,
      p_lahde_url: a.url,
      p_kasittelija: kasittelija,
    });
    if (error) throw new Error(`Asiakirja ${a.url}: ${error.message}`);
    if (!dokId) continue;

    const kaytettava = tyypitUrlille.get(a.url) ?? a.lahde_tyyppi;
    const onRistiriita = ristiriitaUrlit.has(a.url);
    const valinta = paatosMap.get(a.url);
    // Ristiriidassa: päivitä tyyppi vain jos valittiin JSON:n tyyppi.
    // Uusi dokumentti tai sama tyyppi: kirjoita JSON:n (tai päätetyn) tyyppi.
    const paivitaTyyppi = !onRistiriita || valinta === "json";
    if (paivitaTyyppi) {
      await julkaiseDokumenttiLahdeMetatiedot(
        {
          dokumenttiId: String(dokId),
          lahdeTyyppi: kaytettava,
          sitovuustaso: sitovuusLahdeTyypista(kaytettava),
          otsikko,
          ehdotusId: null,
        },
        kasittelija,
      );
    }
    n += 1;
  }
  return n;
}

async function liitaRoolit(
  hankeId: string,
  tuonti: UusiHankeTuonti,
  kasittelija: string,
): Promise<number> {
  const sb = luoYllapitoAsiakas();
  let n = 0;
  for (const r of tuonti.roolit ?? []) {
    const { data: orgId, error: orgVirhe } = await sb.rpc(
      "julkaise_organisaatio_ilman_ytunnusta",
      {
        p_nimi: r.organisaatio,
        p_lahde_url: r.lahde_url,
        p_vahvistettu_pvm: tanaan(),
        p_lainaus: r.lainaus,
        p_merkitty: "ihmisen_vahvistama",
      },
    );
    if (orgVirhe) throw new Error(`Organisaatio «${r.organisaatio}»: ${orgVirhe.message}`);
    if (!orgId) throw new Error(`Organisaatiota «${r.organisaatio}» ei saatu.`);

    const sisalto: EhdotusSisalto = {
      kentat: {},
      hanke_organisaatio: {
        organisaatio_id: String(orgId),
        organisaatio_nimi: r.organisaatio,
        rooli: r.rooli,
        lahde_url: r.lahde_url,
        lahteet: [
          {
            kentta: "organisaatio_id",
            lahde_url: r.lahde_url,
            lahde_sivu: null,
            lahde_laji: "html",
            vahvistettu_pvm: tanaan(),
            luottamus: "vahvistettu",
            lainaus: r.lainaus,
            merkitty: "ihmisen_vahvistama",
          },
          {
            kentta: "rooli",
            lahde_url: r.lahde_url,
            lahde_sivu: null,
            lahde_laji: "html",
            vahvistettu_pvm: tanaan(),
            luottamus: "vahvistettu",
            lainaus: r.lainaus,
            merkitty: "ihmisen_vahvistama",
          },
        ],
      },
    };

    const { data: ehdotus, error: eVirhe } = await sb
      .from("muutosehdotukset")
      .insert({
        tyyppi: "hanke_organisaatio",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
        lahde_url: r.lahde_url,
        huomautus: `Uusi hanke -tuonti: rooli ${r.rooli}`,
        tila: "odottaa",
        sisalto,
      })
      .select("id")
      .single();
    if (eVirhe || !ehdotus) {
      throw new Error(eVirhe?.message ?? "Rooliehdotuksen tallennus epäonnistui.");
    }
    await hyvaksyMuutosehdotus(ehdotus.id, kasittelija);
    n += 1;
  }
  return n;
}

async function luoHankevinkki(
  tuonti: UusiHankeTuonti,
  yhteenveto: string,
): Promise<string> {
  const sb = luoYllapitoAsiakas();
  const lahdeUrl =
    tuonti.kentat[0]?.lahteet[0]?.url ||
    tuonti.asiakirjat?.[0]?.url ||
    tuonti.toimija?.lahde_url;
  if (!lahdeUrl) throw new Error("Hankevinkkiin tarvitaan vähintään yksi URL.");

  const { data, error } = await sb
    .from("hankevinkit")
    .insert({
      kunta: tuonti.kunta,
      lahde_url: lahdeUrl,
      yhteenveto: yhteenveto.slice(0, 2000),
      tila: "selvitettava",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Hankevinkin luonti epäonnistui.");
  return data.id;
}

/**
 * Tallentaa odottavan uusi_hanke-ehdotuksen (ei hyväksy).
 * Jos ilmoituksen_id annettu, päivittää sen sisällön.
 */
async function tallennaEhdotus(
  tuonti: UusiHankeTuonti,
  sisalto: EhdotusSisalto,
  kasittelija: string,
  huomautusLisa: string,
): Promise<string> {
  const sb = luoYllapitoAsiakas();
  const lahdeUrl =
    sisalto.kentat.nimi?.lahde_url ||
    Object.values(sisalto.kentat)[0]?.lahde_url ||
    null;
  const huomautus = [tuonti.huomautus, huomautusLisa].filter(Boolean).join(" — ") || null;

  if (tuonti.ilmoituksen_id) {
    const { data: olemassa, error: lukuVirhe } = await sb
      .from("muutosehdotukset")
      .select("id, tila, tyyppi")
      .eq("id", tuonti.ilmoituksen_id)
      .maybeSingle();
    if (lukuVirhe) throw new Error(lukuVirhe.message);
    if (!olemassa) throw new Error("ilmoituksen_id: ehdotusta ei löytynyt.");
    if (olemassa.tila !== "odottaa") {
      throw new Error("ilmoituksen_id: ehdotus ei ole odottaa-tilassa.");
    }
    if (olemassa.tyyppi !== "uusi_hanke") {
      throw new Error("ilmoituksen_id: ehdotuksen tyyppi ei ole uusi_hanke.");
    }
    const { error: paivitysVirhe } = await sb
      .from("muutosehdotukset")
      .update({
        sisalto,
        huomautus,
        lahde_url: lahdeUrl,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
      })
      .eq("id", tuonti.ilmoituksen_id)
      .eq("tila", "odottaa");
    if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    return tuonti.ilmoituksen_id;
  }

  const { data, error } = await sb
    .from("muutosehdotukset")
    .insert({
      tyyppi: "uusi_hanke",
      hanke_id: null,
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: kasittelija,
      sisalto,
      tila: "odottaa",
      huomautus,
      lahde_url: lahdeUrl,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Ehdotuksen tallennus epäonnistui.");
  return data.id;
}

export async function kirjoitaUusiHankeTuonti(opts: {
  tuonti: UusiHankeTuonti;
  kasittelija: string;
  /** true = heikot lähteet → hankevinkki + odottaa, ei julkaisua */
  vainHeikotLahteet: boolean;
  /** Esikatselussa tehdyt lahde_tyyppi-ristiriidan valinnat. */
  lahdeTyyppiPaatokset?: LahdeTyyppiPaatos[];
}): Promise<TuontiKirjoitusTulos> {
  const { tuonti, kasittelija, vainHeikotLahteet } = opts;
  const sisalto = tuontiEhdotusSisalloksi(tuonti);

  if (Object.keys(sisalto.kentat).length === 0) {
    throw new Error("Tuonnissa ei ole julkaistavia kenttiä.");
  }

  const sb = luoYllapitoAsiakas();
  const ristiriidat = await haeLahdeTyyppiRistiriidat(sb, tuonti);
  const paatokset = opts.lahdeTyyppiPaatokset ?? [];
  if (ristiriidat.length > 0) {
    const paatosUrlit = new Set(paatokset.map((p) => p.url));
    for (const r of ristiriidat) {
      if (!paatosUrlit.has(r.url)) {
        throw new Error(
          `Valitse lähdetyyppi ristiriitaiselle URL:lle ennen vahvistusta: ${r.url}`,
        );
      }
    }
  }
  const tyypitUrlille = kaytettavatLahdeTyypit(tuonti, ristiriidat, paatokset);

  if (vainHeikotLahteet) {
    const syy =
      "Kaikki lähteet media/hankkeen_oma — ei suoraa julkaisua. Selvitys hankevinkissä ja ehdotus odottaa.";
    const hankevinkki_id = await luoHankevinkki(
      tuonti,
      `${tuonti.nimi} (${tuonti.kunta}): ${syy}. ${tuonti.huomautus ?? ""}`.trim(),
    );
    const ehdotus_id = await tallennaEhdotus(
      tuonti,
      sisalto,
      kasittelija,
      syy,
    );
    return { tila: "hankevinkki", hankevinkki_id, ehdotus_id, syy };
  }

  const ehdotus_id = await tallennaEhdotus(
    tuonti,
    sisalto,
    kasittelija,
    "Luotu ylläpidon Uusi hanke -tuonnilla.",
  );

  await hyvaksyMuutosehdotus(ehdotus_id, kasittelija);

  const { data: julkaistu, error } = await sb
    .from("muutosehdotukset")
    .select("hanke_id, tila")
    .eq("id", ehdotus_id)
    .single();
  if (error) throw new Error(error.message);
  if (!julkaistu?.hanke_id || julkaistu.tila !== "hyvaksytty") {
    throw new Error("Hyväksyntä ei tuottanut hanketta — tarkista jono.");
  }

  const hanke_id = julkaistu.hanke_id;
  const asiakirjoja = await liitaLahdeDokumentit(
    hanke_id,
    tuonti,
    kasittelija,
    tyypitUrlille,
    ristiriidat,
    paatokset,
  );
  const rooleja = await liitaRoolit(hanke_id, tuonti, kasittelija);

  return {
    tila: "julkaistu",
    hanke_id,
    ehdotus_id,
    asiakirjoja,
    rooleja,
  };
}
