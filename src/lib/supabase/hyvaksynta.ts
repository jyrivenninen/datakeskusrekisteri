import {
  kentanLuottamus,
  kenttaArvoksi,
  normalisoiKenttaTyhjennysSisalto,
  VAIHTOEHTO_KENTAT,
  type EhdotettuKentta,
  type EhdotusSisalto,
} from "@/lib/ehdotus";
import { geokoodaaOsoite, onSijaintiAluePolygon } from "@/lib/geokoodaus";
import { onKohdistusEpavarma } from "@/lib/kohdistus-epavarma";
import { ehdotuksenHankeIdt } from "@/lib/naytto";
import {
  hylkaaHenkilöOrganisaatioViesti,
  onOrganisaatioNimi,
} from "@/lib/organisaatio-nimi";
import { LAHDE_LAJIT, type LahdeLaji } from "@/lib/supabase/tietokanta";
import { luoYllapitoAsiakas } from "@/lib/supabase/yllapito-asiakas";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HyvaksyntaTulos = "ok" | "odottaa_kohdistusta";

function tanaan(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Näkyy ylläpidon lähdeajot-listassa (ei pelkkä console.warn). */
async function kirjaaGeokoodausEpaonnistuminen(
  supabase: SupabaseClient,
  opts: { hankeId: string | null; osoite: string; syy: string },
): Promise<void> {
  const kysely = new URL(
    "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search",
  );
  kysely.searchParams.set("text", opts.osoite);
  kysely.searchParams.set("lang", "fi");
  const virhe =
    (opts.hankeId ? `hanke ${opts.hankeId}: ` : "hanke puuttuu: ") + opts.syy;
  const { error } = await supabase.from("lahdeajot").insert({
    sovitin: "geokoodaus-sijainti-alue",
    tila: "epaonnistui",
    paattyi_pvm: new Date().toISOString(),
    osumia: 0,
    virhe: virhe.slice(0, 2000),
    kysely_url: kysely.toString(),
  });
  if (error) {
    // Älä peitä alkuperäistä geokoodausvirhettä lokikirjoituksen epäonnistuessa.
    console.error("[geokoodaus] lahdeajot-kirjaus epäonnistui:", error.message);
  }
}

function lahdeLajiRiville(tieto: EhdotettuKentta): LahdeLaji {
  if (tieto.lahde_laji) {
    if (!(LAHDE_LAJIT as readonly string[]).includes(tieto.lahde_laji)) {
      throw new Error("lahde_laji ei ole sallittu.");
    }
    return tieto.lahde_laji;
  }
  return tieto.lahde_sivu == null ? "html" : "dokumentti";
}

function lahdeRivi(
  kentta: string,
  tieto: EhdotettuKentta,
  oletusLuottamus: "vahvistettu" | "epavarma" | "ristiriitainen",
) {
  const lainaus =
    tieto.lainaus == null || tieto.lainaus === ""
      ? ""
      : String(tieto.lainaus);
  return {
    kentta,
    lahde_url: String(tieto.lahde_url),
    lahde_sivu: tieto.lahde_sivu == null ? "" : String(tieto.lahde_sivu),
    lahde_laji: lahdeLajiRiville(tieto),
    vahvistettu_pvm: tanaan(),
    luottamus: kentanLuottamus(tieto, oletusLuottamus),
    lainaus,
    merkitty: "ihmisen_vahvistama" as const,
  };
}

/** Agentin päätösehdotuksissa voi puuttua paattava_organisaatio_id-lähde. */
function taydennaPaatosOrganisaatioLahde(
  paatos: NonNullable<EhdotusSisalto["paatos"]>,
): NonNullable<EhdotusSisalto["paatos"]> {
  if (!paatos.paattava_organisaatio_nimi?.trim()) return paatos;
  if (paatos.paattava_organisaatio_id) return paatos;
  const onOrgLahde = paatos.lahteet.some(
    (l) => l.kentta === "paattava_organisaatio_id",
  );
  if (onOrgLahde) return paatos;
  const pohja =
    paatos.lahteet.find((l) => l.kentta === "kuvaus") ?? paatos.lahteet[0];
  if (!pohja) return paatos;
  return {
    ...paatos,
    lahteet: [
      ...paatos.lahteet,
      {
        ...pohja,
        kentta: "paattava_organisaatio_id",
        merkitty: "ihmisen_vahvistama" as const,
        lainaus: pohja.lainaus?.trim() || paatos.paattava_organisaatio_nimi,
      },
    ],
  };
}

function ristiriitaEiUudelleenPerustelu(teksti: string | undefined): string {
  const t = (teksti ?? "").trim();
  if (t.length < 12) {
    throw new Error(
      "Kirjaa miksi havainto ei nouse uudelleen (vähintään 12 merkkiä).",
    );
  }
  return t;
}

function ristiriitaSisaltoEiUudelleen(
  sisalto: EhdotusSisalto,
  perustelu: string,
): EhdotusSisalto {
  if (!sisalto.ristiriita) return sisalto;
  return {
    ...sisalto,
    ristiriita: {
      ...sisalto.ristiriita,
      ei_uudelleen: true,
      ei_uudelleen_perustelu: perustelu,
    },
  };
}

/**
 * Agentin teksti-sijainti_alue → koordinaatit + sijainti-lähde.
 * GeoJSON-polygonit jätetään ennalleen (RPC kirjoittaa sijainti_alue-sarakkeeseen).
 */
async function normalisoiSijaintiAlueKentat(
  kentat: Record<string, EhdotettuKentta>,
  hankeId: string | null,
  supabase: SupabaseClient,
): Promise<Record<string, EhdotettuKentta>> {
  const sijaintiAlue = kentat.sijainti_alue;
  if (!sijaintiAlue) return kentat;

  if (onSijaintiAluePolygon(sijaintiAlue.arvo)) {
    return kentat;
  }

  const osoite = String(sijaintiAlue.arvo ?? "").trim();
  const uusi = { ...kentat };
  delete uusi.sijainti_alue;

  if (!osoite) {
    return uusi;
  }

  let lat: number | null = null;
  let lon: number | null = null;
  let geokoodausUrl: string | null = null;
  let geokoodausLainausTeksti: string | null = null;

  let odotettuKunta: { nimi: string; koodi: string } | null = null;
  let olemassaLat: number | null = null;
  let olemassaLon: number | null = null;

  if (hankeId) {
    const { data: hanke, error: hVirhe } = await supabase
      .from("hankkeet")
      .select("kunta, sijainti_lat, sijainti_lon")
      .eq("id", hankeId)
      .maybeSingle();
    if (hVirhe) throw new Error(hVirhe.message);
    if (hanke?.kunta?.trim()) {
      const { data: kuntaRivi } = await supabase
        .from("kunnat")
        .select("nimi, koodi")
        .ilike("nimi", hanke.kunta.trim())
        .eq("voimassa", true)
        .maybeSingle();
      if (kuntaRivi?.nimi && kuntaRivi.koodi) {
        odotettuKunta = { nimi: kuntaRivi.nimi, koodi: kuntaRivi.koodi };
      }
    }
    if (
      hanke?.sijainti_lat != null &&
      hanke?.sijainti_lon != null &&
      Number.isFinite(Number(hanke.sijainti_lat)) &&
      Number.isFinite(Number(hanke.sijainti_lon))
    ) {
      olemassaLat = Number(hanke.sijainti_lat);
      olemassaLon = Number(hanke.sijainti_lon);
    }
  }

  if (!odotettuKunta) {
    await kirjaaGeokoodausEpaonnistuminen(supabase, {
      hankeId,
      osoite,
      syy: "Odotettua kuntaa ei saatu selville (hanke tai kunnat-taulu).",
    });
  } else {
    try {
      const tulos = await geokoodaaOsoite(osoite, odotettuKunta);
      lat = tulos.lat;
      lon = tulos.lon;
      geokoodausUrl = tulos.lahde_url;
      geokoodausLainausTeksti =
        `${osoite} → MML: paikka «${tulos.paikka_nimi ?? tulos.label ?? "?"}», ` +
        `kunta ${tulos.kunta_nimi ?? "?"} (${tulos.kunta_koodi ?? "?"})`;
    } catch (e) {
      await kirjaaGeokoodausEpaonnistuminen(supabase, {
        hankeId,
        osoite,
        syy:
          `Geokoodaus epäonnistui kuntaan ${odotettuKunta.nimi} (${odotettuKunta.koodi}): ` +
          (e instanceof Error ? e.message : String(e)),
      });
    }
  }

  // Älä kirjoita uutta pistettä ilman kuntavarmennettua geokoodausta.
  // Olemassa olevat koordinaatit kelpaavat vain varaksi (ei uutta pistettä).
  if (lat == null || lon == null) {
    if (olemassaLat != null && olemassaLon != null) {
      lat = olemassaLat;
      lon = olemassaLon;
      geokoodausUrl = null;
      geokoodausLainausTeksti = null;
    }
  }

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    const syy =
      `Osoitetta "${osoite}" ei voitu geokoodata luotettavasti` +
      (odotettuKunta
        ? ` kuntaan ${odotettuKunta.nimi} (${odotettuKunta.koodi})`
        : " (odotettua kuntaa ei saatu selville)") +
      ` eikä hankkeella ole olemassa olevia koordinaatteja.`;
    await kirjaaGeokoodausEpaonnistuminen(supabase, {
      hankeId,
      osoite,
      syy: `Ilman pistettä: ${syy}`,
    });
    throw new Error(syy);
  }

  const lainaus =
    sijaintiAlue.lainaus?.trim() ||
    geokoodausLainausTeksti ||
    osoite;

  const pohja: EhdotettuKentta = {
    ...sijaintiAlue,
    lainaus,
    lahde_url: geokoodausUrl ?? sijaintiAlue.lahde_url,
    luottamus: geokoodausUrl ? "epavarma" : kentanLuottamus(sijaintiAlue, "epavarma"),
  };

  uusi.sijainti_lat = { ...pohja, arvo: String(lat) };
  uusi.sijainti_lon = { ...pohja, arvo: String(lon) };
  return uusi;
}

export async function yhdistaHankkeetEhdotuksesta(
  ehdotusId: string,
  kasittelija: string,
  sailytettavaId: string,
  perustelu: string,
  lahdeUrl: string,
  vahvistusTyyppi: string,
) {
  const teksti = ristiriitaEiUudelleenPerustelu(perustelu);
  const url = lahdeUrl.trim();
  const tyyppi = vahvistusTyyppi.trim();
  if (!url) throw new Error("Yhdistys vaatii lähde-URL:n.");
  if (
    !["sama_kaavatunnus", "sama_yva", "asiakirja_molemmat", "jatkumo_asiakirja"].includes(
      tyyppi,
    )
  ) {
    throw new Error("Valitse yhdistyksen vahvistustyyppi.");
  }
  const supabase = luoYllapitoAsiakas();
  const { data: ehdotus, error } = await supabase
    .from("muutosehdotukset")
    .select("*")
    .eq("id", ehdotusId)
    .single();
  if (error || !ehdotus) throw new Error("Ehdotusta ei löytynyt.");
  if (ehdotus.tila !== "odottaa") throw new Error("Ehdotus on jo käsitelty.");
  if (ehdotus.tyyppi !== "ristiriita_havainto") {
    throw new Error("Yhdistäminen on vain ristiriitahavainnoille.");
  }
  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  const idt = ehdotuksenHankeIdt(ehdotus.hanke_id, sisalto.ristiriita);
  if (idt.length !== 2 || !idt.includes(sailytettavaId)) {
    throw new Error("Valitse toinen havainnon kahdesta hankkeesta säilytettäväksi.");
  }
  const siirrettavaId = idt.find((id) => id !== sailytettavaId);
  if (!siirrettavaId) throw new Error("Siirrettävä hanke puuttuu.");
  const { error: rpcVirhe } = await supabase.rpc("yhdista_hankkeet", {
    p_sailytettava: sailytettavaId,
    p_siirrettava: siirrettavaId,
    p_ehdotus_id: ehdotusId,
    p_kasittelija: kasittelija,
    p_perustelu: teksti,
    p_lahde_url: url,
    p_vahvistus_tyyppi: tyyppi,
  });
  if (rpcVirhe) throw new Error(rpcVirhe.message);
}

export async function hyvaksyMuutosehdotus(
  ehdotusId: string,
  kasittelija: string,
  valinnat?: {
    perustelu?: string;
    hanke_id?: string;
    dokumentit_url?: string[];
  },
): Promise<HyvaksyntaTulos> {
  const supabase = luoYllapitoAsiakas();
  const { data: ehdotus, error } = await supabase
    .from("muutosehdotukset")
    .select("*")
    .eq("id", ehdotusId)
    .single();

  if (error || !ehdotus) {
    throw new Error("Ehdotusta ei löytynyt.");
  }
  if (ehdotus.tila !== "odottaa" && ehdotus.tila !== "odottaa_kohdistusta") {
    throw new Error("Ehdotus on jo käsitelty.");
  }

  if (ehdotus.tyyppi === "lahde_tyyppi_havainto") {
    throw new Error(
      "Lähdetyypitys hyväksytään ehdotussivun lomakkeella tai läpikäynnissä, ei yleisellä hyväksynnällä.",
    );
  }

  if (ehdotus.hanke_id) {
    const { data: hanke, error: hankeVirhe } = await supabase
      .from("hankkeet")
      .select("yhdistetty_kohde_id")
      .eq("id", ehdotus.hanke_id)
      .maybeSingle();
    if (hankeVirhe) throw new Error(hankeVirhe.message);
    if (hanke?.yhdistetty_kohde_id) {
      throw new Error(
        "Hanke on poistettu duplikaattina — ehdotusta ei voi hyväksyä. Täydennä kohdehanketta.",
      );
    }
  }

  if (ehdotus.tyyppi === "ytj_havainto") {
    const ytj = (ehdotus.sisalto as EhdotusSisalto).ytj;
    if (ytj?.ehdota_tunnus) {
      const { error: rpcVirhe } = await supabase.rpc("julkaise_organisaation_y_tunnus", {
        p_organisaatio_id: ytj.organisaatio_id,
        p_y_tunnus: ytj.y_tunnus,
        p_lahde_url: ehdotus.lahde_url,
        p_lainaus: ytj.ytj_nimi ?? ytj.rekisterin_nimi,
        p_ehdotus_id: ehdotusId,
        p_kasittelija: kasittelija,
      });
      if (rpcVirhe) throw new Error(rpcVirhe.message);
      return "ok";
    }
  }

  if (ehdotus.tyyppi === "kentta_tarkistus") {
    const { error: rpcVirhe } = await supabase.rpc("julkaise_kentta_tarkistus", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return "ok";
  }

  if (ehdotus.tyyppi === "kentta_tyhjennys") {
    const alkuperainen = ehdotus.sisalto as EhdotusSisalto;
    if (Array.isArray(alkuperainen.tyhjennykset) && alkuperainen.tyhjennykset.length > 0) {
      const { error: rpcVirhe } = await supabase.rpc("julkaise_hanketason_tyhjennykset", {
        p_ehdotus_id: ehdotusId,
        p_kasittelija: kasittelija,
      });
      if (rpcVirhe) throw new Error(rpcVirhe.message);
      return "ok";
    }
    const korjattu = normalisoiKenttaTyhjennysSisalto(
      alkuperainen,
      ehdotus.hanke_id!,
      ehdotus.huomautus,
      ehdotus.lahde_url,
    );
    if (!korjattu.tyhjennys?.kentta) {
      throw new Error("Tyhjennys: kentta puuttuu");
    }
    if (!alkuperainen.tyhjennys?.kentta?.trim()) {
      const { error: paivitysVirhe } = await supabase
        .from("muutosehdotukset")
        .update({ sisalto: korjattu })
        .eq("id", ehdotusId)
        .eq("tila", "odottaa");
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_kentta_tyhjennys", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return "ok";
  }

  if (ehdotus.tyyppi === "paatos") {
    const alkuperainenSisalto = ehdotus.sisalto as EhdotusSisalto;
    let paatos = alkuperainenSisalto.paatos;
    if (!paatos?.kuvaus?.trim() || !paatos?.pvm?.trim()) {
      throw new Error("Paatos-ehdotuksesta puuttuvat kuvaus tai pvm.");
    }
    if (!Array.isArray(paatos.lahteet) || paatos.lahteet.length === 0) {
      throw new Error("Paatos-ehdotuksesta puuttuvat lähderivit (lahteet).");
    }
    paatos = taydennaPaatosOrganisaatioLahde(paatos);
    if (paatos !== alkuperainenSisalto.paatos) {
      const { error: paivitysVirhe } = await supabase
        .from("muutosehdotukset")
        .update({ sisalto: { ...alkuperainenSisalto, paatos } })
        .eq("id", ehdotusId)
        .eq("tila", "odottaa");
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_paatos", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return "ok";
  }

  if (ehdotus.tyyppi === "maaraaja") {
    const maaraaja = (ehdotus.sisalto as EhdotusSisalto).maaraaja;
    if (!maaraaja?.tyyppi?.trim() || !maaraaja?.paattyy_pvm?.trim()) {
      throw new Error("Määräaikaehdotuksesta puuttuvat tyyppi tai päättymispäivä.");
    }
    if (!Array.isArray(maaraaja.lahteet) || maaraaja.lahteet.length === 0) {
      throw new Error("Määräaikaehdotuksesta puuttuvat lähderivit (lahteet).");
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_maaraaja", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return "ok";
  }

  if (ehdotus.tyyppi === "hanke_organisaatio") {
    const rooli = (ehdotus.sisalto as EhdotusSisalto).hanke_organisaatio;
    if (!rooli?.organisaatio_id?.trim() || !rooli?.rooli?.trim()) {
      throw new Error("Hanke–organisaatio-ehdotuksesta puuttuu organisaatio tai rooli.");
    }
    if (!Array.isArray(rooli.lahteet) || rooli.lahteet.length === 0) {
      throw new Error("Hanke–organisaatio-ehdotuksesta puuttuvat lähderivit (lahteet).");
    }
    const orgNimi = rooli.organisaatio_nimi?.trim();
    if (orgNimi && !onOrganisaatioNimi(orgNimi)) {
      throw new Error(hylkaaHenkilöOrganisaatioViesti(orgNimi));
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_hanke_organisaatio", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return "ok";
  }

  if (
    ehdotus.tyyppi === "linkki_rikki" ||
    ehdotus.tyyppi === "ryhti_havainto" ||
    ehdotus.tyyppi === "ytj_havainto" ||
    ehdotus.tyyppi === "mml_havainto" ||
    ehdotus.tyyppi === "dokumentti_muuttunut" ||
    ehdotus.tyyppi === "ristiriita_havainto"
  ) {
    const sisalto = ehdotus.sisalto as EhdotusSisalto;
    let ristiriitaPaivitys: Record<string, unknown> = {};
    if (ehdotus.tyyppi === "ristiriita_havainto") {
      const perustelu = ristiriitaEiUudelleenPerustelu(valinnat?.perustelu);
      ristiriitaPaivitys = {
        sisalto: ristiriitaSisaltoEiUudelleen(sisalto, perustelu),
        perustelu,
      };
    }
    const { error: paivitysVirhe } = await supabase
      .from("muutosehdotukset")
      .update({
        tila: "hyvaksytty",
        kasitelty_pvm: new Date().toISOString(),
        kasittelija,
        ...ristiriitaPaivitys,
      })
      .eq("id", ehdotusId)
      .eq("tila", "odottaa");
    if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    return "ok";
  }

  if (ehdotus.tyyppi === "kunta_havainto") {
    const valittuHanke = valinnat?.hanke_id?.trim() || null;
    const tuotuHanke = (ehdotus.hanke_id as string | null) ?? null;
    const dokumentitUrl = valinnat?.dokumentit_url ?? [];
    const epavarma = onKohdistusEpavarma({
      huomautus: ehdotus.huomautus as string | null,
      sisalto: ehdotus.sisalto,
    });

    // Epävarma kohdistus: älä kiinnitä tuontihankkeeseen. Vaatii eri hankkeen
    // valinnan (tai kohdistusjonosta tulevan eksplisiittisen valinnan).
    if (epavarma) {
      const kohdistettu =
        Boolean(valittuHanke) &&
        (ehdotus.tila === "odottaa_kohdistusta" || valittuHanke !== tuotuHanke);
      if (!kohdistettu) {
        const sisalto = {
          ...((ehdotus.sisalto as EhdotusSisalto) ?? { kentat: {} }),
          kohdistus_epavarma: true,
        };
        const { error: jonoVirhe } = await supabase
          .from("muutosehdotukset")
          .update({
            tila: "odottaa_kohdistusta",
            sisalto,
          })
          .eq("id", ehdotusId)
          .in("tila", ["odottaa", "odottaa_kohdistusta"]);
        if (jonoVirhe) throw new Error(jonoVirhe.message);
        return "odottaa_kohdistusta";
      }
    }

    const hankeId = valittuHanke || tuotuHanke;
    if (dokumentitUrl.length > 0 && !hankeId) {
      throw new Error("Asiakirjojen julkaisu vaatii hankkeen valinnan.");
    }
    if (ehdotus.tila === "odottaa_kohdistusta" && !hankeId) {
      throw new Error("Valitse hanke, johon asiakirja kohdistetaan.");
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_kunta_havainto", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
      p_hanke_id: hankeId,
      p_dokumentit_url: dokumentitUrl,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return "ok";
  }

  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  let kentat = sisalto.kentat ?? {};
  kentat = await normalisoiSijaintiAlueKentat(kentat, ehdotus.hanke_id, supabase);
  const vaihtoehdot = sisalto.vaihtoehdot ?? {};
  const kuvat = sisalto.kuvat ?? [];

  if (kuvat.length > 0) {
    if (Object.keys(kentat).length > 0 || Object.keys(vaihtoehdot).length > 0) {
      throw new Error("Kuvaehdotusta ei voi yhdistää muihin kenttiin.");
    }
    if (!ehdotus.hanke_id) {
      throw new Error("Kuvaehdotukselta puuttuu hanke.");
    }
    const kuvaRivit = kuvat.map((kuva) => {
      const pohja: EhdotettuKentta = {
        arvo: kuva.kuva_url,
        lahde_url: kuva.lahde_url,
        lahde_sivu: kuva.lahde_sivu,
        lainaus: kuva.lainaus,
        luottamus: kuva.luottamus,
      };
      return {
        kuva_url: kuva.kuva_url,
        kuvateksti: kuva.kuvateksti,
        kuvaaja: kuva.kuvaaja,
        lahteet: [
          lahdeRivi("kuva_url", { ...pohja, arvo: kuva.kuva_url }, "vahvistettu"),
          lahdeRivi("kuvateksti", { ...pohja, arvo: kuva.kuvateksti }, "vahvistettu"),
          lahdeRivi("kuvaaja", { ...pohja, arvo: kuva.kuvaaja }, "vahvistettu"),
        ],
      };
    });
    const { error: kuvaVirhe } = await supabase.rpc("julkaise_hanke_kuvat", {
      p_hanke_id: ehdotus.hanke_id,
      p_kuvat: kuvaRivit,
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (kuvaVirhe) throw new Error(kuvaVirhe.message);
    return "ok";
  }

  if (sisalto.vaatii_lukeminen) {
    throw new Error("Ehdotus vaatii lähteen lukemista ennen hyväksyntää.");
  }
  if (Array.isArray(sisalto.rakentamisvaiheet) && sisalto.rakentamisvaiheet.length > 0) {
    const { error: vaiheVirhe } = await supabase.rpc("julkaise_rakentamisvaiheet", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (vaiheVirhe) throw new Error(vaiheVirhe.message);
    return "ok";
  }
  if (Array.isArray(sisalto.asiakirjat) && sisalto.asiakirjat.length > 0) {
    const { error: asiakirjaVirhe } = await supabase.rpc("julkaise_hanke_asiakirjat", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (asiakirjaVirhe) throw new Error(asiakirjaVirhe.message);
    return "ok";
  }

  const vainHuomautus =
    Object.keys(kentat).length === 1 &&
    Boolean(kentat.huomautus) &&
    Object.keys(vaihtoehdot).length === 0;
  if (vainHuomautus || sisalto.huomio === "hanke-huomautus") {
    const { error: huomVirhe } = await supabase.rpc("julkaise_hanke_huomautus", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (huomVirhe) throw new Error(huomVirhe.message);
    return "ok";
  }

  const sijaintiKentat = Object.keys(kentat).filter(
    (k) => k === "sijaintiperustelu" || k === "muut_sijainnit",
  );
  if (
    sijaintiKentat.length > 0 &&
    sijaintiKentat.length === Object.keys(kentat).length &&
    Object.keys(vaihtoehdot).length === 0
  ) {
    const { error: sijVirhe } = await supabase.rpc("julkaise_sijaintiperustelu", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (sijVirhe) throw new Error(sijVirhe.message);
    return "ok";
  }

  if (Object.keys(kentat).length === 0 && Object.keys(vaihtoehdot).length === 0) {
    if ((sisalto.lisalahteet?.length ?? 0) > 0) {
      const { error: linkkiVirhe } = await supabase
        .from("muutosehdotukset")
        .update({
          tila: "hyvaksytty",
          kasitelty_pvm: new Date().toISOString(),
          kasittelija,
        })
        .eq("id", ehdotusId)
        .eq("tila", "odottaa");
      if (linkkiVirhe) throw new Error(linkkiVirhe.message);
      return "ok";
    }
    throw new Error("Ehdotuksessa ei ole kenttiä.");
  }

  const SIJAINTI_KENTAT = new Set([
    "sijainti_lat",
    "sijainti_lon",
    "sijainti_alue_tyyppi",
    "sijainti_alue",
  ]);

  const hanke: Record<string, string | object> = {};
  for (const [kentta, tieto] of Object.entries(kentat)) {
    if (kentta === "toimija_nimi") {
      hanke.toimija_nimi = tieto.arvo;
      continue;
    }
    if (kentta === "sijainti_alue" && onSijaintiAluePolygon(tieto.arvo)) {
      hanke.sijainti_alue = tieto.arvo as unknown as object;
      continue;
    }
    const arvo = kenttaArvoksi(kentta, tieto.arvo);
    hanke[kentta] = arvo == null ? "" : String(arvo);
  }

  const lahteet = Object.entries(kentat)
    .filter(([kentta]) => !SIJAINTI_KENTAT.has(kentta))
    .flatMap(([kentta, tieto]) => {
      const kohde =
        kentta === "toimija_nimi" ? "toimija_organisaatio_id" : kentta;
      const rivit = [lahdeRivi(kohde, tieto, "vahvistettu")];
      for (const lisa of tieto.lisalahteet ?? []) {
        rivit.push(
          lahdeRivi(
            kohde,
            {
              arvo: tieto.arvo,
              lahde_url: lisa.lahde_url,
              lahde_sivu: lisa.lahde_sivu,
              lainaus: lisa.lainaus,
              luottamus: lisa.luottamus ?? tieto.luottamus,
              lahde_laji: lisa.lahde_laji ?? tieto.lahde_laji,
            },
            "vahvistettu",
          ),
        );
      }
      return rivit;
    });
  const sijaintiLahde =
    kentat.sijainti_lat ??
    kentat.sijainti_lon ??
    kentat.sijainti_alue_tyyppi ??
    (kentat.sijainti_alue && onSijaintiAluePolygon(kentat.sijainti_alue.arvo)
      ? kentat.sijainti_alue
      : undefined);
  if (sijaintiLahde) {
    lahteet.push(lahdeRivi("sijainti", sijaintiLahde, "epavarma"));
  }

  const sallitut = new Set<string>(VAIHTOEHTO_KENTAT);
  const vaihtoehtoRivit = Object.entries(vaihtoehdot).map(([tunnus, kentatVe]) => {
    const rivinKentat: Record<string, string> = {};
    const rivinLahteet = [];
    const tunnusLahde = kentatVe.tunnus ?? Object.values(kentatVe)[0];
    if (!tunnusLahde) {
      throw new Error(`Vaihtoehdolta ${tunnus} puuttuvat kentät.`);
    }
    rivinLahteet.push(lahdeRivi("tunnus", tunnusLahde, "epavarma"));
    for (const [kentta, tieto] of Object.entries(kentatVe)) {
      if (kentta === "tunnus") continue;
      if (!sallitut.has(kentta)) {
        throw new Error(`Vaihtoehdon kenttä ei ole sallittu: ${kentta}`);
      }
      const arvo = kenttaArvoksi(kentta, tieto.arvo);
      rivinKentat[kentta] = arvo == null ? "" : String(arvo);
      rivinLahteet.push(lahdeRivi(kentta, tieto, "epavarma"));
    }
    return { tunnus, kentat: rivinKentat, lahteet: rivinLahteet };
  });

  const { error: rpcVirhe } = await supabase.rpc("julkaise_ehdotetut_tiedot", {
    p_tyyppi: ehdotus.tyyppi,
    p_hanke_id: ehdotus.hanke_id,
    p_hanke: hanke,
    p_lahteet: lahteet,
    p_ehdotus_id: ehdotusId,
    p_kasittelija: kasittelija,
    p_vaihtoehdot: vaihtoehtoRivit,
  });
  if (rpcVirhe) {
    throw new Error(rpcVirhe.message);
  }
  return "ok";
}

export async function kuitaaHankeKentat(
  hankeId: string,
  kentat: string[],
  kasittelija: string,
  luottamus: "vahvistettu" | "epavarma" = "vahvistettu",
) {
  const supabase = luoYllapitoAsiakas();
  const { data, error } = await supabase.rpc("kuitaa_hanke_kentat", {
    p_hanke_id: hankeId,
    p_kentat: kentat,
    p_kasittelija: kasittelija,
    p_luottamus: luottamus,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

/** Luottamus ilman kuittausta — merkintä pysyy koneen ehdottamana. */
export async function paivitaKuittausLuottamus(
  hankeId: string,
  kentta: string,
  luottamus: "vahvistettu" | "epavarma" | "ristiriitainen",
) {
  const supabase = luoYllapitoAsiakas();
  const { data, error } = await supabase
    .from("kentta_lahteet")
    .update({ luottamus })
    .eq("taulu", "hankkeet")
    .eq("rivi_id", hankeId)
    .eq("kentta", kentta)
    .eq("merkitty", "koneen_ehdottama")
    .select("kentta");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/** Korjaa julkaistun kentän lähde-URL (esim. siirtynyt PDF). Arvoa ei muuteta. */
export async function paivitaKenttaLahdeUrl(
  taulu: string,
  riviId: string,
  kentta: string,
  vanhaUrl: string,
  uusiUrl: string,
) {
  const uusi = uusiUrl.trim();
  if (!/^https?:\/\//i.test(uusi)) {
    throw new Error("Uusi lähde-URL puuttuu tai on virheellinen.");
  }
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("korjaa_kentta_lahde_url", {
    p_taulu: taulu,
    p_rivi_id: riviId,
    p_kentta: kentta,
    p_vanha_url: vanhaUrl.trim(),
    p_uusi_url: uusi,
  });
  if (error) throw new Error(error.message);
}

export async function piilotaHankeKuva(kuvaId: string, kasittelija: string) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("piilota_hanke_kuva", {
    p_kuva_id: kuvaId,
    p_kasittelija: kasittelija,
  });
  if (error) throw new Error(error.message);
}

export async function julkaiseHanke(hankeId: string, kasittelija: string) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("julkaise_hanke", {
    p_hanke_id: hankeId,
    p_kasittelija: kasittelija,
  });
  if (error) throw new Error(error.message);
}

export async function merkitseHankeDuplikaatiksi(
  duplikaattiId: string,
  kohdeId: string,
  kasittelija: string,
  perustelu: string,
  lahdeUrl: string,
  vahvistusTyyppi: string,
) {
  const url = lahdeUrl.trim();
  const tyyppi = vahvistusTyyppi.trim();
  if (!url) throw new Error("Duplikaattimerkintä vaatii lähde-URL:n.");
  if (
    !["sama_kaavatunnus", "sama_yva", "asiakirja_molemmat", "jatkumo_asiakirja"].includes(
      tyyppi,
    )
  ) {
    throw new Error("Valitse yhdistyksen vahvistustyyppi.");
  }
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("merkitse_hanke_duplikaatiksi", {
    p_duplikaatti: duplikaattiId,
    p_kohde: kohdeId,
    p_kasittelija: kasittelija,
    p_perustelu: perustelu,
    p_lahde_url: url,
    p_vahvistus_tyyppi: tyyppi,
  });
  if (error) throw new Error(error.message);
}

export async function julkaiseDokumenttiLahdeMetatiedot(
  opts: {
    dokumenttiId: string;
    lahdeTyyppi: string;
    sitovuustaso: string;
    otsikko: string;
    ehdotusId: string | null;
  },
  kasittelija: string,
) {
  const supabase = luoYllapitoAsiakas();
  const otsikko = opts.otsikko.trim();
  const { error } = await supabase.rpc("julkaise_dokumentti_lahde_metatiedot", {
    p_dokumentti_id: opts.dokumenttiId,
    p_lahde_tyyppi: opts.lahdeTyyppi,
    p_sitovuustaso: opts.sitovuustaso,
    p_otsikko: otsikko || null,
    p_ehdotus_id: opts.ehdotusId,
    p_kasittelija: kasittelija,
  });
  if (error) throw new Error(error.message);
}

export async function hylkaaMuutosehdotus(
  ehdotusId: string,
  kasittelija: string,
  perustelu: string,
) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase
    .from("muutosehdotukset")
    .update({
      tila: "hylatty",
      kasitelty_pvm: new Date().toISOString(),
      kasittelija,
      perustelu: perustelu.trim() || "Hylätty ylläpidossa.",
    })
    .eq("id", ehdotusId)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}